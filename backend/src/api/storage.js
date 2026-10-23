// backend/src/api/storage.js
const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.resolve(__dirname, '../../storage');

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function sanitizeKey(s3Key) {
  if (!s3Key) return 'unnamed_file';
  // Strip leading slashes and prevent directory traversal
  return s3Key.replace(/^(\.\.[\/\\])+/, '').replace(/^[\/\\]+/, '').replace(/\.\.[\/\\]/g, '');
}

function getStoragePath(s3Key) {
  ensureStorageDir();
  const safeKey = sanitizeKey(s3Key);
  return path.join(STORAGE_DIR, safeKey);
}

function saveUploadedFile(s3Key, req) {
  return new Promise((resolve, reject) => {
    ensureStorageDir();
    const filePath = getStoragePath(s3Key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (req.complete || req.readableEnded) {
      // Body already consumed by middleware (e.g. express.json)
      let data = req.body;
      if (typeof data === 'object' && !Buffer.isBuffer(data)) {
        data = JSON.stringify(data, null, 2);
      }
      if (data !== undefined && data !== null) {
        fs.writeFileSync(filePath, data);
      } else {
        // Empty payload
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, '');
        }
      }
      return resolve(filePath);
    }

    const writeStream = fs.createWriteStream(filePath);
    req.pipe(writeStream);
    writeStream.on('finish', () => resolve(filePath));
    writeStream.on('error', reject);
    req.on('error', reject);
  });
}

function findStoredFile(fileRecordOrKey) {
  ensureStorageDir();
  if (typeof fileRecordOrKey === 'string') {
    const directPath = getStoragePath(fileRecordOrKey);
    if (fs.existsSync(directPath) && !fs.statSync(directPath).isDirectory()) return directPath;

    // Search by basename recursively if not found directly
    const basename = path.basename(fileRecordOrKey);
    return findFileRecursive(STORAGE_DIR, basename);
  }

  const file = fileRecordOrKey;
  if (!file) return null;

  // 1. Try s3_key
  if (file.s3_key) {
    const p = getStoragePath(file.s3_key);
    if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) return p;
  }

  // 2. Try owner_id/file_id/filename
  if (file.owner_id && file.file_id && file.filename) {
    const p = getStoragePath(`folders/${file.owner_id}/${file.file_id}/${file.filename}`);
    if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) return p;
  }

  // 3. Try owner_id/filename
  if (file.owner_id && file.filename) {
    const p = getStoragePath(`folders/${file.owner_id}/${file.filename}`);
    if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) return p;
  }

  // 4. Try basename in storage
  if (file.filename) {
    return findFileRecursive(STORAGE_DIR, file.filename);
  }

  return null;
}

function findFileRecursive(dir, targetName) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(fullPath, targetName);
      if (found) return found;
    } else if (entry.name.toLowerCase() === targetName.toLowerCase()) {
      return fullPath;
    }
  }
  return null;
}

// Generate valid minimal PDF binary
function createMinimalPdfBuffer(title = 'EasyDrive Sample Document') {
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 72 >> stream
BT
/F1 24 Tf
100 700 Td
(${title}) Tj
ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000366 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
445
%%EOF`;
  return Buffer.from(content, 'utf-8');
}

// Generate valid minimal 1x1 PNG binary (semi-transparent blue pixel)
function createMinimalPngBuffer() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
  ]);
}

function seedDefaultFiles() {
  ensureStorageDir();

  const seedFiles = [
    {
      key: 'folders/user-normal-01/file-001/Project_Proposal.pdf',
      data: createMinimalPdfBuffer('Project Proposal: Cloud Storage Platform (EasyDrive)')
    },
    {
      key: 'folders/user-normal-01/file-002/Architecture_Diagram.png',
      data: createMinimalPngBuffer()
    },
    {
      key: 'folders/user-normal-01/folder-001/file-004/Meeting_Notes.docx',
      data: Buffer.from('EasyDrive Sprint Review Meeting Notes: Architecture sync & preview pipeline completed.', 'utf-8')
    },
    {
      key: 'File1.txt',
      data: Buffer.from('ที่มาของคณะไอที ลาดกระบัง\n\nโครงการจัดตั้งคณะเทคโนโลยีสารสนเทศ ได้รับความเห็นชอบจากสภา สถาบันเทคโนโลยีพระจอมเกล้า เจ้าคุณทหารลาดกระบัง เมื่อวันที่ 12 กรกฎาคม 2537', 'utf-8')
    }
  ];

  for (const item of seedFiles) {
    const targetPath = getStoragePath(item.key);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(targetPath)) {
      fs.writeFileSync(targetPath, item.data);
    }
    // Also ensure a copy at the direct basename in storage for easy lookup
    const baseNamePath = getStoragePath(path.basename(item.key));
    if (!fs.existsSync(baseNamePath)) {
      fs.writeFileSync(baseNamePath, item.data);
    }
  }
}

// Seed upon module loading
seedDefaultFiles();

const METADATA_FILE = path.join(STORAGE_DIR, 'mock-files.json');
let saveTimeout = null;
let pendingFilesToSave = null;

function loadMockFiles(defaultFiles = []) {
  ensureStorageDir();
  try {
    if (fs.existsSync(METADATA_FILE)) {
      const raw = fs.readFileSync(METADATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to read mock metadata file, falling back to default:', err.message);
  }
  saveMockFiles(defaultFiles, true);
  return defaultFiles;
}

function flushMockFilesSync() {
  if (!pendingFilesToSave) return;
  ensureStorageDir();
  try {
    const data = JSON.stringify(pendingFilesToSave, null, 2);
    fs.writeFileSync(METADATA_FILE, data, 'utf-8');
  } catch (err) {
    try {
      const tempPath = `${METADATA_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(pendingFilesToSave, null, 2), 'utf-8');
      fs.renameSync(tempPath, METADATA_FILE);
    } catch (innerErr) {
      console.error('Failed to save mock metadata file:', innerErr.message);
    }
  }
}

function saveMockFiles(files = [], immediate = false) {
  ensureStorageDir();
  pendingFilesToSave = files;

  if (immediate) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = null;
    flushMockFilesSync();
    return;
  }

  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    flushMockFilesSync();
  }, 250);
}

process.on('exit', () => {
  flushMockFilesSync();
});

function deleteStoredFile(fileRecordOrKey) {
  if (!fileRecordOrKey) return false;
  try {
    const filePath = findStoredFile(fileRecordOrKey);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      let parentDir = path.dirname(filePath);
      while (parentDir && parentDir !== STORAGE_DIR && parentDir.startsWith(STORAGE_DIR)) {
        const remaining = fs.readdirSync(parentDir);
        if (remaining.length === 0) {
          fs.rmdirSync(parentDir);
          parentDir = path.dirname(parentDir);
        } else {
          break;
        }
      }
      return true;
    }
  } catch (err) {
    console.warn('Failed to delete stored file:', err.message);
  }
  return false;
}

function deleteStoredFolder(ownerId, folderId) {
  if (!ownerId || !folderId) return false;
  let deleted = false;
  const targetPaths = [
    getStoragePath(`uploads/${ownerId}/${folderId}`),
    getStoragePath(`folders/${ownerId}/${folderId}`)
  ];

  for (const targetDir of targetPaths) {
    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        deleted = true;

        // Clean up parent owner directory if empty
        const parentOwnerDir = path.dirname(targetDir);
        if (fs.existsSync(parentOwnerDir) && fs.readdirSync(parentOwnerDir).length === 0) {
          fs.rmdirSync(parentOwnerDir);
        }
      }
    } catch (err) {
      console.warn(`Failed to delete stored folder at "${targetDir}":`, err.message);
    }
  }

  return deleted;
}

async function deleteStoredFolderAsync(ownerId, folderId) {
  if (!ownerId || !folderId) return false;
  let deleted = false;
  const targetPaths = [
    getStoragePath(`uploads/${ownerId}/${folderId}`),
    getStoragePath(`folders/${ownerId}/${folderId}`)
  ];

  for (const targetDir of targetPaths) {
    try {
      try {
        await fs.promises.access(targetDir);
      } catch {
        continue;
      }
      await fs.promises.rm(targetDir, { recursive: true, force: true });
      deleted = true;

      // Clean up parent owner directory if empty
      const parentOwnerDir = path.dirname(targetDir);
      try {
        const remaining = await fs.promises.readdir(parentOwnerDir);
        if (remaining.length === 0) {
          await fs.promises.rmdir(parentOwnerDir);
        }
      } catch {}
    } catch (err) {
      console.warn(`Failed to async delete stored folder at "${targetDir}":`, err.message);
    }
  }

  return deleted;
}

function pruneOrphanUploads(validMockFiles = []) {
  ensureStorageDir();
  const uploadsDir = getStoragePath('uploads');
  if (!fs.existsSync(uploadsDir)) return { removedFoldersCount: 0 };

  const validFolderIds = new Set(
    validMockFiles.filter(f => f.category === 'folder').map(f => f.file_id)
  );
  const validFileIds = new Set(
    validMockFiles.filter(f => f.category !== 'folder').map(f => f.file_id)
  );

  let removedFoldersCount = 0;
  try {
    const owners = fs.readdirSync(uploadsDir);
    for (const owner of owners) {
      const ownerDir = path.join(uploadsDir, owner);
      if (!fs.existsSync(ownerDir) || !fs.statSync(ownerDir).isDirectory()) continue;

      const entries = fs.readdirSync(ownerDir);
      for (const entry of entries) {
        const entryPath = path.join(ownerDir, entry);
        if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isDirectory()) continue;

        let shouldDelete = false;
        if (entry.startsWith('folder-') && !validFolderIds.has(entry)) {
          shouldDelete = true;
        } else if (entry.startsWith('file-') && !validFileIds.has(entry)) {
          shouldDelete = true;
        }

        if (shouldDelete) {
          try {
            fs.rmSync(entryPath, { recursive: true, force: true });
            removedFoldersCount++;
          } catch (err) {
            console.warn(`Failed to prune orphan directory ${entryPath}:`, err.message);
          }
        }
      }

      // If ownerDir became empty, remove it as well
      if (fs.existsSync(ownerDir) && fs.readdirSync(ownerDir).length === 0) {
        fs.rmdirSync(ownerDir);
      }
    }
  } catch (err) {
    console.warn('Error during pruneOrphanUploads:', err.message);
  }

  return { removedFoldersCount };
}

module.exports = {
  STORAGE_DIR,
  METADATA_FILE,
  ensureStorageDir,
  getStoragePath,
  saveUploadedFile,
  findStoredFile,
  deleteStoredFile,
  deleteStoredFolder,
  deleteStoredFolderAsync,
  pruneOrphanUploads,
  seedDefaultFiles,
  loadMockFiles,
  saveMockFiles,
  flushMockFilesSync
};
