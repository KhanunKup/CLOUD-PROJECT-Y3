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
      if (!filename || size <= 0) {
        const err = new Error('filename and positive size are required for all items');
        err.statusCode = 400;
        throw err;
      }

      const rawFolderId = req.folder_id || req.parent_id;
      const effectiveFolderId = (rawFolderId && rawFolderId !== 'root') ? rawFolderId : 'root';
      const fileId = `file-${crypto.randomUUID()}`;
      const s3Key = effectiveFolderId !== 'root'
        ? `uploads/${userId}/${effectiveFolderId}/${fileId}/${filename}`
        : `uploads/${userId}/${fileId}/${filename}`;
      const category = getCategoryFromExtension(filename);

      if (this.isMockMode) {
        const uploadUrl = `${protocol}://${host}/mock-upload?key=${encodeURIComponent(s3Key)}&filename=${encodeURIComponent(filename)}&folder_id=${encodeURIComponent(effectiveFolderId)}`;
        const mockFileRecord = {
          file_id: fileId,
          owner_id: userId,
          folder_id: effectiveFolderId,
          filename,
          size,
          category,
          tags: [category, filename.split('.').pop().toLowerCase()],
          file_hash: crypto.randomBytes(32).toString('hex'),
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
          file: mockFileRecord
        });
      } else {
        // AWS S3 Presigned URL Creation
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
          s3_key: s3Key,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        if (this.docClient && this.filesTable) {
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
