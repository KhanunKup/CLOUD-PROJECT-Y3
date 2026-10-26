// scratch/update_index.js
const fs = require('fs');

let code = fs.readFileSync('backend/src/api/index.js', 'utf8');

// 1. Add filename-resolver and comment out SNS
code = code.replace(
  "const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');",
  "// const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');\nconst { resolveUniqueName } = require('./filename-resolver');"
);

code = code.replace(
  "const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;",
  "// const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;"
);

code = code.replace(
  "let s3Client, docClient, snsClient;",
  "let s3Client, docClient;"
);

code = code.replace(
  "snsClient = new SNSClient({ region: REGION });",
  "// snsClient = new SNSClient({ region: REGION });"
);

// 2. canUserAccessFile edit permission check
const oldCanUserAccess = `function canUserAccessFile(file, user) {
  if (!file || !user) return false;
  const userId = user.user_id || user.id;
  if (file.owner_id === userId || (userId === 'user-normal-01' && file.owner_id === 'demo-user')) return true;

  const userEmail = (user.email || '').trim().toLowerCase();
  const accessList = file.access_list || file.accessList || [];
  if (Array.isArray(accessList)) {
    const hasAccess = accessList.some(collab => {
      if (!collab) return false;
      const cEmail = (collab.email || collab.name || '').trim().toLowerCase();
      const cId = (collab.user_id || collab.id || '').trim();
      return (cEmail && cEmail === userEmail) || (cId && cId === userId);
    });
    if (hasAccess) return true;
  }

  // 3. ตรวจสอบว่ามี Public Share Link ที่ยังไม่หมดอายุของไฟล์นี้อยู่หรือไม่
  if (IS_MOCK_MODE) {
    const isShared = mockShares && mockShares.some(s => s.file_id === file.file_id);
    if (isShared) return true;
  }

  // 4. สิทธิ์สืบทอดจากโฟลเดอร์แม่ (Inherited permission)
  if (file.folder_id && file.folder_id !== 'root') {
    const parentFolder = mockFiles ? mockFiles.find(f => f.file_id === file.folder_id) : null;
    if (parentFolder && canUserAccessFile(parentFolder, user)) {
      return true;
    }
  }

  return false;
}`;

const newCanUserAccess = `function canUserAccessFile(file, user, requiredPermission = 'view', visited = new Set()) {
  if (!file || !user) return false;
  const userId = user.user_id || user.id;
  if (file.owner_id === userId || (userId === 'user-normal-01' && file.owner_id === 'demo-user')) return true;

  const userEmail = (user.email || '').trim().toLowerCase();
  const accessList = file.access_list || file.accessList || [];
  if (Array.isArray(accessList)) {
    const entry = accessList.find(collab => {
      if (!collab) return false;
      const cEmail = (collab.email || collab.name || '').trim().toLowerCase();
      const cId = (collab.user_id || collab.id || '').trim();
      return (cEmail && cEmail === userEmail) || (cId && cId === userId);
    });
    if (entry) {
      if (requiredPermission === 'edit') {
        if (entry.permission === 'can edit') return true;
      } else {
        return true;
      }
    }
  }

  // 3. ตรวจสอบว่ามี Public Share Link ที่ยังไม่หมดอายุของไฟล์นี้อยู่หรือไม่ (เฉพาะสิทธิ์ view)
  if (requiredPermission === 'view' && IS_MOCK_MODE) {
    const isShared = mockShares && mockShares.some(s => s.file_id === file.file_id);
    if (isShared) return true;
  }

  // 4. สิทธิ์สืบทอดจากโฟลเดอร์แม่ (Inherited permission)
  if (file.folder_id && file.folder_id !== 'root') {
    if (visited.has(file.file_id)) return false;
    visited.add(file.file_id);
    const parentFolder = mockFiles ? mockFiles.find(f => f.file_id === file.folder_id) : null;
    if (parentFolder && canUserAccessFile(parentFolder, user, requiredPermission, visited)) {
      return true;
    }
  }

  return false;
}`;

code = code.replace(oldCanUserAccess, newCanUserAccess);

// 3. Update create folder
const oldCreateFolderBlock = `  const fileId = \`folder-\${crypto.randomUUID()}\`;
  const newFolder = {
    file_id: fileId,
    owner_id: req.user.user_id,
    folder_id: parentFolderId,
    filename: folderName,
    size: 0,
    category: 'folder',
    tags: ['folder'],
    s3_key: \`folders/\${req.user.user_id}/\${fileId}/\`,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (IS_MOCK_MODE) {
    mockFiles.unshift(newFolder);
    storage.saveMockFiles(mockFiles);
    await recordAuditLog({ user: req.user, action: 'CREATE_FOLDER', level: 'info', details: \`Created folder "\${folderName}"\` });
    return res.json({ success: true, file: newFolder });
  }

  try {
    await docClient.send(new PutCommand({
      TableName: FILES_TABLE,
      Item: newFolder
    }));
    await recordAuditLog({ user: req.user, action: 'CREATE_FOLDER', level: 'info', details: \`Created folder "\${folderName}"\` });
    res.json({ success: true, file: newFolder });`;

const newCreateFolderBlock = `  const effectiveFolderName = await resolveUniqueName({
    isMockMode: IS_MOCK_MODE,
    mockFiles,
    docClient,
    filesTable: FILES_TABLE,
    userId: req.user.user_id,
    folderId: parentFolderId,
    requestedName: folderName
  });

  const fileId = \`folder-\${crypto.randomUUID()}\`;
  const newFolder = {
    file_id: fileId,
    owner_id: req.user.user_id,
    folder_id: parentFolderId,
    filename: effectiveFolderName,
    size: 0,
    category: 'folder',
    tags: ['folder'],
    s3_key: \`folders/\${req.user.user_id}/\${fileId}/\`,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (IS_MOCK_MODE) {
    mockFiles.unshift(newFolder);
    storage.saveMockFiles(mockFiles);
    await recordAuditLog({ user: req.user, action: 'CREATE_FOLDER', level: 'info', details: \`Created folder "\${effectiveFolderName}"\` });
    return res.json({ success: true, file: newFolder });
  }

  try {
    await docClient.send(new PutCommand({
      TableName: FILES_TABLE,
      Item: newFolder
    }));
    await recordAuditLog({ user: req.user, action: 'CREATE_FOLDER', level: 'info', details: \`Created folder "\${effectiveFolderName}"\` });
    res.json({ success: true, file: newFolder });`;

code = code.replace(oldCreateFolderBlock, newCreateFolderBlock);

// 4. Update Rename
const oldRenameMock = `  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (!file) return res.status(404).json({ error: 'File not found' });
    file.filename = filename;
    file.updated_at = new Date().toISOString();
    storage.saveMockFiles(mockFiles);
    await recordAuditLog({ user: req.user, action: 'RENAME', level: 'info', details: \`Renamed file to "\${filename}"\` });
    return res.json({ success: true, file });
  }`;

const newRenameMock = `  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user, 'edit'));
    if (!file) return res.status(404).json({ error: 'File not found or permission denied' });
    const targetFolder = file.folder_id || 'root';
    const effectiveFilename = await resolveUniqueName({
      isMockMode: true,
      mockFiles,
      userId: file.owner_id || req.user.user_id,
      folderId: targetFolder,
      requestedName: filename,
      excludeFileId: fileId
    });
    file.filename = effectiveFilename;
    file.updated_at = new Date().toISOString();
    storage.saveMockFiles(mockFiles);
    await recordAuditLog({ user: req.user, action: 'RENAME', level: 'info', details: \`Renamed file to "\${effectiveFilename}"\` });
    return res.json({ success: true, file });
  }`;

code = code.replace(oldRenameMock, newRenameMock);

const oldRenameCloud = `    const result = await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId },
      UpdateExpression: 'SET filename = :fn, updated_at = :up',
      ExpressionAttributeValues: {
        ':fn': filename,
        ':up': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));
    await recordAuditLog({ user: req.user, action: 'RENAME', level: 'info', details: \`Renamed file to "\${filename}"\` });`;

const newRenameCloud = `    const targetFolder = fileItem.folder_id || 'root';
    const effectiveFilename = await resolveUniqueName({
      isMockMode: false,
      docClient,
      filesTable: FILES_TABLE,
      userId: fileItem.owner_id || req.user.user_id,
      folderId: targetFolder,
      requestedName: filename,
      excludeFileId: fileId
    });

    const result = await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId },
      UpdateExpression: 'SET filename = :fn, updated_at = :up',
      ExpressionAttributeValues: {
        ':fn': effectiveFilename,
        ':up': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));
    await recordAuditLog({ user: req.user, action: 'RENAME', level: 'info', details: \`Renamed file to "\${effectiveFilename}"\` });`;

code = code.replace(oldRenameCloud, newRenameCloud);

// 5. Update Move
const oldMoveMock = `    file.folder_id = targetFolderId;
    file.updated_at = new Date().toISOString();
    storage.saveMockFiles(mockFiles);

    const destName = targetFolderId
      ? (mockFiles.find(f => f.file_id === targetFolderId)?.filename || targetFolderId)
      : 'My Drive (root)';

    await recordAuditLog({
      user: req.user,
      action: 'FILE_MOVE',
      level: 'info',
      details: \`Moved "\${file.filename}" to \${destName}\`
    });`;

const newMoveMock = `    const effectiveFilename = await resolveUniqueName({
      isMockMode: true,
      mockFiles,
      userId: file.owner_id || req.user.user_id,
      folderId: targetFolderId || 'root',
      requestedName: file.filename,
      excludeFileId: fileId
    });

    file.filename = effectiveFilename;
    file.folder_id = targetFolderId;
    file.updated_at = new Date().toISOString();
    storage.saveMockFiles(mockFiles);

    const destName = targetFolderId
      ? (mockFiles.find(f => f.file_id === targetFolderId)?.filename || targetFolderId)
      : 'My Drive (root)';

    await recordAuditLog({
      user: req.user,
      action: 'FILE_MOVE',
      level: 'info',
      details: \`Moved "\${file.filename}" to \${destName}\`
    });`;

code = code.replace(oldMoveMock, newMoveMock);

const oldMoveCloud = `    const updateRes = await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId },
      UpdateExpression: 'SET folder_id = :fid, updated_at = :up',
      ExpressionAttributeValues: {
        ':fid': targetFolderId || 'root',
        ':up': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));`;

const newMoveCloud = `    const effectiveFilename = await resolveUniqueName({
      isMockMode: false,
      docClient,
      filesTable: FILES_TABLE,
      userId: file.owner_id || req.user.user_id,
      folderId: targetFolderId || 'root',
      requestedName: file.filename,
      excludeFileId: fileId
    });

    const updateRes = await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId },
      UpdateExpression: 'SET folder_id = :fid, filename = :fn, updated_at = :up',
      ExpressionAttributeValues: {
        ':fid': targetFolderId || 'root',
        ':fn': effectiveFilename,
        ':up': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));`;

code = code.replace(oldMoveCloud, newMoveCloud);

// 6. Comment out SNS notification in download
const oldSnsPublish = `    // Send SNS Notification Alert to File Owner
    if (!IS_MOCK_MODE && snsClient && SNS_TOPIC_ARN) {
      snsClient.send(new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: \`[EasyDrive Alert] ไฟล์ของคุณถูกดาวน์โหลด: \${file.filename}\`,
        Message: \`มีผู้เข้าดาวน์โหลดไฟล์ "\${file.filename}" ผ่านลิงก์แชร์ (\${shareId}) เมื่อเวลา \${new Date().toLocaleString('th-TH')}\`
      })).catch(err => console.error('SNS Notification error:', err));
    }`;

const newSnsPublish = `    // SNS Notification commented out for Learner Lab policy compliance
    // if (!IS_MOCK_MODE && snsClient && SNS_TOPIC_ARN) { ... }`;

code = code.replace(oldSnsPublish, newSnsPublish);

fs.writeFileSync('backend/src/api/index.js', code, 'utf8');
console.log('Successfully updated backend/src/api/index.js');

