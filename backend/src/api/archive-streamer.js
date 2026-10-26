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

  async getFileBuffer(file) {
    if (this.customGetContent) {
      return await this.customGetContent(file);
    }

    const filename = file.filename || file.name || 'unknown';

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
      return Buffer.from(`Sample content for ${filename}`);
    }

    const s3Key = file.s3_key || file.s3Key || file.key;
    if (this.s3Client && this.storageBucket && s3Key) {
      try {
        const s3Res = await this.s3Client.send(new GetObjectCommand({
          Bucket: this.storageBucket,
          Key: s3Key
        }));
        if (s3Res.Body) {
          if (typeof s3Res.Body.transformToByteArray === 'function') {
            const arr = await s3Res.Body.transformToByteArray();
            return Buffer.from(arr);
          }
          const chunks = [];
          for await (const chunk of s3Res.Body) {
            chunks.push(chunk);
          }
          return Buffer.concat(chunks);
        }
      } catch (err) {
        console.error(`[ArchiveStreamer] Failed fetching S3 key ${s3Key}:`, err.message);
      }
    }

    return Buffer.alloc(0);
  }

  /**
   * ขุดหารายชื่อไฟล์ (Metadata) แบบไม่เปลือง RAM โดยยังไม่ดึงเนื้อหา
   */
  async resolveEntries({ rootFolderId, fileIds, user }) {
    const entries = [];

    const getAllFiles = async () => {
      let allFiles = [];
      if (this.storage && typeof this.storage.loadMockFiles === 'function') {
        allFiles = this.storage.loadMockFiles();
      }
      if ((!allFiles || allFiles.length === 0) && this.fileRepository) {
        if (typeof this.fileRepository.getUserDrive === 'function') {
          const uid = user ? (user.user_id || user.id || user) : '';
          let driveRes = await this.fileRepository.getUserDrive({ userId: uid, user });
          if (!driveRes || (Array.isArray(driveRes) && driveRes.length === 0)) {
            try { driveRes = await this.fileRepository.getUserDrive(uid); } catch (_) {}
          }
          allFiles = Array.isArray(driveRes) ? driveRes : (driveRes ? driveRes.activeFiles || [] : []);
        }
      }
      return Array.isArray(allFiles) ? allFiles : [];
    };

    const traverseFolder = async (startFolderId, baseFolderPath, allFiles) => {
      const childrenMap = new Map();
      for (const f of allFiles) {
        const pId = f.folder_id || f.parent_id || f.parentId;
        if (!pId) continue;
        let list = childrenMap.get(pId);
        if (!list) {
          list = [];
          childrenMap.set(pId, list);
        }
        list.push(f);
      }

      const folderPathMap = new Map();
      folderPathMap.set(startFolderId, baseFolderPath);

      const queue = [startFolderId];
      let head = 0;
      while (head < queue.length) {
        const parentId = queue[head++];
        const parentPath = folderPathMap.get(parentId);
        let children = childrenMap.get(parentId) || [];

        if (children.length === 0 && this.fileRepository && typeof this.fileRepository.listByFolder === 'function') {
          try {
            children = await this.fileRepository.listByFolder({ folderId: parentId, user: user, status: 'active' });
          } catch (_) {}
        }

        for (const child of children) {
          if (child.status === 'trash') continue;
          
          const childName = child.filename || child.name || 'file';
          const childId = child.file_id || child.id;
          const relPath = `${parentPath}/${childName}`;
          const isFolder = child.category === 'folder' || child.type === 'folder' || child.isFolder || child.is_folder;

          if (isFolder) {
            folderPathMap.set(childId, relPath);
            queue.push(childId);
            entries.push({
              path: relPath,
              isFolder: true,
              date: child.created_at || child.createdAt || child.uploadDate
            });
          } else {
            // [OPTIMIZATION]: บันทึกแค่ Reference ของไฟล์ไว้ (fileRef) ยังไม่ fetch S3 Buffer ณ ตอนนี้
            entries.push({
              path: relPath,
              fileRef: child, 
              isFolder: false,
              date: child.created_at || child.createdAt || child.uploadDate
            });
          }
        }
      }
    };

    const allUserFiles = await getAllFiles();

    if (rootFolderId) {
      let rootFolder = allUserFiles.find(f => (f.file_id === rootFolderId) || (f.id === rootFolderId));
      if (!rootFolder && this.fileRepository && typeof this.fileRepository.findById === 'function') {
        rootFolder = await this.fileRepository.findById(rootFolderId, user, { activeOnly: true });
      }
      if (!rootFolder || rootFolder.status === 'trash') {
        const err = new Error('Folder not found');
        err.statusCode = 404;
        throw err;
      }

      const rootFolderIdKey = rootFolder.file_id || rootFolder.id;
      const rootFolderName = rootFolder.filename || rootFolder.name;

      entries.push({
        path: rootFolderName,
        isFolder: true,
        date: rootFolder.created_at || rootFolder.createdAt || rootFolder.uploadDate
      });

      await traverseFolder(rootFolderIdKey, rootFolderName, allUserFiles);
      return entries;
    }

    if (Array.isArray(fileIds) && fileIds.length > 0) {
      for (const id of fileIds) {
        let item = allUserFiles.find(f => (f.file_id === id) || (f.id === id));
        if (!item && this.fileRepository && typeof this.fileRepository.findById === 'function') {
          item = await this.fileRepository.findById(id, user, { activeOnly: true });
        }
        if (!item || item.status === 'trash') continue;

        const itemId = item.file_id || item.id;
        const itemName = item.filename || item.name;
        const isFolder = item.category === 'folder' || item.type === 'folder' || item.isFolder || item.is_folder;

        if (isFolder) {
          entries.push({
            path: itemName,
            isFolder: true,
            date: item.created_at || item.createdAt || item.uploadDate
          });
          await traverseFolder(itemId, itemName, allUserFiles);
        } else {
          // [OPTIMIZATION]: บันทึกแค่ Reference ของไฟล์ไว้ (fileRef) 
          entries.push({
            path: itemName,
            fileRef: item,
            isFolder: false,
            date: item.created_at || item.createdAt || item.uploadDate
          });
        }
      }
      return entries;
    }

    return entries;
  }

  /**
   * Main entry point: stream PKZIP archive Directly with JIT buffer loading
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

      // [OPTIMIZATION]: โหลดเนื้อหาไฟล์ (Buffer) ณ วินาทีนี้ (JIT) 
      let rawContent = Buffer.alloc(0);
      if (!isDir) {
        if (entry.fileRef) {
          rawContent = await this.getFileBuffer(entry.fileRef);
        } else if (entry.content) {
          rawContent = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content || '');
        }
      }

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

      // ยิงข้อมูลเข้า Stream ทันที
      res.write(localHeader);
      res.write(pathBuffer);
      if (compressedSize > 0) {
        res.write(compressedContent);
      }

      // 2. Central Directory Header (เก็บไว้ท้ายไฟล์ตามสเปก ZIP)
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

  // (createZipArchive และ pipeZipArchive ด้านล่างใช้โค้ดเดิมได้เลยถ้าไม่ได้ใช้ หรือจะลบออกก็ได้เพราะ streamArchive ทำงานครบจบแล้ว)
}

ArchiveStreamer.calculateCrc32 = calculateCrc32;
ArchiveStreamer.toDosDateTime = toDosDateTime;

module.exports = ArchiveStreamer;