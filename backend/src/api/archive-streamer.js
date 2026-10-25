// backend/src/api/archive-streamer.js
// Deep module for streaming PKZIP archives directly to clients with minimal memory footprint

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

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

class ArchiveStreamer {
  constructor({
    isMockMode = true,
    storage = null,
    s3Client = null,
    storageBucket = '',
    fileRepository = null,
    getContent = null
  } = {}) {
    this.isMockMode = isMockMode;
    this.storage = storage;
    this.s3Client = s3Client;
    this.storageBucket = storageBucket;
    this.fileRepository = fileRepository;
    this.customGetContent = getContent;
  }

  /**
   * Helper to retrieve raw buffer for a file item across storage modes
   */
  async getFileBuffer(file) {
    if (this.customGetContent) {
      return await this.customGetContent(file);
    }

    if (this.isMockMode) {
      if (this.storage && this.storage.findStoredFile) {
        const storedPath = this.storage.findStoredFile(file);
        if (storedPath && fs.existsSync(storedPath)) {
          try {
            return fs.readFileSync(storedPath);
          } catch (_) {}
        }
      }
      if (file.content) {
        return Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
      }
      return Buffer.from(`Sample content for ${file.filename}`);
    }

    // AWS Cloud Mode: Fetch from S3
    if (this.s3Client && this.storageBucket && file.s3_key) {
      try {
        const s3Res = await this.s3Client.send(new GetObjectCommand({
          Bucket: this.storageBucket,
          Key: file.s3_key
        }));
        if (s3Res.Body) {
          const chunks = [];
          for await (const chunk of s3Res.Body) {
            chunks.push(chunk);
          }
          return Buffer.concat(chunks);
        }
      } catch (err) {
        console.error(`[ArchiveStreamer] Failed fetching S3 key ${file.s3_key}:`, err.message);
      }
    }

    return Buffer.alloc(0);
  }

  /**
   * Resolve entries (hierarchical paths + content) for single folder or multiple files
   */
  async resolveEntries({ rootFolderId, fileIds, user }) {
    let allUserFiles = [];
    if (this.storage && this.storage.loadMockFiles) {
      allUserFiles = this.storage.loadMockFiles();
    }
    if ((!allUserFiles || allUserFiles.length === 0) && this.fileRepository) {
      if (typeof this.fileRepository.getUserDrive === 'function') {
        const uid = user ? (user.user_id || user.id || user) : '';
        let driveRes = await this.fileRepository.getUserDrive({ userId: uid, user });
        if (!driveRes || (Array.isArray(driveRes) && driveRes.length === 0)) {
          try {
            driveRes = await this.fileRepository.getUserDrive(uid);
          } catch (_) {}
        }
        allUserFiles = Array.isArray(driveRes) ? driveRes : (driveRes ? driveRes.activeFiles || [] : []);
      }
    }

    if (!Array.isArray(allUserFiles)) {
      allUserFiles = [];
    }

    const entries = [];
    const childrenMap = new Map();
    for (const f of allUserFiles) {
      if (!f.folder_id) continue;
      let list = childrenMap.get(f.folder_id);
      if (!list) {
        list = [];
        childrenMap.set(f.folder_id, list);
      }
      list.push(f);
    }

    if (rootFolderId) {
      const rootFolder = allUserFiles.find(f => f.file_id === rootFolderId);
      if (!rootFolder || rootFolder.status === 'trash') {
        const err = new Error('Folder not found');
        err.statusCode = 404;
        throw err;
      }

      entries.push({
        path: rootFolder.filename,
        isFolder: true,
        date: rootFolder.created_at || rootFolder.uploadDate
      });

      const folderPathMap = new Map();
      folderPathMap.set(rootFolder.file_id, rootFolder.filename);

      const queue = [rootFolder.file_id];
      let head = 0;
      while (head < queue.length) {
        const parentId = queue[head++];
        const parentPath = folderPathMap.get(parentId);
        const children = childrenMap.get(parentId) || [];

        for (const child of children) {
          if (child.status === 'trash') continue;
          const relPath = `${parentPath}/${child.filename}`;

          if (child.category === 'folder') {
            folderPathMap.set(child.file_id, relPath);
            queue.push(child.file_id);
            entries.push({
              path: relPath,
              isFolder: true,
              date: child.created_at || child.uploadDate
            });
          } else {
            const content = await this.getFileBuffer(child);
            entries.push({
              path: relPath,
              content,
              isFolder: false,
              date: child.created_at || child.uploadDate
            });
          }
        }
      }
      return entries;
    }

    if (Array.isArray(fileIds) && fileIds.length > 0) {
      for (const id of fileIds) {
        const item = allUserFiles.find(f => f.file_id === id);
        if (!item || item.status === 'trash') continue;

        if (item.category === 'folder') {
          entries.push({
            path: item.filename,
            isFolder: true,
            date: item.created_at || item.uploadDate
          });

          const folderPathMap = new Map();
          folderPathMap.set(item.file_id, item.filename);

          const queue = [item.file_id];
          let head = 0;
          while (head < queue.length) {
            const parentId = queue[head++];
            const parentPath = folderPathMap.get(parentId);
            const children = childrenMap.get(parentId) || [];

            for (const child of children) {
              if (child.status === 'trash') continue;
              const relPath = `${parentPath}/${child.filename}`;

              if (child.category === 'folder') {
                folderPathMap.set(child.file_id, relPath);
                queue.push(child.file_id);
                entries.push({
                  path: relPath,
                  isFolder: true,
                  date: child.created_at || child.uploadDate
                });
              } else {
                const content = await this.getFileBuffer(child);
                entries.push({
                  path: relPath,
                  content,
                  isFolder: false,
                  date: child.created_at || child.uploadDate
                });
              }
            }
          }
        } else {
          const content = await this.getFileBuffer(item);
          entries.push({
            path: item.filename,
            content,
            isFolder: false,
            date: item.created_at || item.uploadDate
          });
        }
      }
      return entries;
    }

    return entries;
  }

  /**
   * Main entry point: stream PKZIP archive directly to output writable stream
   */
  async streamArchive(res, { rootFolderId, fileIds, user, archiveName = 'archive.zip' } = {}) {
    const entries = await this.resolveEntries({ rootFolderId, fileIds, user });

    const centralDirChunks = [];
    let currentOffset = 0;

    for (const entry of entries) {
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

    // 3. Central Directory & EOCD
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
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDirSize, 12);
    eocd.writeUInt32LE(centralDirOffset, 16);
    eocd.writeUInt16LE(0, 20);

    res.write(eocd);
    res.end();
  }

  static createZipArchive(entries = []) {
    const localFileChunks = [];
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

      localFileChunks.push(localHeader, pathBuffer, compressedContent);

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

    return Buffer.concat([...localFileChunks, centralDirBuffer, eocd]);
  }

  static pipeZipArchive(entries = [], res) {
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

      res.write(localHeader);
      res.write(pathBuffer);
      if (compressedSize > 0) {
        res.write(compressedContent);
      }

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
}

ArchiveStreamer.calculateCrc32 = calculateCrc32;
ArchiveStreamer.toDosDateTime = toDosDateTime;

module.exports = ArchiveStreamer;
