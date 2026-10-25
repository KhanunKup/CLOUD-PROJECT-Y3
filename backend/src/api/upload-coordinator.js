// backend/src/api/upload-coordinator.js
// Deep module coordinating pre-upload quota headroom verification and S3 pre-signed upload URL generation

const crypto = require('crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function getCategoryFromExtension(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  const categories = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz'],
    code: ['py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'json', 'sh', 'bash', 'sql', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'yaml', 'yml', 'xml', 'env'],
    video: ['mp4', 'mov', 'avi', 'mkv'],
    audio: ['mp3', 'wav', 'aac']
  };

  for (const [cat, exts] of Object.entries(categories)) {
    if (exts.includes(ext)) return cat;
  }
  return 'other';
}

class UploadCoordinator {
  constructor({
    isMockMode = true,
    s3Client = null,
    storageBucket = '',
    filesTable = '',
    docClient = null,
    storageService = null,
    mockStorage = null,
    mockFilesRef = null
  } = {}) {
    this.isMockMode = isMockMode;
    this.s3Client = s3Client;
    this.storageBucket = storageBucket;
    this.filesTable = filesTable;
    this.docClient = docClient;
    this.storageService = storageService;
    this.mockStorage = mockStorage;
    this.mockFilesRef = mockFilesRef;
  }

  /**
   * Prepares pre-signed upload tokens and reserves quota
   * @param {Object} user - Authenticated user context
   * @param {Array<{filename: string, size: number, folder_id?: string, parent_id?: string, contentType?: string}>} fileRequests
   * @param {Object} context - { host, protocol }
   */
  async prepareUploads(user, fileRequests = [], { host = 'localhost:3000', protocol = 'http' } = {}) {
    if (!Array.isArray(fileRequests) || fileRequests.length === 0) {
      const err = new Error('files array is required and must not be empty');
      err.statusCode = 400;
      throw err;
    }

    const userId = user.user_id || user.id || 'anonymous';

    // 1. Quota Guard: Enforce storage quota limits across requested files
    const totalRequestedBytes = fileRequests.reduce((acc, f) => acc + (Number(f.size) || 0), 0);
    if (this.storageService && typeof this.storageService.getUserStorage === 'function') {
      const currentStorage = await this.storageService.getUserStorage(userId);
      if (currentStorage && (currentStorage.totalUsed + totalRequestedBytes > currentStorage.quota)) {
        const err = new Error(`Storage quota exceeded. You have ${currentStorage.formattedFree} free space remaining out of ${currentStorage.formattedQuota}.`);
        err.statusCode = 400;
        throw err;
      }
    }

    const items = [];
    const newMockRecords = [];

    for (const req of fileRequests) {
      const filename = req.filename || req.name;
      const size = Number(req.size) || 0;
      const incomingHash = req.file_hash || req.hash || null; // รับค่า Hash จาก Frontend
      if (!filename || size <= 0) {
        const err = new Error('filename and positive size are required for all items');
        err.statusCode = 400;
        throw err;
      }

      const rawFolderId = req.folder_id || req.parent_id;
      const effectiveFolderId = (rawFolderId && rawFolderId !== 'root') ? rawFolderId : 'root';
      const category = getCategoryFromExtension(filename);

      // --- 1. ตรวจสอบ Deduplication บน Local Mock Mode ---
      if (this.isMockMode) {
        const liveMockFiles = typeof this.mockFilesRef === 'function' ? this.mockFilesRef() : [];
        // ค้นหาไฟล์เดิมของผู้ใช้ที่มี Hash ตรงกัน
        const duplicateFile = incomingHash 
          ? liveMockFiles.find(f => f.owner_id === userId && f.status === 'active' && f.file_hash === incomingHash)
          : null;

        if (duplicateFile) {
          const liveMockFiles = typeof this.mockFilesRef === 'function' ? this.mockFilesRef() : [];
          
          // แยกชื่อไฟล์กับนามสกุลเพื่อเติม index เช่น "test.txt" -> base: "test", ext: ".txt"
          const lastDotIndex = filename.lastIndexOf('.');
          const baseName = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
          const extName = lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';

          // หาว่าในโฟลเดอร์เดียวกันนี้ของผู้ใช้ มีชื่อขึ้นต้นแบบนี้ไปแล้วกี่อัน
          let index = 1;
          let newFilename = `${baseName} (${index})${extName}`;
          while (liveMockFiles.some(f => f.owner_id === userId && f.folder_id === effectiveFolderId && f.status === 'active' && f.filename === newFilename)) {
            index++;
            newFilename = `${baseName} (${index})${extName}`;
          }

          const newFileId = `file-${crypto.randomUUID()}`;
          const newMockRecord = {
            file_id: newFileId,
            owner_id: userId,
            folder_id: effectiveFolderId,
            filename: newFilename, // ใช้ชื่อใหม่ที่มี index
            size,
            category,
            tags: [category, newFilename.split('.').pop().toLowerCase()],
            file_hash: incomingHash,
            s3_key: duplicateFile.s3_key, // ใช้ไฟล์ binary เดิมบน S3
            status: 'active',
            is_duplicate: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          newMockRecords.push(newMockRecord);
          items.push({
            file_id: newFileId,
            filename: newFilename,
            key: duplicateFile.s3_key,
            s3Key: duplicateFile.s3_key,
            category,
            uploadUrl: null, // ไม่ต้อง PUT binary ขึ้น S3 ซ้ำ
            deduplicated: true,
            file: newMockRecord
          });
          continue;
        }

        // กรณีเป็นไฟล์ใหม่ (ไม่ซ้ำ)
        const fileId = `file-${crypto.randomUUID()}`;
        const s3Key = effectiveFolderId !== 'root'
          ? `uploads/${userId}/${effectiveFolderId}/${fileId}/${filename}`
          : `uploads/${userId}/${fileId}/${filename}`;
        const uploadUrl = `${protocol}://${host}/mock-upload?key=${encodeURIComponent(s3Key)}&filename=${encodeURIComponent(filename)}&folder_id=${encodeURIComponent(effectiveFolderId)}`;
        const mockFileRecord = {
          file_id: fileId,
          owner_id: userId,
          folder_id: effectiveFolderId,
          filename,
          size,
          category,
          tags: [category, filename.split('.').pop().toLowerCase()],
          file_hash: incomingHash || crypto.randomBytes(32).toString('hex'),
          s3_key: s3Key,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        newMockRecords.push(mockFileRecord);
        items.push({
          file_id: fileId,
          filename,
          key: s3Key,
          s3Key,
          category,
          uploadUrl,
          deduplicated: false,
          file: mockFileRecord
        });
      } else {
        // --- 2. ตรวจสอบ Deduplication บน AWS Cloud Mode (DynamoDB) ---
        let duplicateCloudFile = null;
        if (incomingHash && this.docClient && this.filesTable) {
          try {
            const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
            // ค้นหาไฟล์ของผู้ใช้ที่มีสถานะ active
            const qRes = await this.docClient.send(new QueryCommand({
              TableName: this.filesTable,
              IndexName: 'OwnerIndex',
              KeyConditionExpression: 'owner_id = :owner',
              FilterExpression: '#st = :status AND file_hash = :hash',
              ExpressionAttributeNames: { '#st': 'status' },
              ExpressionAttributeValues: {
                ':owner': userId,
                ':status': 'active',
                ':hash': incomingHash
              }
            }));
            if (qRes.Items && qRes.Items.length > 0) {
              duplicateCloudFile = qRes.Items[0];
            }
          } catch (dupErr) {
            console.warn('[UploadCoordinator] Deduplication check skipped:', dupErr.message);
          }
        }

        if (duplicateCloudFile) {
          const lastDotIndex = filename.lastIndexOf('.');
          const baseName = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
          const extName = lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';

          // ดึงไฟล์ทั้งหมดในโฟลเดอร์เพื่อหาเลข index ที่ไม่ซ้ำ
          let nextIndex = 1;
          let newFilename = `${baseName} (${nextIndex})${extName}`;
          try {
            const listRes = await this.docClient.send(new QueryCommand({
              TableName: this.filesTable,
              IndexName: 'OwnerIndex',
              KeyConditionExpression: 'owner_id = :owner',
              FilterExpression: '#st = :status AND folder_id = :fid',
              ExpressionAttributeNames: { '#st': 'status' },
              ExpressionAttributeValues: {
                ':owner': userId,
                ':status': 'active',
                ':fid': effectiveFolderId
              }
            }));
            const existingNames = new Set((listRes.Items || []).map(f => f.filename));
            while (existingNames.has(newFilename)) {
              nextIndex++;
              newFilename = `${baseName} (${nextIndex})${extName}`;
            }
          } catch (_) {}

          const newFileId = `file-${crypto.randomUUID()}`;
          const cloudRecord = {
            file_id: newFileId,
            owner_id: userId,
            folder_id: effectiveFolderId,
            filename: newFilename,
            size,
            category,
            tags: [category, newFilename.split('.').pop().toLowerCase()],
            file_hash: incomingHash,
            s3_key: duplicateCloudFile.s3_key,
            status: 'active',
            is_duplicate: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          await this.docClient.send(new PutCommand({
            TableName: this.filesTable,
            Item: cloudRecord
          }));

          items.push({
            file_id: newFileId,
            filename: newFilename,
            key: duplicateCloudFile.s3_key,
            s3Key: duplicateCloudFile.s3_key,
            category,
            uploadUrl: null,
            deduplicated: true,
            file: cloudRecord
          });
          continue;
        }

        // กรณีไฟล์ใหม่: ออก S3 Presigned URL ตามปกติ
        const fileId = `file-${crypto.randomUUID()}`;
        const s3Key = effectiveFolderId !== 'root'
          ? `uploads/${userId}/${effectiveFolderId}/${fileId}/${filename}`
          : `uploads/${userId}/${fileId}/${filename}`;

        let uploadUrl = '';
        if (this.s3Client && this.storageBucket) {
          const command = new PutObjectCommand({
            Bucket: this.storageBucket,
            Key: s3Key,
            ContentType: req.contentType || 'application/octet-stream',
            Metadata: {
              file_id: fileId,
              owner_id: userId,
              folder_id: effectiveFolderId,
              original_name: encodeURIComponent(filename)
            }
          });
          uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
        }

        const cloudFileRecord = {
          file_id: fileId,
          owner_id: userId,
          folder_id: effectiveFolderId,
          filename,
          size,
          category,
          tags: [category, filename.split('.').pop().toLowerCase()],
          file_hash: incomingHash || crypto.randomBytes(32).toString('hex'),
          s3_key: s3Key,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        if (this.docClient && this.filesTable) {
          const { PutCommand } = require('@aws-sdk/lib-dynamodb');
          await this.docClient.send(new PutCommand({
            TableName: this.filesTable,
            Item: cloudFileRecord
          })).catch(err => {
            console.error('[UploadCoordinator] Failed registering pending file in DynamoDB:', err);
          });
        }

        items.push({
          file_id: fileId,
          filename,
          key: s3Key,
          s3Key,
          category,
          uploadUrl,
          deduplicated: false,
          file: cloudFileRecord
        });
      }
    }

    // In Mock Mode: save new mock records into storage
    if (this.isMockMode && newMockRecords.length > 0) {
      if (typeof this.mockFilesRef === 'function') {
        const liveMockFiles = this.mockFilesRef();
        if (Array.isArray(liveMockFiles)) {
          liveMockFiles.unshift(...newMockRecords);
        }
      }
      if (this.mockStorage && typeof this.mockStorage.saveMockFiles === 'function') {
        if (typeof this.mockFilesRef === 'function') {
          this.mockStorage.saveMockFiles(this.mockFilesRef());
        }
      }
    }

    return {
      success: true,
      items
    };
  }
}

UploadCoordinator.getCategoryFromExtension = getCategoryFromExtension;
module.exports = UploadCoordinator;
