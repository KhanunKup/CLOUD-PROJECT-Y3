// backend/src/api/file-repository.js
// Deep File & Folder Persistence Engine for EasyDrive
// Unifies AWS DynamoDB / S3 storage with local fallback behind a single high-leverage interface

const crypto = require('crypto');
const { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

class FileRepository {
  constructor({ isMockMode, storage, docClient, s3Client, storageBucket, filesTable, usersTable, defaultQuota = 53687091200 }) {
    this.isMockMode = isMockMode;
    this.storage = storage;
    this.docClient = docClient;
    this.s3Client = s3Client;
    this.storageBucket = storageBucket;
    this.filesTable = filesTable;
    this.usersTable = usersTable || process.env.USERS_TABLE || "easydrive-users";
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
    let descendantCount = 0;
    try {
      const userFilesRes = await this.docClient.send(new QueryCommand({
        TableName: this.filesTable,
        IndexName: 'OwnerIndex',
        KeyConditionExpression: 'owner_id = :owner',
        ExpressionAttributeValues: { ':owner': user.user_id }
      })).catch(() => ({ Items: [] }));
      const userFiles = userFilesRes.Items || [];

      const allDescendantIds = new Set();
      userFiles.forEach(f => {
        if (idSet.has(f.file_id) && f.category === 'folder') {
          const queue = [f.file_id];
          while (queue.length > 0) {
            const pid = queue.shift();
            userFiles.forEach(child => {
              if (child.folder_id === pid && !idSet.has(child.file_id)) {
                allDescendantIds.add(child.file_id);
                if (child.category === 'folder') queue.push(child.file_id);
              }
            });
          }
        }
      });

      const itemsToTrash = [...fileIds, ...allDescendantIds];
      descendantCount = allDescendantIds.size;

      for (const id of itemsToTrash) {
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
          if (idSet.has(id)) {
            affectedCount++;
          }
        } catch (_) {}
      }
    } catch (err) {
      console.error('[FileRepository.batchTrash Cloud Error]:', err);
    }

    return { affectedCount, descendantCount };
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
    try {
      const userFilesRes = await this.docClient.send(new QueryCommand({
        TableName: this.filesTable,
        IndexName: 'OwnerIndex',
        KeyConditionExpression: 'owner_id = :owner',
        ExpressionAttributeValues: { ':owner': user.user_id }
      })).catch(() => ({ Items: [] }));
      const userFiles = userFilesRes.Items || [];

      // Find active folder IDs
      const activeFolderIds = new Set(userFiles.filter(f => f.status === 'active' && f.category === 'folder').map(f => f.file_id));
      userFiles.forEach(f => {
        if (idSet.has(f.file_id) && f.category === 'folder') {
          activeFolderIds.add(f.file_id);
        }
      });

      const allDescendantsToRestore = new Set();
      userFiles.forEach(f => {
        if (idSet.has(f.file_id) && f.category === 'folder') {
          const queue = [f.file_id];
          while (queue.length > 0) {
            const pid = queue.shift();
            userFiles.forEach(child => {
              if (child.folder_id === pid && child.status === 'trash' && !idSet.has(child.file_id)) {
                allDescendantsToRestore.add(child.file_id);
                if (child.category === 'folder') queue.push(child.file_id);
              }
            });
          }
        }
      });

      const itemsToRestore = [...fileIds, ...allDescendantsToRestore];

      for (const id of itemsToRestore) {
        try {
          const item = userFiles.find(f => f.file_id === id);
          let targetFolderId = item && item.folder_id ? item.folder_id : 'root';
          if (targetFolderId !== 'root' && !activeFolderIds.has(targetFolderId)) {
            targetFolderId = 'root';
          }

          await this.docClient.send(new UpdateCommand({
            TableName: this.filesTable,
            Key: { file_id: id },
            ConditionExpression: 'owner_id = :owner',
            UpdateExpression: 'SET #st = :active, folder_id = :fid REMOVE trashed_at',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':active': 'active',
              ':fid': targetFolderId,
              ':owner': user.user_id
            }
          }));
          if (idSet.has(id)) {
            affectedCount++;
          }
        } catch (_) {}
      }
    } catch (err) {
      console.error('[FileRepository.batchRestore Cloud Error]:', err);
    }

    return { affectedCount };
  }
  // ==========================================
  // 6. User Storage & Quota Accounting
  // ==========================================
  async getUserStorage(userId) {
    const DEFAULT_STORAGE_QUOTA = this.defaultQuota || 53687091200; // 50 GB
    const formatBytes = (bytes) => {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    if (!this.isMockMode && this.docClient && this.filesTable) {
      try {
        let quota = DEFAULT_STORAGE_QUOTA;
        let userEmail = '';

        // 1. Fetch user quota from USERS_TABLE
        if (this.usersTable) {
          try {
            const userRes = await this.docClient.send(new GetCommand({
              TableName: this.usersTable,
              Key: { user_id: userId }
            }));
            if (userRes.Item) {
              quota = userRes.Item.quota || DEFAULT_STORAGE_QUOTA;
              userEmail = userRes.Item.email || '';
            }
          } catch (_) {}
        }

        // 2. Query active files belonging to this user to calculate real storage
        const filesRes = await this.docClient.send(new QueryCommand({
          TableName: this.filesTable,
          IndexName: 'OwnerIndex',
          KeyConditionExpression: 'owner_id = :owner',
          FilterExpression: '#st = :status',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':owner': userId,
            ':status': 'active'
          }
        })).catch(() => ({ Items: [] }));

        const activeFiles = filesRes.Items || [];
        const breakdown = { document: 0, image: 0, code: 0, archive: 0, video: 0, audio: 0, other: 0 };
        let totalUsed = 0;

        for (const f of activeFiles) {
          if (f.category !== 'folder') {
            const sz = Number(f.size) || 0;
            totalUsed += sz;
            const cat = f.category || 'other';
            breakdown[cat] = (breakdown[cat] || 0) + sz;
          }
        }

        const free = Math.max(0, quota - totalUsed);
        const percent = quota > 0 ? parseFloat(Math.min(100, (totalUsed / quota) * 100).toFixed(1)) : 0;

        const breakdownFormatted = {};
        const breakdownPercent = {};
        for (const [cat, bytes] of Object.entries(breakdown)) {
          breakdownFormatted[cat] = formatBytes(bytes);
          const rawPct = quota > 0 ? (bytes / quota) * 100 : 0;
          breakdownPercent[cat] = bytes > 0 ? Math.max(2, parseFloat(rawPct.toFixed(1))) : 0;
        }

        return {
          user_id: userId,
          email: userEmail,
          quota,
          quotaBytes: quota,
          totalUsed,
          usedBytes: totalUsed,
          free,
          freeBytes: free,
          percent,
          percentUsed: percent,
          formattedQuota: formatBytes(quota),
          formattedUsed: formatBytes(totalUsed),
          formattedTotalUsed: formatBytes(totalUsed),
          formattedFree: formatBytes(free),
          breakdown,
          breakdownFormatted,
          breakdownPercent
        };
      } catch (err) {
        console.error('[FileRepository.getUserStorage Error]:', err);
      }
    }

    // Mock Mode fallback
    const files = this.storage ? this.storage.loadMockFiles() : [];
    const userFiles = files.filter(f => f.status !== 'trash' && (f.owner_id === userId || (userId === 'user-normal-01' && f.owner_id === 'demo-user')));
    const breakdown = { document: 0, image: 0, code: 0, archive: 0, video: 0, audio: 0, other: 0 };
    let totalUsed = 0;
    for (const f of userFiles) {
      if (f.category !== 'folder') {
        const sz = Number(f.size) || 0;
        totalUsed += sz;
        const cat = f.category || 'other';
        breakdown[cat] = (breakdown[cat] || 0) + sz;
      }
    }
    const quota = DEFAULT_STORAGE_QUOTA;
    const free = Math.max(0, quota - totalUsed);
    const percent = quota > 0 ? parseFloat(Math.min(100, (totalUsed / quota) * 100).toFixed(1)) : 0;

    const breakdownFormatted = {};
    const breakdownPercent = {};
    for (const [cat, bytes] of Object.entries(breakdown)) {
      breakdownFormatted[cat] = formatBytes(bytes);
      const rawPct = quota > 0 ? (bytes / quota) * 100 : 0;
      breakdownPercent[cat] = bytes > 0 ? Math.max(2, parseFloat(rawPct.toFixed(1))) : 0;
    }

    return {
      user_id: userId,
      quota,
      quotaBytes: quota,
      totalUsed,
      usedBytes: totalUsed,
      free,
      freeBytes: free,
      percent,
      percentUsed: percent,
      formattedQuota: formatBytes(quota),
      formattedUsed: formatBytes(totalUsed),
      formattedTotalUsed: formatBytes(totalUsed),
      formattedFree: formatBytes(free),
      breakdown,
      breakdownFormatted,
      breakdownPercent
    };
  }

  // ==========================================
  // 7. Deep Drive View (Hierarchy, Pinned, Breadcrumbs)
  // ==========================================
  async getUserDrive({ userId, folderId = null, user = null }) {
    let activeFiles = [];
    let currentFolder = null;
    const breadcrumbs = [{ name: 'My Drive', id: null, url: '/drive' }];

    if (!this.isMockMode && this.docClient && this.filesTable) {
      try {
        // 1. Fetch current folder metadata if requested
        if (folderId) {
          const folderRes = await this.docClient.send(new GetCommand({
            TableName: this.filesTable,
            Key: { file_id: folderId }
          }));
          if (folderRes.Item && folderRes.Item.category === 'folder') {
            currentFolder = folderRes.Item;
          }
        }

        // 2. Query files in folder using OwnerFolderIndex (or fallback to OwnerIndex)
        try {
          const queryParams = {
            TableName: this.filesTable,
            IndexName: 'OwnerFolderIndex',
            KeyConditionExpression: 'owner_id = :owner AND folder_id = :folder',
            FilterExpression: '#st = :status',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':owner': userId,
              ':folder': folderId || 'root',
              ':status': 'active'
            }
          };
          const res = await this.docClient.send(new QueryCommand(queryParams));
          activeFiles = res.Items || [];
          if (activeFiles.length === 0 && (!folderId || folderId === 'root')) {
            const fallbackRes = await this.docClient.send(new QueryCommand({
              TableName: this.filesTable,
              IndexName: 'OwnerIndex',
              KeyConditionExpression: 'owner_id = :owner',
              FilterExpression: '#st = :status',
              ExpressionAttributeNames: { '#st': 'status' },
              ExpressionAttributeValues: {
                ':owner': userId,
                ':status': 'active'
              }
            }));
            const allItems = fallbackRes.Items || [];
            activeFiles = allItems.filter(f => !f.folder_id || f.folder_id === 'root');
          }
        } catch (_) {
          const res = await this.docClient.send(new QueryCommand({
            TableName: this.filesTable,
            IndexName: 'OwnerIndex',
            KeyConditionExpression: 'owner_id = :owner',
            FilterExpression: '#st = :status',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':owner': userId,
              ':status': 'active'
            }
          }));
          const allOwnerItems = res.Items || [];
          activeFiles = allOwnerItems.filter(f => (folderId ? f.folder_id === folderId : (!f.folder_id || f.folder_id === 'root')));
        }

        // 3. Build Breadcrumb ancestry
        if (currentFolder) {
          const ancestors = [];
          let curr = currentFolder;
          const visited = new Set();
          while (curr && !visited.has(curr.file_id)) {
            visited.add(curr.file_id);
            ancestors.unshift({
              name: curr.filename,
              id: curr.file_id,
              url: `/drive?folder=${curr.file_id}`
            });
            if (curr.folder_id && curr.folder_id !== 'root') {
              const pRes = await this.docClient.send(new GetCommand({
                TableName: this.filesTable,
                Key: { file_id: curr.folder_id }
              })).catch(() => ({ Item: null }));
              curr = pRes.Item;
            } else {
              break;
            }
          }
          breadcrumbs.push(...ancestors);
        }
      } catch (cloudErr) {
        console.error('[FileRepository.getUserDrive Cloud Error]:', cloudErr);
      }
    } else {
      // Mock mode
      const files = this.storage ? this.storage.loadMockFiles() : [];
      if (folderId) {
        currentFolder = files.find(f => f.file_id === folderId && f.category === 'folder') || null;
      }
      if (currentFolder) {
        const ancestors = [];
        let curr = currentFolder;
        const visited = new Set();
        while (curr && !visited.has(curr.file_id)) {
          visited.add(curr.file_id);
          ancestors.unshift({
            name: curr.filename,
            id: curr.file_id,
            url: `/drive?folder=${curr.file_id}`
          });
          if (curr.folder_id) {
            curr = files.find(f => f.file_id === curr.folder_id && f.category === 'folder');
          } else {
            break;
          }
        }
        breadcrumbs.push(...ancestors);
      }

      activeFiles = files.filter(f => {
        if (f.status !== 'active') return false;
        const isOwner = f.owner_id === userId || (userId === 'user-normal-01' && f.owner_id === 'demo-user');
        if (!isOwner) return false;
        return folderId ? f.folder_id === folderId : (!f.folder_id || f.folder_id === 'root');
      });
    }

    // Sort activeFiles: Pinned items on top, Folders on top, Newest first
    activeFiles.sort((a, b) => {
      const isPinnedA = Boolean(a.is_pinned);
      const isPinnedB = Boolean(b.is_pinned);
      if (isPinnedA && !isPinnedB) return -1;
      if (!isPinnedA && isPinnedB) return 1;

      const isFolderA = a.category === 'folder';
      const isFolderB = b.category === 'folder';
      if (isFolderA && !isFolderB) return -1;
      if (!isFolderA && isFolderB) return 1;

      const tA = new Date(a.created_at || a.createdAt || 0).getTime();
      const tB = new Date(b.created_at || b.createdAt || 0).getTime();
      if (tA !== tB) return tB - tA;
      return (a.filename || '').localeCompare(b.filename || '');
    });

    return {
      activeFiles,
      currentFolder,
      currentFolderId: currentFolder ? currentFolder.file_id : null,
      breadcrumbs
    };
  }

  // ==========================================
  // 8. Trashed Items Fetch
  // ==========================================
  async getUserTrash({ userId }) {
    let trashedFiles = [];

    if (!this.isMockMode && this.docClient && this.filesTable) {
      try {
        const res = await this.docClient.send(new QueryCommand({
          TableName: this.filesTable,
          IndexName: 'OwnerIndex',
          KeyConditionExpression: 'owner_id = :owner',
          FilterExpression: '#st = :status',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':owner': userId,
            ':status': 'trash'
          }
        }));
        trashedFiles = res.Items || [];
      } catch (err) {
        console.error('[FileRepository.getUserTrash Cloud Error]:', err);
      }
    } else {
      const files = this.storage ? this.storage.loadMockFiles() : [];
      trashedFiles = files.filter(f => {
        if (f.status !== 'trash') return false;
        return f.owner_id === userId || (userId === 'user-normal-01' && f.owner_id === 'demo-user');
      });
    }

    // Sort trashedFiles: Folders on top, newest trashed first
    trashedFiles.sort((a, b) => {
      const isFolderA = a.category === 'folder';
      const isFolderB = b.category === 'folder';
      if (isFolderA && !isFolderB) return -1;
      if (!isFolderA && isFolderB) return 1;
      const tA = new Date(a.trashed_at || a.created_at || 0).getTime();
      const tB = new Date(b.trashed_at || b.created_at || 0).getTime();
      if (tA !== tB) return tB - tA;
      return (a.filename || '').localeCompare(b.filename || '');
    });

    return trashedFiles;
  }
  // ==========================================
  // 9. Empty User Trash Bin (DynamoDB, S3 & Quota Reclamation)
  // ==========================================
  async emptyUserTrash({ userId, userStorage = null, files = null, storageModule = null }) {
    if (this.isMockMode) {
      const allFiles = files || (this.storage ? this.storage.loadMockFiles() : []);
      const trashedItems = allFiles.filter(f => {
        if (f.status !== 'trash') return false;
        return f.owner_id === userId || (userId === 'user-normal-01' && f.owner_id === 'demo-user');
      });

      let totalSizeFreed = 0;
      const categoryFreed = {};
      trashedItems.forEach(item => {
        if (item.category !== 'folder') {
          const sz = Number(item.size) || 0;
          if (sz > 0) {
            totalSizeFreed += sz;
            const cat = item.category || 'document';
            categoryFreed[cat] = (categoryFreed[cat] || 0) + sz;
          }
        }
      });

      const remainingFiles = allFiles.filter(f => !trashedItems.some(t => t.file_id === f.file_id));
      if (this.storage && this.storage.saveMockFiles) {
        this.storage.saveMockFiles(remainingFiles, false);
      }
      return { purgedCount: trashedItems.length, totalSizeFreed, remainingFiles };
    }

    // Cloud Mode (DynamoDB + S3)
    let purgedCount = 0;
    let totalSizeFreed = 0;
    const categoryFreed = {};

    try {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      // 1. Fetch all trashed items for user
      const queryRes = await this.docClient.send(new QueryCommand({
        TableName: this.filesTable,
        IndexName: 'OwnerIndex',
        KeyConditionExpression: 'owner_id = :owner',
        FilterExpression: '#st = :status',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':owner': userId,
          ':status': 'trash'
        }
      }));

      const trashedItems = queryRes.Items || [];

      // 2. Delete each item from S3 and DynamoDB
      for (const item of trashedItems) {
        if (item.s3_key && this.s3Client && this.storageBucket) {
          await this.s3Client.send(new DeleteObjectCommand({
            Bucket: this.storageBucket,
            Key: item.s3_key
          })).catch(() => {});
        }

        await this.docClient.send(new DeleteCommand({
          TableName: this.filesTable,
          Key: { file_id: item.file_id }
        })).catch(() => {});

        purgedCount++;
        const sz = Number(item.size) || 0;
        if (sz > 0) {
          totalSizeFreed += sz;
          const cat = item.category || 'other';
          categoryFreed[cat] = (categoryFreed[cat] || 0) + sz;
        }
      }

      // 3. Atomically decrement totalUsed and category breakdown on USERS_TABLE
      if (totalSizeFreed > 0 && this.usersTable) {
        for (const [cat, freed] of Object.entries(categoryFreed)) {
          if (freed > 0) {
            await this.docClient.send(new UpdateCommand({
              TableName: this.usersTable,
              Key: { user_id: userId },
              UpdateExpression: 'SET totalUsed = if_not_exists(totalUsed, :zero) - :s, breakdown.#cat = if_not_exists(breakdown.#cat, :zero) - :s, updated_at = :up',
              ExpressionAttributeNames: { '#cat': cat },
              ExpressionAttributeValues: {
                ':s': freed,
                ':zero': 0,
                ':up': new Date().toISOString()
              }
            })).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('[FileRepository.emptyUserTrash Cloud Error]:', err);
    }

    return { purgedCount, totalSizeFreed };
  }
}

module.exports = FileRepository;
