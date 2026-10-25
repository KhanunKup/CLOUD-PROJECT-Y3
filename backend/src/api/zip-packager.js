// backend/src/api/zip-packager.js
// Lightweight, zero-dependency ZIP archive generator using Node.js built-in zlib

const zlib = require('zlib');

// Precomputed CRC-32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function calculateCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(dateInput) {
  const d = dateInput instanceof Date ? dateInput : (dateInput ? new Date(dateInput) : new Date());
  const valid = !isNaN(d.getTime()) ? d : new Date();
  const time = ((valid.getHours() << 11) | (valid.getMinutes() << 5) | (valid.getSeconds() >> 1)) & 0xffff;
  const date = (((valid.getFullYear() - 1980) << 9) | ((valid.getMonth() + 1) << 5) | valid.getDate()) & 0xffff;
  return { time, date };
}

/**
 * Creates a valid PKZIP 2.0 archive buffer from a list of file entries.
 * @param {Array<{path: string, content: Buffer|string, date?: Date}>} entries
 * @returns {Buffer} ZIP archive buffer
 */
function createZipArchive(entries = []) {
  const localFileChunks = [];
  const centralDirChunks = [];
  let currentOffset = 0;

  const validEntries = Array.isArray(entries) ? entries : [];

  for (const entry of validEntries) {
    // Normalize path: forward slashes, trim leading slash
    let entryPath = (entry.path || 'file').replace(/\\/g, '/').replace(/^\/+/, '');
    const isDir = entryPath.endsWith('/') || entry.isFolder;
    if (isDir && !entryPath.endsWith('/')) {
      entryPath += '/';
    }

    const rawContent = isDir
      ? Buffer.alloc(0)
      : (Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content || ''));

    const uncompressedSize = rawContent.length;
    const crc = isDir ? 0 : calculateCrc32(rawContent);

    // Compress using deflateRaw
    let compressedContent = rawContent;
    let compressionMethod = 0; // Stored (no compression)

    if (!isDir && uncompressedSize > 0) {
      try {
        const deflated = zlib.deflateRawSync(rawContent, { level: 6 });
        compressedContent = deflated;
        compressionMethod = 8; // Deflate
      } catch (_) {
        compressedContent = rawContent;
        compressionMethod = 0;
      }
    }

    const compressedSize = compressedContent.length;
    const pathBuffer = Buffer.from(entryPath, 'utf8');
    const { time: dosTime, date: dosDate } = toDosDateTime(entry.date);

    // 1. Local File Header (30 bytes + pathBuffer.length)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature PK\x03\x04
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6);     // General purpose flag (bit 11 = UTF-8)
    localHeader.writeUInt16LE(compressionMethod, 8); // Method
    localHeader.writeUInt16LE(dosTime, 10);   // Last mod time
    localHeader.writeUInt16LE(dosDate, 12);   // Last mod date
    localHeader.writeUInt32LE(crc, 14);       // CRC-32
    localHeader.writeUInt32LE(compressedSize, 18);   // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(pathBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28);         // Extra field length

    localFileChunks.push(localHeader, pathBuffer, compressedContent);

    // 2. Central Directory Header (46 bytes + pathBuffer.length)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature PK\x01\x02
    centralHeader.writeUInt16LE(20, 4);         // Version made by: 2.0
    centralHeader.writeUInt16LE(20, 6);         // Version needed: 2.0
    centralHeader.writeUInt16LE(0x0800, 8);     // General purpose flag (UTF-8)
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(pathBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);         // Extra field length
    centralHeader.writeUInt16LE(0, 32);         // File comment length
    centralHeader.writeUInt16LE(0, 34);         // Disk number start
    centralHeader.writeUInt16LE(0, 36);         // Internal attributes
    centralHeader.writeUInt32LE(isDir ? 0x10 : 0x20, 38); // External attributes (Directory flag)
    centralHeader.writeUInt32LE(currentOffset, 42); // Offset of local header

    centralDirChunks.push(centralHeader, pathBuffer);

    // Update current offset for next entry
    currentOffset += 30 + pathBuffer.length + compressedSize;
  }

  const centralDirBuffer = Buffer.concat(centralDirChunks);
  const centralDirSize = centralDirBuffer.length;
  const centralDirOffset = currentOffset;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Signature PK\x05\x06
  eocd.writeUInt16LE(0, 4);          // Disk number
  eocd.writeUInt16LE(0, 6);          // Central dir start disk
  eocd.writeUInt16LE(validEntries.length, 8);  // Central dir records on this disk
  eocd.writeUInt16LE(validEntries.length, 10); // Total central dir records
  eocd.writeUInt32LE(centralDirSize, 12);      // Size of central dir
  eocd.writeUInt32LE(centralDirOffset, 16);    // Offset of central dir
  eocd.writeUInt16LE(0, 20);         // Comment length

  return Buffer.concat([...localFileChunks, centralDirBuffer, eocd]);
}

/**
 * Streams ZIP archive directly to an HTTP response stream chunk-by-chunk.
 * Prevents allocating massive multi-megabyte / multi-gigabyte buffers in server heap.
 */
function pipeZipArchive(entries = [], res) {
  const centralDirChunks = [];
  let currentOffset = 0;
  const validEntries = Array.isArray(entries) ? entries : [];

  for (const entry of validEntries) {
    let entryPath = (entry.path || 'file').replace(/\\/g, '/').replace(/^\/+/, '');
    const isDir = entryPath.endsWith('/') || entry.isFolder;
    if (isDir && !entryPath.endsWith('/')) {
      entryPath += '/';
    }

    const rawContent = isDir
      ? Buffer.alloc(0)
      : (Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content || ''));

    const uncompressedSize = rawContent.length;
    const crc = isDir ? 0 : calculateCrc32(rawContent);

    let compressedContent = rawContent;
    let compressionMethod = 0;

    if (!isDir && uncompressedSize > 0) {
      try {
        const deflated = zlib.deflateRawSync(rawContent, { level: 6 });
        compressedContent = deflated;
        compressionMethod = 8;
      } catch (_) {
        compressedContent = rawContent;
        compressionMethod = 0;
      }
    }

    const compressedSize = compressedContent.length;
    const pathBuffer = Buffer.from(entryPath, 'utf8');
    const { time: dosTime, date: dosDate } = toDosDateTime(entry.date);

    // 1. Local File Header
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(pathBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    // Stream out immediately to client
    res.write(localHeader);
    res.write(pathBuffer);
    if (compressedSize > 0) {
      res.write(compressedContent);
    }

    // 2. Central Directory Header
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(pathBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(isDir ? 0x10 : 0x20, 38);
    centralHeader.writeUInt32LE(currentOffset, 42);

    centralDirChunks.push(centralHeader, pathBuffer);
    currentOffset += 30 + pathBuffer.length + compressedSize;
  }

  // 3. Central Directory & End of Central Directory
  for (const chunk of centralDirChunks) {
    res.write(chunk);
  }
  const centralDirBuffer = Buffer.concat(centralDirChunks);
  const centralDirSize = centralDirBuffer.length;
  const centralDirOffset = currentOffset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(validEntries.length, 8);
  eocd.writeUInt16LE(validEntries.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  res.write(eocd);
  res.end();
}

module.exports = {
  createZipArchive,
  pipeZipArchive,
  calculateCrc32
};
