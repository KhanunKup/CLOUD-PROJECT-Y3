// backend/src/api/file-repository.js
// Deep File & Folder Persistence Engine for EasyDrive
// Unifies AWS DynamoDB / S3 storage with local fallback behind a single high-leverage interface

const crypto = require('crypto');
const { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

class FileRepository {
  constructor({ isMockMode, storage, docClient, filesTable, defaultQuota = 53687091200 }) {
    this.isMockMode = isMockMode;
    this.storage = storage;
    this.docClient = docClient;
    this.filesTable = filesTable;
    this.defaultQuota = defaultQuota;
  }

  canAccess(file, user) {
    if (!file || !user) return false;
    if (user.role === 'admin') return true;
    if (file.owner_id === user.user_id) return true;
    if (Array.isArray(file.accessList)) {
      return file.accessList.some(a => a.email === user.email || a.user_id === user.user_id);
    }
    return false;
  }

  // ==========================================
  // 1. Single Item Fetch & Access Control
  // ==========================================
  async findById(fileId, user = null) {
    if (!fileId) return null;

    if (this.isMockMode) {
      const files = this.storage.loadMockFiles();
      const file = files.find(f => f.file_id === fileId);
      if (!file) return null;
      if (user && !this.canAccess(file, user)) return null;
      return file;
    }

    try {
      const res = await this.docClient.send(new GetCommand({
        TableName: this.filesTable,
        Key: { file_id: fileId }
      }));
      const file = res.Item;
      if (!file) return null;
      if (user && !this.canAccess(file, user)) return null;
      return file;
    } catch (err) {
      console.error(`[FileRepository.findById Error] ${fileId}:`, err);
      return null;
    }
  }

  // ==========================================
  // 2. Listing Active & Trashed Files
  // ==========================================
  async listByFolder({ folderId = null, user, status = 'active' }) {
    if (this.isMockMode) {
      const files = this.storage.loadMockFiles();
      return files.filter(f => {
        const matchesStatus = f.status === status || (!f.status && status === 'active');
        const matchesFolder = folderId ? f.folder_id === folderId : !f.folder_id;
        const matchesOwner = this.canAccess(f, user);
        return matchesStatus && matchesFolder && matchesOwner;
      });
    }

    try {
      // DynamoDB Query: Query by owner_id or folder_id
      const queryParams = {
        TableName: this.filesTable,
        IndexName: 'OwnerFolderIndex', // If GSI exists
        KeyConditionExpression: 'owner_id = :owner AND folder_id = :folder',
        FilterExpression: '#st = :status',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':owner': user.user_id,
          ':folder': folderId || 'root',
          ':status': status
        }
      };
      const res = await this.docClient.send(new QueryCommand(queryParams));
      return res.Items || [];
    } catch (err) {
      // Fallback query if GSI is not indexed
      const scanParams = {
        TableName: this.filesTable,
        FilterExpression: 'owner_id = :owner AND #st = :status',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':owner': user.user_id,
          ':status': status
        }
      };
      const res = await this.docClient.send(new QueryCommand(scanParams).catch(() => ({ Items: [] })));
      const items = res.Items || [];
      return items.filter(f => (folderId ? f.folder_id === folderId : !f.folder_id));
    }
  }

  // ==========================================
  // 3. Pinning & Unpinning
  // ==========================================
  async togglePin(fileId, user) {
    if (this.isMockMode) {
      const files = this.storage.loadMockFiles();
      const file = files.find(f => f.file_id === fileId && this.canAccess(f, user));
      if (!file) return null;

      file.is_pinned = !file.is_pinned;
      file.pinned_at = file.is_pinned ? new Date().toISOString() : null;
      file.updated_at = new Date().toISOString();
      this.storage.saveMockFiles(files, true);

      return {
        file_id: file.file_id,
        is_pinned: file.is_pinned,
        pinned_at: file.pinned_at
      };
    }

    const file = await this.findById(fileId, user);
    if (!file) return null;

    const newPinned = !file.is_pinned;
    const pinnedAt = newPinned ? new Date().toISOString() : null;

    await this.docClient.send(new UpdateCommand({
      TableName: this.filesTable,
      Key: { file_id: fileId },
      UpdateExpression: 'SET is_pinned = :p, pinned_at = :pa, updated_at = :u',
      ExpressionAttributeValues: {
        ':p': newPinned,
        ':pa': pinnedAt,
        ':u': new Date().toISOString()
      }
    }));

    return { file_id: fileId, is_pinned: newPinned, pinned_at: pinnedAt };
  }

  // ==========================================
  // 4. Batch Move to Trash
  // ==========================================
  async batchTrash(fileIds = [], user) {
    const idSet = new Set(fileIds);
    const trashedAt = new Date().toISOString();
    let affectedCount = 0;

    if (this.isMockMode) {
      const files = this.storage.loadMockFiles();
      const allDescendantIds = new Set();

      files.forEach(f => {
        if (idSet.has(f.file_id) && this.canAccess(f, user)) {
          f.status = 'trash';
          f.trashed_at = trashedAt;
          affectedCount++;

          if (f.category === 'folder') {
            const queue = [f.file_id];
            while (queue.length > 0) {
              const pid = queue.shift();
              files.forEach(child => {
                if (child.folder_id === pid) {
                  allDescendantIds.add(child.file_id);
                  if (child.category === 'folder') queue.push(child.file_id);
                }
              });
            }
          }
        }
      });

      if (allDescendantIds.size > 0) {
        files.forEach(f => {
          if (allDescendantIds.has(f.file_id)) {
            f.status = 'trash';
            f.trashed_at = trashedAt;
          }
        });
      }

      this.storage.saveMockFiles(files, true);
      return { affectedCount, descendantCount: allDescendantIds.size };
    }

    // AWS Cloud Mode
    for (const id of fileIds) {
      try {
        await this.docClient.send(new UpdateCommand({
          TableName: this.filesTable,
          Key: { file_id: id },
          ConditionExpression: 'owner_id = :owner',
          UpdateExpression: 'SET #st = :trash, trashed_at = :t',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':trash': 'trash',
            ':t': trashedAt,
            ':owner': user.user_id
          }
        }));
        affectedCount++;
      } catch (_) {}
    }

    return { affectedCount, descendantCount: 0 };
  }

  // ==========================================
  // 5. Batch Restore
  // ==========================================
  async batchRestore(fileIds = [], user) {
    const idSet = new Set(fileIds);
    let affectedCount = 0;

    if (this.isMockMode) {
      const files = this.storage.loadMockFiles();
      const activeFolderIds = new Set(files.filter(f => f.status === 'active' && f.category === 'folder').map(f => f.file_id));

      files.forEach(f => {
        if (idSet.has(f.file_id) && this.canAccess(f, user)) {
          f.status = 'active';
          delete f.trashed_at;
          affectedCount++;

          // If parent folder is no longer active, move restored item to root
          if (f.folder_id && !activeFolderIds.has(f.folder_id)) {
            f.folder_id = null;
          }
        }
      });

      this.storage.saveMockFiles(files, true);
      return { affectedCount };
    }

    // AWS Cloud Mode
    for (const id of fileIds) {
      try {
        await this.docClient.send(new UpdateCommand({
          TableName: this.filesTable,
          Key: { file_id: id },
          ConditionExpression: 'owner_id = :owner',
          UpdateExpression: 'SET #st = :active REMOVE trashed_at',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':active': 'active',
            ':owner': user.user_id
          }
        }));
        affectedCount++;
      } catch (_) {}
    }

    return { affectedCount };
  }
}

module.exports = FileRepository;
