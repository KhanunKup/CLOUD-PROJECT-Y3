const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const bcrypt = require('bcryptjs');

// AWS SDK v3 Clients
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  QueryCommand, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand, 
  ScanCommand 
} = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const app = express();
app.use(cors());
app.use(express.json());

// Configure EJS View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==========================================
// 1. Environment & Mode Configuration
// ==========================================
const FILES_TABLE = process.env.FILES_TABLE;
const SHARES_TABLE = process.env.SHARES_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const REGION = process.env.AWS_REGION;

// Strict mode selection from .env
const IS_MOCK_MODE = process.env.USE_MOCK === 'true';

// Startup Validation (Fail-Fast for Cloud Mode)
if (!IS_MOCK_MODE) {
  const requiredVars = [
    'AWS_REGION',
    'STORAGE_BUCKET',
    'FILES_TABLE',
    'SHARES_TABLE',
    'USERS_TABLE'
  ];
  const missing = requiredVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`[EasyDrive Startup Error] Missing required AWS environment variables: ${missing.join(', ')}`);
  }
}

console.log(`[EasyDrive API] Mode: ${IS_MOCK_MODE ? '🟡 LOCAL MOCK MODE' : '🟢 AWS CLOUD MODE'}`);

// Initialize AWS Clients (Used when not in mock mode)
let s3Client, docClient, snsClient;
if (!IS_MOCK_MODE) {
  s3Client = new S3Client({ region: REGION });
  const ddbClient = new DynamoDBClient({ region: REGION });
  docClient = DynamoDBDocumentClient.from(ddbClient);
  snsClient = new SNSClient({ region: REGION });
}

// ==========================================
// 2. In-Memory Mock Store (For Local Development)
// ==========================================
let mockFiles = [
  {
    file_id: 'file-001',
    owner_id: 'demo-user',
    filename: 'Project_Proposal.pdf',
    size: 2450000,
    category: 'document',
    tags: ['document', 'pdf', 'final'],
    file_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    file_id: 'file-002',
    owner_id: 'demo-user',
    filename: 'Architecture_Diagram.png',
    size: 5120000,
    category: 'image',
    tags: ['image', 'png', 'diagram'],
    file_hash: 'b2c3d4e5f6a17890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'active',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    file_id: 'file-003',
    owner_id: 'demo-user',
    filename: 'Dataset_Backup.zip',
    size: 45000000,
    category: 'archive',
    tags: ['archive', 'zip'],
    file_hash: 'c3d4e5f6a1b27890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'trash',
    trashed_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString()
  }
];

let mockShares = [];
let mockUserStorage = {
  user_id: 'demo-user',
  email: 'demo@kmitl.ac.th',
  totalUsed: 52570000,
  quota: 10737418240, // 10 GB
  breakdown: {
    document: 2450000,
    image: 5120000,
    archive: 45000000,
    other: 0
  }
};

// ==========================================
// 3. Helper Functions
// ==========================================
function getCategoryFromExtension(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const categories = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz'],
    video: ['mp4', 'mov', 'avi', 'mkv'],
    audio: ['mp3', 'wav', 'aac']
  };

  for (const [cat, exts] of Object.entries(categories)) {
    if (exts.includes(ext)) return cat;
  }
  return 'other';
}

// Authentication Middleware (Mock friendly)
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (IS_MOCK_MODE) {
    // Local mock mode: auto-assign demo-user
    req.user = {
      user_id: req.headers['x-user-id'] || 'demo-user',
      email: 'demo@kmitl.ac.th',
      role: req.headers['x-user-role'] || 'user'
    };
    return next();
  }

  // AWS Cloud Mode: Decode Cognito JWT payload
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const payloadBase64 = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
    req.user = {
      user_id: decoded.sub || decoded['cognito:username'],
      email: decoded.email,
      role: (decoded['cognito:groups'] && decoded['cognito:groups'].includes('Admin')) ? 'admin' : 'user'
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid JWT token' });
  }
}

// Middleware สำหรับจำลองข้อมูลผู้ใช้ปัจจุบันสำหรับหน้า EJS
app.use((req, res, next) => {
  const roleParam = req.query.role;
  res.locals.user = {
    name: 'Rick and Morty',
    role: roleParam ? roleParam.toLowerCase() : 'admin',
    avatar: null
  };
  next();
});

// ==========================================
// 4. Web SSR Routes (Frontend Pages)
// ==========================================
app.get('/', (req, res) => {
  res.redirect('/signin');
});

app.get('/signin', (req, res) => {
  res.render('pages/login');
});

app.get('/signup', (req, res) => {
  res.render('pages/signup');
});

app.get('/logout', (req, res) => {
  res.redirect('/signin');
});

app.get('/drive', (req, res) => {
  const activeFiles = mockFiles.filter(f => f.status === 'active');
  res.render('pages/homepage', {
    files: activeFiles.map(f => ({
      id: f.file_id,
      name: f.filename,
      type: f.category === 'folder' ? 'folder' : 'file',
      owner: f.owner_id === 'demo-user' ? 'me' : f.owner_id,
      uploadDate: new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      accessList: []
    }))
  });
});

app.get('/shared', (req, res) => {
  res.render('pages/shared', {
    files: [
      {
        name: 'Shared_Document.pdf', type: 'file', owner: 'Passakorn', uploadDate: '10 Oct. 2026',
        accessList: [{ name: 'Anan', permission: 'can view', timeRemaining: '5 days' }]
      }
    ]
  });
});

app.get('/trash', (req, res) => {
  const trashedFiles = mockFiles.filter(f => f.status === 'trash');
  res.render('pages/trash', {
    files: trashedFiles.map(f => ({
      id: f.file_id,
      name: f.filename,
      type: 'file',
      owner: 'me',
      trashedAt: new Date(f.trashed_at || f.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    }))
  });
});

app.post('/trash/empty', (req, res) => {
  if (IS_MOCK_MODE) {
    mockFiles = mockFiles.filter(f => f.status !== 'trash');
  }
  res.redirect('/trash');
});

app.get('/management', (req, res) => {
  res.render('pages/usermanagement');
});

app.get('/audit', (req, res) => {
  res.render('pages/audit');
});

// ==========================================
// 5. REST API Endpoints
// ==========================================

// 5.1 Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: IS_MOCK_MODE ? 'mock' : 'aws-cloud',
    timestamp: new Date().toISOString()
  });
});

// 5.2 List Files (Supports ?status=active|trash and ?category=image|document)
app.get('/api/files', authMiddleware, async (req, res) => {
  const statusFilter = req.query.status || 'active';
  const categoryFilter = req.query.category;

  if (IS_MOCK_MODE) {
    let files = mockFiles.filter(f => f.owner_id === req.user.user_id && f.status === statusFilter);
    if (categoryFilter) files = files.filter(f => f.category === categoryFilter);
    return res.json({ success: true, count: files.length, files });
  }

  try {
    const command = new QueryCommand({
      TableName: FILES_TABLE,
      IndexName: 'OwnerIndex',
      KeyConditionExpression: 'owner_id = :owner',
      FilterExpression: '#st = :status',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: {
        ':owner': req.user.user_id,
        ':status': statusFilter
      }
    });

    const result = await docClient.send(command);
    let files = result.Items || [];
    if (categoryFilter) files = files.filter(f => f.category === categoryFilter);
    res.json({ success: true, count: files.length, files });
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Failed to retrieve files' });
  }
});

// 5.2.1 Create Folder
app.post('/api/folders', authMiddleware, async (req, res) => {
  const { folderName } = req.body;
  if (!folderName) {
    return res.status(400).json({ error: 'folderName is required' });
  }

  const fileId = `folder-${crypto.randomUUID()}`;
  const newFolder = {
    file_id: fileId,
    owner_id: req.user.user_id,
    filename: folderName,
    size: 0,
    category: 'folder',
    tags: ['folder'],
    s3_key: `folders/${req.user.user_id}/${fileId}/`,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (IS_MOCK_MODE) {
    mockFiles.unshift(newFolder);
    return res.json({ success: true, file: newFolder });
  }

  try {
    await docClient.send(new PutCommand({
      TableName: FILES_TABLE,
      Item: newFolder
    }));
    res.json({ success: true, file: newFolder });
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// 5.3 Request Presigned Upload URL
app.post('/api/files/upload-url', authMiddleware, async (req, res) => {
  const { filename, size, contentType } = req.body;
  if (!filename || !size) {
    return res.status(400).json({ error: 'filename and size are required' });
  }

  const fileId = `file-${crypto.randomUUID()}`;
  const s3Key = `uploads/${req.user.user_id}/${fileId}/${filename}`;
  const category = getCategoryFromExtension(filename);

  if (IS_MOCK_MODE) {
    const mockFileRecord = {
      file_id: fileId,
      owner_id: req.user.user_id,
      filename,
      size: Number(size),
      category,
      tags: [category, filename.split('.').pop().toLowerCase()],
      file_hash: crypto.randomBytes(32).toString('hex'),
      s3_key: s3Key,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockFiles.unshift(mockFileRecord);

    // Update mock storage breakdown
    mockUserStorage.totalUsed += Number(size);
    mockUserStorage.breakdown[category] = (mockUserStorage.breakdown[category] || 0) + Number(size);

    return res.json({
      success: true,
      file_id: fileId,
      key: s3Key,
      uploadUrl: `http://localhost:3000/mock-upload?key=${encodeURIComponent(s3Key)}`,
      file: mockFileRecord
    });
  }

  try {
    const putCommand = new PutObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: s3Key,
      ContentType: contentType || 'application/octet-stream'
    });
    const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 900 }); // 15 mins

    // Create pending record in DynamoDB
    const newFile = {
      file_id: fileId,
      owner_id: req.user.user_id,
      filename,
      size: Number(size),
      category,
      tags: [category, filename.split('.').pop().toLowerCase()],
      s3_key: s3Key,
      status: 'pending_upload',
      created_at: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: FILES_TABLE,
      Item: newFile
    }));

    res.json({ success: true, file_id: fileId, key: s3Key, uploadUrl, file: newFile });
  } catch (err) {
    console.error('Presigned URL error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// 5.4 Request Download URL (Owner Download)
app.get('/api/files/:id/download-url', authMiddleware, async (req, res) => {
  const fileId = req.params.id;

  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    return res.json({
      success: true,
      filename: file.filename,
      downloadUrl: `http://localhost:3000/mock-download/${file.filename}`
    });
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId }
    }));
    const file = result.Item;
    if (!file || file.owner_id !== req.user.user_id) {
      return res.status(404).json({ error: 'File not found or unauthorized' });
    }

    const getCommand = new GetObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: file.s3_key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.filename)}"`
    });
    const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 300 });

    res.json({ success: true, filename: file.filename, downloadUrl });
  } catch (err) {
    console.error('Download URL error:', err);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// 5.5 Rename File
app.patch('/api/files/:id', authMiddleware, async (req, res) => {
  const fileId = req.params.id;
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename is required' });

  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && f.owner_id === req.user.user_id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    file.filename = filename;
    file.updated_at = new Date().toISOString();
    return res.json({ success: true, file });
  }

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId },
      ConditionExpression: 'owner_id = :owner',
      UpdateExpression: 'SET filename = :fn, updated_at = :up',
      ExpressionAttributeValues: {
        ':fn': filename,
        ':up': new Date().toISOString(),
        ':owner': req.user.user_id
      },
      ReturnValues: 'ALL_NEW'
    }));
    res.json({ success: true, file: result.Attributes });
  } catch (err) {
    console.error('Rename error:', err);
    res.status(500).json({ error: 'Failed to rename file' });
  }
});

// 5.6 Move to Trash or Permanent Delete
app.delete('/api/files/:id', authMiddleware, async (req, res) => {
  const fileId = req.params.id;
  const isPermanent = req.query.permanent === 'true';

  if (IS_MOCK_MODE) {
    const index = mockFiles.findIndex(f => f.file_id === fileId && f.owner_id === req.user.user_id);
    if (index === -1) return res.status(404).json({ error: 'File not found' });

    if (isPermanent) {
      mockFiles.splice(index, 1);
      return res.json({ success: true, message: 'File deleted permanently' });
    } else {
      mockFiles[index].status = 'trash';
      mockFiles[index].trashed_at = new Date().toISOString();
      return res.json({ success: true, message: 'File moved to trash' });
    }
  }

  try {
    if (isPermanent) {
      // Get file to know S3 key
      const getRes = await docClient.send(new GetCommand({ TableName: FILES_TABLE, Key: { file_id: fileId } }));
      if (getRes.Item && getRes.Item.s3_key) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: STORAGE_BUCKET, Key: getRes.Item.s3_key }));
      }
      await docClient.send(new DeleteCommand({ TableName: FILES_TABLE, Key: { file_id: fileId } }));
      res.json({ success: true, message: 'File deleted permanently' });
    } else {
      await docClient.send(new UpdateCommand({
        TableName: FILES_TABLE,
        Key: { file_id: fileId },
        ConditionExpression: 'owner_id = :owner',
        UpdateExpression: 'SET #st = :trash, trashed_at = :t',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':trash': 'trash',
          ':t': new Date().toISOString(),
          ':owner': req.user.user_id
        }
      }));
      res.json({ success: true, message: 'File moved to trash' });
    }
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// 5.7 Restore from Trash
app.post('/api/files/:id/restore', authMiddleware, async (req, res) => {
  const fileId = req.params.id;

  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && f.owner_id === req.user.user_id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    file.status = 'active';
    delete file.trashed_at;
    return res.json({ success: true, message: 'File restored successfully', file });
  }

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId },
      ConditionExpression: 'owner_id = :owner',
      UpdateExpression: 'SET #st = :active REMOVE trashed_at',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: {
        ':active': 'active',
        ':owner': req.user.user_id
      },
      ReturnValues: 'ALL_NEW'
    }));
    res.json({ success: true, message: 'File restored successfully', file: result.Attributes });
  } catch (err) {
    console.error('Restore file error:', err);
    res.status(500).json({ error: 'Failed to restore file' });
  }
});

// 5.8 Create Share Link (Burn-After-Read, Password, TTL)
app.post('/api/shares', authMiddleware, async (req, res) => {
  const { file_id, password, maxDownloads, expireHours } = req.body;
  if (!file_id) return res.status(400).json({ error: 'file_id is required' });

  const shareId = `share-${crypto.randomUUID().slice(0, 8)}`;
  const hours = Number(expireHours) || 24;
  const expiresAt = Math.floor(Date.now() / 1000) + (hours * 3600); // Unix timestamp for DynamoDB TTL
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const downloadLimit = Number(maxDownloads) || 0; // 0 = unlimited

  const shareRecord = {
    share_id: shareId,
    file_id,
    owner_id: req.user.user_id,
    owner_email: req.user.email,
    password_hash: passwordHash,
    has_password: Boolean(password),
    max_downloads: downloadLimit,
    download_count: 0,
    expires_at: expiresAt,
    created_at: new Date().toISOString()
  };

  if (IS_MOCK_MODE) {
    mockShares.push(shareRecord);
    return res.json({
      success: true,
      share_id: shareId,
      shareUrl: `/share/${shareId}`,
      hasPassword: Boolean(password),
      maxDownloads: downloadLimit,
      expiresAt: new Date(expiresAt * 1000).toISOString()
    });
  }

  try {
    await docClient.send(new PutCommand({
      TableName: SHARES_TABLE,
      Item: shareRecord
    }));

    res.json({
      success: true,
      share_id: shareId,
      shareUrl: `/share/${shareId}`,
      hasPassword: Boolean(password),
      maxDownloads: downloadLimit,
      expiresAt: new Date(expiresAt * 1000).toISOString()
    });
  } catch (err) {
    console.error('Create share error:', err);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// 5.9 Verify Password & Download Shared File (Burn-After-Read Check & SNS Alert)
app.post('/api/shares/:id/verify', async (req, res) => {
  const shareId = req.params.id;
  const { password } = req.body;

  let share;
  if (IS_MOCK_MODE) {
    share = mockShares.find(s => s.share_id === shareId);
  } else {
    const result = await docClient.send(new GetCommand({
      TableName: SHARES_TABLE,
      Key: { share_id: shareId }
    }));
    share = result.Item;
  }

  if (!share) return res.status(404).json({ error: 'Share link not found or expired' });

  // 1. Check TTL expiry
  if (share.expires_at && Math.floor(Date.now() / 1000) > share.expires_at) {
    return res.status(410).json({ error: 'This share link has expired' });
  }

  // 2. Check Download Limit (Burn-After-Read)
  if (share.max_downloads > 0 && share.download_count >= share.max_downloads) {
    return res.status(410).json({ error: 'Download limit reached. This link is no longer active.' });
  }

  // 3. Check Password
  if (share.has_password) {
    if (!password) return res.status(401).json({ error: 'Password required', passwordRequired: true });
    const isMatch = await bcrypt.compare(password, share.password_hash);
    if (!isMatch) return res.status(403).json({ error: 'Invalid password' });
  }

  // 4. Increment Download Count (Atomic Update)
  if (IS_MOCK_MODE) {
    share.download_count += 1;
    const file = mockFiles.find(f => f.file_id === share.file_id);
    return res.json({
      success: true,
      filename: file ? file.filename : 'shared-file',
      downloadUrl: `http://localhost:3000/mock-download/${file ? file.filename : 'file'}`,
      downloadsRemaining: share.max_downloads > 0 ? (share.max_downloads - share.download_count) : 'unlimited'
    });
  }

  try {
    // Atomic download count increment
    await docClient.send(new UpdateCommand({
      TableName: SHARES_TABLE,
      Key: { share_id: shareId },
      UpdateExpression: 'SET download_count = download_count + :inc',
      ExpressionAttributeValues: { ':inc': 1 }
    }));

    // Fetch File details
    const fileRes = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { file_id: share.file_id }
    }));
    const file = fileRes.Item;

    if (!file) return res.status(404).json({ error: 'Associated file not found' });

    // Generate Presigned Download URL
    const getCommand = new GetObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: file.s3_key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.filename)}"`
    });
    const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 300 });

    // Send SNS Notification Alert to File Owner
    if (SNS_TOPIC_ARN) {
      snsClient.send(new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: `[EasyDrive Alert] ไฟล์ของคุณถูกดาวน์โหลด: ${file.filename}`,
        Message: `มีผู้เข้าดาวน์โหลดไฟล์ "${file.filename}" ผ่านลิงก์แชร์ (${shareId}) เมื่อเวลา ${new Date().toLocaleString('th-TH')}`
      })).catch(err => console.error('SNS Notification error:', err));
    }

    res.json({
      success: true,
      filename: file.filename,
      downloadUrl,
      downloadsRemaining: share.max_downloads > 0 ? (share.max_downloads - (share.download_count + 1)) : 'unlimited'
    });
  } catch (err) {
    console.error('Share verify error:', err);
    res.status(500).json({ error: 'Failed to process share download' });
  }
});

// 5.10 User Storage Breakdown Dashboard
app.get('/api/user/storage', authMiddleware, async (req, res) => {
  if (IS_MOCK_MODE) {
    return res.json({ success: true, storage: mockUserStorage });
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { user_id: req.user.user_id }
    }));

    const storage = result.Item || {
      user_id: req.user.user_id,
      email: req.user.email,
      totalUsed: 0,
      quota: 10737418240, // 10 GB default
      breakdown: { image: 0, document: 0, archive: 0, other: 0 }
    };

    res.json({ success: true, storage });
  } catch (err) {
    console.error('Storage breakdown error:', err);
    res.status(500).json({ error: 'Failed to retrieve storage details' });
  }
});

// 5.11 Admin: Get All Users & Storage Quotas
app.get('/api/admin/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin' && !IS_MOCK_MODE) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (IS_MOCK_MODE) {
    return res.json({
      success: true,
      users: [
        mockUserStorage,
        {
          user_id: 'user-002',
          email: 'student@kmitl.ac.th',
          totalUsed: 120000000,
          quota: 10737418240,
          status: 'active'
        }
      ]
    });
  }

  try {
    const result = await docClient.send(new ScanCommand({ TableName: USERS_TABLE }));
    res.json({ success: true, users: result.Items || [] });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to scan users' });
  }
});

// Export Lambda handler
module.exports.handler = serverless(app);
module.exports.app = app; // Export app for local runner
