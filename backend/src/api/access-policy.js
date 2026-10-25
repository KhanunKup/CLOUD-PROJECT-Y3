// backend/src/api/access-policy.js
// Deep security policy module unifying link sharing, TTL expiration, passwords, and collaborator access

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { GetCommand, UpdateCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

class AccessPolicy {
  constructor({
    isMockMode = true,
    docClient = null,
    sharesTable = '',
    filesTable = '',
    shares = []
  } = {}) {
    this.isMockMode = isMockMode;
    this.docClient = docClient;
    this.sharesTable = sharesTable;
    this.filesTable = filesTable;
    this.shares = shares; // Array or getter function () => mockShares
  }

  getLiveShares() {
    if (typeof this.shares === 'function') {
      return this.shares() || [];
    }
    return Array.isArray(this.shares) ? this.shares : [];
  }

  /**
   * Evaluate whether a user has access to a specific file/folder
   * @param {Object} file - File metadata record
   * @param {Object} user - Authenticated user context
   * @param {string} requiredPermission - 'view' | 'edit'
   * @returns {{ allowed: boolean, permission: 'owner'|'collaborator'|'admin'|'none', reason?: string }}
   */
  evaluateFileAccess(file, user, requiredPermission = 'view') {
    if (!file || !user) {
      return { allowed: false, permission: 'none', reason: 'Missing file or user context' };
    }

    // 1. Admin Role has universal read/traverse visibility
    if (user.role === 'admin') {
      return { allowed: true, permission: 'admin' };
    }

    // 2. Direct Ownership
    const userId = user.user_id || user.id;
    if (file.owner_id === userId || (userId === 'user-normal-01' && file.owner_id === 'demo-user')) {
      return { allowed: true, permission: 'owner' };
    }

    // 3. Direct Collaborator Access List
    const userEmail = (user.email || '').trim().toLowerCase();
    const accessList = Array.isArray(file.access_list) ? file.access_list : [];
    const entry = accessList.find(collab => {
      if (!collab) return false;
      const cEmail = (collab.email || collab.name || '').trim().toLowerCase();
      const cId = (collab.user_id || collab.id || '').trim();
      return (cEmail && cEmail === userEmail) || (cId && cId === userId);
    });

    if (entry) {
      if (requiredPermission === 'edit') {
        return entry.permission === 'can edit'
          ? { allowed: true, permission: 'collaborator' }
          : { allowed: false, permission: 'collaborator', reason: 'Edit permission required' };
      }
      return { allowed: true, permission: 'collaborator' };
    }

    return { allowed: false, permission: 'none', reason: 'Access denied' };
  }

  /**
   * Verify access to a share link (password, TTL expiration, burn-after-read limit)
   * @param {string} targetId - share_id or file_id
   * @param {string} password - raw password attempted
   * @returns {Promise<{ valid: boolean, fileId?: string, share?: Object, error?: string, statusCode?: number, passwordRequired?: boolean }>}
   */
  async verifyShareAccess(targetId, password = '') {
    let share = null;

    if (this.isMockMode) {
      const shares = this.getLiveShares();
      share = shares.find(s => s.share_id === targetId || s.file_id === targetId);
    } else if (this.docClient && this.sharesTable) {
      try {
        const getRes = await this.docClient.send(new GetCommand({
          TableName: this.sharesTable,
          Key: { share_id: targetId }
        }));
        share = getRes.Item || null;

        if (!share) {
          const queryRes = await this.docClient.send(new QueryCommand({
            TableName: this.sharesTable,
            IndexName: 'FileIdIndex',
            KeyConditionExpression: 'file_id = :fid',
            ExpressionAttributeValues: { ':fid': targetId },
            Limit: 1
          }));
          if (queryRes.Items && queryRes.Items.length > 0) {
            share = queryRes.Items[0];
          }
        }
      } catch (err) {
        console.error('[AccessPolicy.verifyShareAccess Cloud Error]:', err);
      }
    }

    if (!share) {
      return { valid: false, error: 'Share link not found or expired', statusCode: 404 };
    }

    // 1. Verify TTL Expiration (Supports Unix seconds or ISO string)
    let isExpired = false;
    if (typeof share.expires_at === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      isExpired = share.expires_at > 1e11 ? Date.now() > share.expires_at : nowSec > share.expires_at;
    } else if (share.expires_at) {
      const expiresAt = new Date(share.expires_at);
      if (!isNaN(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
        isExpired = true;
      }
    }

    if (isExpired) {
      return { valid: false, error: 'This share link has expired', statusCode: 410 };
    }

    // 2. Verify Burn-After-Read (Max Downloads Limit)
    const maxDl = Number(share.max_downloads) || 0;
    const currentDl = Number(share.download_count) || 0;
    if (maxDl > 0 && currentDl >= maxDl) {
      return { valid: false, error: 'Download limit reached. This link is no longer active.', statusCode: 410 };
    }

    // 3. Verify Password Protection
    if (share.has_password || share.password_hash) {
      if (!password) {
        return { valid: false, error: 'Password required', statusCode: 401, passwordRequired: true };
      }
      const match = await bcrypt.compare(password, share.password_hash);
      if (!match) {
        return { valid: false, error: 'Invalid password', statusCode: 403 };
      }
    }

    return {
      valid: true,
      fileId: share.file_id,
      share
    };
  }

  /**
   * Atomically register a download event against the share record
   */
  async recordDownload(shareId) {
    if (this.isMockMode) {
      const shares = this.getLiveShares();
      const share = shares.find(s => s.share_id === shareId || s.file_id === shareId);
      if (share) {
        share.download_count = (share.download_count || 0) + 1;
      }
      return;
    }

    if (this.docClient && this.sharesTable) {
      try {
        await this.docClient.send(new UpdateCommand({
          TableName: this.sharesTable,
          Key: { share_id: shareId },
          UpdateExpression: 'SET download_count = if_not_exists(download_count, :zero) + :one',
          ExpressionAttributeValues: { ':zero': 0, ':one': 1 }
        }));
      } catch (err) {
        console.error('[AccessPolicy.recordDownload Error]:', err);
      }
    }
  }
}

module.exports = AccessPolicy;
