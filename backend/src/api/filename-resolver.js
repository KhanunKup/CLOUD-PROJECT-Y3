// backend/src/api/filename-resolver.js
// Deep helper module for resolving unique filenames and folder names within a specific folder

let QueryCommand;
try {
  const libDynamo = require('@aws-sdk/lib-dynamodb');
  QueryCommand = libDynamo.QueryCommand;
} catch (_) {}

/**
 * Resolves a unique filename within a collection of existing filenames in a target folder.
 * If requestedName already exists (case-insensitive), appends a running number: (1), (2), etc.
 * @param {Array<string>|Set<string>} existingFilenames 
 * @param {string} requestedName 
 * @returns {string} Unique filename
 */
function getUniqueFilename(existingFilenames, requestedName) {
  if (!requestedName || typeof requestedName !== 'string') return requestedName;
  const rawTarget = requestedName.trim();
  if (!rawTarget) return requestedName;

  const existingList = Array.from(existingFilenames || []).map(n => (n || '').trim());
  const existingLower = new Set(existingList.map(n => n.toLowerCase()));

  // If not taken in this folder, keep original name
  if (!existingLower.has(rawTarget.toLowerCase())) {
    return rawTarget;
  }

  // Split into base and extension
  const lastDotIndex = rawTarget.lastIndexOf('.');
  let baseName = rawTarget;
  let extName = '';
  if (lastDotIndex > 0) {
    baseName = rawTarget.substring(0, lastDotIndex);
    extName = rawTarget.substring(lastDotIndex);
  }

  // Check if baseName already has (number) at the end, e.g. "test (1)" -> clean base: "test"
  let cleanBase = baseName;
  const match = baseName.match(/^(.*?)(?:\s\((\d+)\))$/);
  if (match && match[1]) {
    cleanBase = match[1].trim();
  }

  let index = 1;
  let candidate = `${cleanBase} (${index})${extName}`;
  while (existingLower.has(candidate.toLowerCase())) {
    index++;
    candidate = `${cleanBase} (${index})${extName}`;
  }

  return candidate;
}

/**
 * Retrieves existing active filenames in a given folder for Mock mode.
 */
function getExistingFilenamesInMock(mockFiles, userId, folderId, excludeFileId = null) {
  const normFolder = (!folderId || folderId === 'root') ? 'root' : folderId;
  return (mockFiles || [])
    .filter(f => {
      if (!f || f.status !== 'active') return false;
      const isOwner = f.owner_id === userId || (userId === 'user-normal-01' && f.owner_id === 'demo-user');
      if (!isOwner) return false;
      const fFolder = (!f.folder_id || f.folder_id === 'root') ? 'root' : f.folder_id;
      if (fFolder !== normFolder) return false;
      if (excludeFileId && f.file_id === excludeFileId) return false;
      return true;
    })
    .map(f => f.filename);
}

/**
 * Retrieves existing active filenames in a given folder for AWS Cloud Mode (DynamoDB).
 */
async function getExistingFilenamesInCloud(docClient, filesTable, userId, folderId, excludeFileId = null) {
  const normFolder = (!folderId || folderId === 'root') ? 'root' : folderId;
  const names = [];
  if (!docClient || !filesTable || !userId) return names;

  try {
    if (!QueryCommand) {
      QueryCommand = require('@aws-sdk/lib-dynamodb').QueryCommand;
    }

    // Query all active files for this owner via OwnerIndex and filter by folder in memory.
    // This reliably catches all folder variations ('root', null, undefined).
    const res = await docClient.send(new QueryCommand({
      TableName: filesTable,
      IndexName: 'OwnerIndex',
      KeyConditionExpression: 'owner_id = :owner',
      FilterExpression: '#st = :status',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: {
        ':owner': userId,
        ':status': 'active'
      }
    }));

    (res.Items || []).forEach(item => {
      if (excludeFileId && item.file_id === excludeFileId) return;
      const fFolder = (!item.folder_id || item.folder_id === 'root') ? 'root' : item.folder_id;
      if (fFolder === normFolder && item.filename) {
        names.push(item.filename);
      }
    });

    return names;
  } catch (err) {
    console.warn('[getExistingFilenamesInCloud] Query error:', err.message);
    return names;
  }
}

/**
 * Main resolution helper: resolves a unique name for any file/folder in a destination folder.
 */
async function resolveUniqueName({
  isMockMode = true,
  mockFiles = [],
  docClient = null,
  filesTable = '',
  userId = '',
  ownerId = '',
  folderId = 'root',
  requestedName = '',
  desiredName = '',
  excludeFileId = null,
  knownExistingNames = null
}) {
  const targetName = requestedName || desiredName || '';
  const effectiveUserId = userId || ownerId || '';
  const normFolder = (!folderId || folderId === 'root') ? 'root' : folderId;
  let existingNames = knownExistingNames;

  if (!existingNames) {
    if (isMockMode) {
      existingNames = getExistingFilenamesInMock(mockFiles, effectiveUserId, normFolder, excludeFileId);
    } else {
      existingNames = await getExistingFilenamesInCloud(docClient, filesTable, effectiveUserId, normFolder, excludeFileId);
    }
  }

  return getUniqueFilename(existingNames, targetName);
}

module.exports = {
  getUniqueFilename,
  getExistingFilenamesInMock,
  getExistingFilenamesInCloud,
  resolveUniqueName
};

