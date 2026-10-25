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
const storage = require('./storage');
const { createZipArchive } = require('./zip-packager');
const authService = require('./auth-service');

const app = express();
app.use(cors());

// Raw binary/mock upload endpoint mounted BEFORE body-parsers so arbitrary file uploads
// (including JSON with comments like tsconfig.json, raw binary, or large files) are not parsed as JSON
app.put('/mock-upload', async (req, res) => {
  const key = req.query.key || req.query.filename || `unnamed_${Date.now()}`;
  try {
    await storage.saveUploadedFile(key, req);
    return res.status(200).send('Upload simulated successfully');
  } catch (err) {
    console.error(`[Mock Upload Error] Failed saving file ${key}:`, err);
    return res.status(500).send('Failed to save file');
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
const initialMockFiles = [
  {
    file_id: 'folder-001',
    owner_id: 'user-normal-01',
    folder_id: null,
    filename: 'Projects',
    size: 0,
    category: 'folder',
    tags: ['folder'],
    s3_key: 'folders/user-normal-01/folder-001/',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    file_id: 'file-001',
    owner_id: 'user-normal-01',
    folder_id: null,
    filename: 'Project_Proposal.pdf',
    size: 2450000,
    category: 'document',
    tags: ['document', 'pdf', 'final'],
    s3_key: 'folders/user-normal-01/file-001/Project_Proposal.pdf',
    file_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    file_id: 'file-002',
    owner_id: 'user-normal-01',
    folder_id: null,
    filename: 'Architecture_Diagram.png',
    size: 5120000,
    category: 'image',
    tags: ['image', 'png', 'diagram'],
    s3_key: 'folders/user-normal-01/file-002/Architecture_Diagram.png',
    file_hash: 'b2c3d4e5f6a17890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'active',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    file_id: 'file-004',
    owner_id: 'user-normal-01',
    folder_id: 'folder-001',
    filename: 'Meeting_Notes.docx',
    size: 1120000,
    category: 'document',
    tags: ['document', 'docx', 'notes'],
    s3_key: 'folders/user-normal-01/folder-001/file-004/Meeting_Notes.docx',
    file_hash: 'd4e5f6a1b2c37890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  {
    file_id: 'file-003',
    owner_id: 'user-normal-01',
    folder_id: null,
    filename: 'Dataset_Backup.zip',
    size: 45000000,
    category: 'archive',
    tags: ['archive', 'zip'],
    file_hash: 'c3d4e5f6a1b27890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'trash',
    trashed_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    file_id: 'folder-adm-01',
    owner_id: 'user-admin-01',
    folder_id: null,
    filename: 'Admin_Policies',
    size: 0,
    category: 'folder',
    tags: ['folder', 'admin'],
    s3_key: 'folders/user-admin-01/folder-adm-01/',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    file_id: 'file-adm-001',
    owner_id: 'user-admin-01',
    folder_id: null,
    filename: 'Admin_Security_Policy.pdf',
    size: 3200000,
    category: 'document',
    tags: ['document', 'policy', 'admin'],
    file_hash: 'f1e2d3c4b5a67890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    file_id: 'file-adm-002',
    owner_id: 'user-admin-01',
    folder_id: null,
    filename: 'System_Architecture.png',
    size: 4800000,
    category: 'image',
    tags: ['image', 'architecture', 'diagram'],
    file_hash: 'e2d3c4b5a6f17890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    file_id: 'file-adm-003',
    owner_id: 'user-admin-01',
    folder_id: 'folder-adm-01',
    filename: 'Deployment_Config.yaml',
    size: 45000,
    category: 'code',
    tags: ['code', 'yaml', 'deployment'],
    file_hash: 'd3c4b5a6f1e27890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString()
  }
];

let mockFiles = storage.loadMockFiles(initialMockFiles);

// Prune any orphan folders/files in storage/uploads that do not exist in metadata
if (IS_MOCK_MODE && storage.pruneOrphanUploads) {
  try {
    const pruneResult = storage.pruneOrphanUploads(mockFiles);
    if (pruneResult && pruneResult.removedFoldersCount > 0) {
      console.log(`[Storage Prune] Cleaned up ${pruneResult.removedFoldersCount} orphan folders from disk.`);
    }
  } catch (err) {
    console.warn('[Storage Prune Error]:', err.message);
  }
}

let mockShares = [];
const DEFAULT_STORAGE_QUOTA = 53687091200; // 50 GB (3.3x more than Google Drive's 15 GB)

let mockUserStorage = {
  user_id: 'demo-user',
  email: 'demo@kmitl.ac.th',
  totalUsed: 52570000,
  quota: DEFAULT_STORAGE_QUOTA, // 50 GB
  breakdown: {
    document: 2450000,
    image: 5120000,
    archive: 45000000,
    code: 0,
    other: 0
  }
};

let mockUsers = [
  {
    user_id: 'user-admin-01',
    name: 'Admin Rick',
    username: 'admin',
    email: 'admin@kmitl.ac.th',
    password: 'admin123',
    role: 'admin',
    status: 'active',
    quota: DEFAULT_STORAGE_QUOTA, // 50 GB
    created_at: new Date(Date.now() - 86400000 * 30).toISOString()
  },
  {
    user_id: 'user-normal-01',
    name: 'Morty Smith',
    username: 'user',
    email: 'user@kmitl.ac.th',
    password: 'user123',
    role: 'user',
    status: 'active',
    quota: DEFAULT_STORAGE_QUOTA, // 50 GB
    created_at: new Date(Date.now() - 86400000 * 15).toISOString()
  },
  {
    user_id: 'user-normal-02',
    name: 'Summer Smith',
    username: 'summer',
    email: 'summer@kmitl.ac.th',
    password: 'summer123',
    role: 'user',
    status: 'active',
    quota: 26843545600, // 25 GB
    created_at: new Date(Date.now() - 86400000 * 5).toISOString()
  }
];

let mockAuditLogs = [
  {
    log_id: 'log-001',
    user_id: 'user-admin-01',
    user_name: 'Admin Rick',
    user_email: 'admin@kmitl.ac.th',
    role: 'admin',
    action: 'LOGIN',
    level: 'info',
    details: 'Admin user logged in via web portal',
    timestamp: new Date(Date.now() - 3600000 * 5).toISOString()
  },
  {
    log_id: 'log-002',
    user_id: 'user-normal-01',
    user_name: 'Morty Smith',
    user_email: 'user@kmitl.ac.th',
    role: 'user',
    action: 'UPLOAD',
    level: 'info',
    details: 'Uploaded 1 file (document, 2.45 MB)',
    metadata: { file_id: 'file-001', category: 'document', size: 2450000, count: 1 },
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString()
  },
  {
    log_id: 'log-003',
    user_id: 'user-normal-01',
    user_name: 'Morty Smith',
    user_email: 'user@kmitl.ac.th',
    role: 'user',
    action: 'CREATE_SHARE',
    level: 'info',
    details: 'Created share link for Project_Proposal.pdf with Burn-After-Read',
    timestamp: new Date(Date.now() - 3600000 * 1).toISOString()
  }
];

// ==========================================
// 3. Helper Functions
// ==========================================
function canUserAccessFile(file, user, requiredPermission = 'view', visited = new Set()) {
  if (!file || !user || visited.has(file.file_id)) return false;
  visited.add(file.file_id);

  // 1. Resource owner or Admin role always has full access
  if (file.owner_id === user.user_id) return true;
  if (user.role === 'admin') return true;
  if (user.user_id === 'user-normal-01' && file.owner_id === 'demo-user') return true;

  // 2. Direct collaborator check via access_list
  const userEmail = (user.email || '').toLowerCase();
  if (userEmail && Array.isArray(file.access_list)) {
    const entry = file.access_list.find(a => ((a.email || a.name || '').toLowerCase() === userEmail));
    if (entry) {
      if (requiredPermission === 'edit') {
        return entry.permission === 'can edit';
      }
      return true; // 'view' is granted
    }
  }

  // 3. Recursive folder parent inheritance check
  if (file.folder_id) {
    const parentFolder = mockFiles.find(f => f.file_id === file.folder_id);
    if (parentFolder && canUserAccessFile(parentFolder, user, requiredPermission, visited)) {
      return true;
    }
  }

  return false;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getUserStorage(userId) {
  const user = mockUsers.find(u => u.user_id === userId) || {};
  const quota = user.quota || DEFAULT_STORAGE_QUOTA; // Default 50 GB

  const userFiles = mockFiles.filter(f => {
    if (f.status === 'trash') return false;
    return f.owner_id === userId || (userId === 'user-normal-01' && f.owner_id === 'demo-user');
  });

  const breakdown = {
    document: 0,
    image: 0,
    code: 0,
    archive: 0,
    video: 0,
    audio: 0,
    other: 0
  };

  let totalUsed = 0;
  for (const f of userFiles) {
    const size = Number(f.size) || 0;
    totalUsed += size;
    const cat = f.category || (f.filename ? getCategoryFromExtension(f.filename) : 'other');
    breakdown[cat] = (breakdown[cat] || 0) + size;
  }

  const percent = quota > 0 ? parseFloat(Math.min(100, (totalUsed / quota) * 100).toFixed(1)) : 0;

  const breakdownFormatted = {};
  const breakdownPercent = {};
  for (const [cat, bytes] of Object.entries(breakdown)) {
    breakdownFormatted[cat] = formatBytes(bytes);
    const rawPct = quota > 0 ? (bytes / quota) * 100 : 0;
    breakdownPercent[cat] = bytes > 0 ? Math.max(2, parseFloat(rawPct.toFixed(1))) : 0;
  }

  const freeBytes = Math.max(0, quota - totalUsed);

  return {
    totalUsed,
    usedBytes: totalUsed,
    quota,
    quotaBytes: quota,
    percent,
    formattedUsed: formatBytes(totalUsed),
    formattedQuota: formatBytes(quota),
    formattedFree: formatBytes(freeBytes),
    freeBytes,
    breakdown,
    breakdownFormatted,
    breakdownPercent
  };
}

function getFolderDescendantIds(folderId, filesArray = mockFiles) {
  if (!folderId || !filesArray || filesArray.length === 0) return [];
  // Build parent -> children map in O(N) single pass
  const childrenMap = new Map();
  for (const f of filesArray) {
    if (!f.folder_id) continue;
    let list = childrenMap.get(f.folder_id);
    if (!list) {
      list = [];
      childrenMap.set(f.folder_id, list);
    }
    list.push(f);
  }

  // Queue-based BFS traversal in O(K) where K is number of descendants using index pointer
  const descendantIds = [];
  const queue = [folderId];
  let head = 0;
  while (head < queue.length) {
    const currentId = queue[head++];
    const children = childrenMap.get(currentId);
    if (!children) continue;
    for (const child of children) {
      descendantIds.push(child.file_id);
      if (child.category === 'folder') {
        queue.push(child.file_id);
      }
    }
  }
  return descendantIds;
}

function recordAuditLog({ user, action, level = 'info', details = '', metadata = null, req = null }) {
  const logEntry = {
    log_id: `log-${crypto.randomUUID().slice(0, 8)}`,
    user_id: user ? (user.user_id || user.id || 'anonymous') : 'anonymous',
    user_name: user ? (user.name || user.username || 'User') : 'Guest',
    user_email: user ? (user.email || 'guest@easydrive.internal') : 'guest@easydrive.internal',
    role: user ? (user.role || 'user') : 'guest',
    action,
    level, // 'info' | 'warning' | 'critical'
    details,
    metadata: metadata || null,
    timestamp: new Date().toISOString()
  };
  mockAuditLogs.unshift(logEntry);
  return logEntry;
}

function getCategoryFromExtension(filename) {
  const ext = filename.split('.').pop().toLowerCase();
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

function getMimeType(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  const mimeTypes = {
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    ts: 'text/plain; charset=utf-8',
    jsx: 'text/javascript; charset=utf-8',
    tsx: 'text/plain; charset=utf-8',
    json: 'application/json; charset=utf-8',
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    py: 'text/plain; charset=utf-8',
    sh: 'text/plain; charset=utf-8',
    bash: 'text/plain; charset=utf-8',
    sql: 'text/plain; charset=utf-8',
    yaml: 'text/plain; charset=utf-8',
    yml: 'text/plain; charset=utf-8',
    xml: 'text/xml; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Delegate to Deep AuthService Engine
const parseCookies = authService.parseCookies;
const getSessionUser = authService.getSessionUser;
const authMiddleware = authService.authMiddleware;

// Authentication Guards for Web SSR routes
function requireAuthWeb(req, res, next) {
  let user = getSessionUser(req);
  if (!user && IS_MOCK_MODE) {
    if (req.headers['x-user-id']) {
      user = {
        user_id: req.headers['x-user-id'],
        email: 'demo@kmitl.ac.th',
        name: 'Demo User',
        role: req.headers['x-user-role'] || 'user'
      };
    } else {
      user = {
        user_id: mockUsers[0].user_id,
        email: mockUsers[0].email,
        name: mockUsers[0].name,
        role: mockUsers[0].role
      };
    }
  }
  if (!user) {
    if ((req.headers.accept && req.headers.accept.includes('application/json')) || req.xhr) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/signin');
  }
  req.user = user;
  res.locals.user = user;
  next();
}

function requireAdminWeb(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.redirect('/signin');
  }
  if (user.role !== 'admin') {
    return res.redirect('/drive');
  }
  req.user = user;
  res.locals.user = user;
  next();
}

// Middleware สำหรับจำลองข้อมูลผู้ใช้ปัจจุบันสำหรับหน้า EJS
app.use((req, res, next) => {
  const user = getSessionUser(req);
  const roleParam = req.query.role;
  if (user) {
    res.locals.user = user;
  } else if (roleParam) {
    res.locals.user = {
      name: 'Rick and Morty',
      role: roleParam.toLowerCase(),
      avatar: null
    };
  } else {
    res.locals.user = null;
  }
  next();
});

// ==========================================
// 4. Web SSR Routes (Frontend Pages) & Auth
// ==========================================
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', (req, res) => {
  const user = getSessionUser(req);
  if (user) return res.redirect('/drive');
  res.redirect('/signin');
});

app.get('/signin', (req, res) => {
  const user = getSessionUser(req);
  if (user) return res.redirect('/drive');
  res.render('pages/login', { error: null });
});

app.get('/signup', (req, res) => {
  const user = getSessionUser(req);
  if (user) return res.redirect('/drive');
  res.render('pages/signup', { error: null });
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', authService.clearSessionCookieHeader());
  res.redirect('/signin');
});

// 4.1 Login Handler (Supports JSON & HTML Form)
app.post(['/api/auth/login', '/signin'], async (req, res) => {
  const { username, email, password, remember } = req.body;
  const identifier = (username || email || '').trim().toLowerCase();

  if (!identifier || !password) {
    if (req.accepts('html') && !req.xhr && !req.headers['content-type']?.includes('json')) {
      return res.render('pages/login', { error: 'Please enter username/email and password' });
    }
    return res.status(400).json({ error: 'Username/Email and password are required' });
  }

  const user = mockUsers.find(u => 
    u.email.toLowerCase() === identifier || 
    u.username.toLowerCase() === identifier
  );

  if (!user || user.password !== password) {
    if (req.accepts('html') && !req.xhr && !req.headers['content-type']?.includes('json')) {
      return res.render('pages/login', { error: 'Invalid username/email or password' });
    }
    return res.status(401).json({ error: 'Invalid username/email or password' });
  }

  const sessionUser = {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role
  };
  const cookieMaxAge = (remember === 'on' || remember === 'true' || remember === true) ? 2592000 : 86400; // 30 days or 1 day
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', authService.createSessionCookieHeader(sessionUser, cookieMaxAge, isHttps));

  recordAuditLog({ user: sessionUser, action: 'LOGIN', level: 'info', details: `User "${sessionUser.name}" logged in successfully`, req });

  if (req.accepts('html') && !req.xhr && !req.headers['content-type']?.includes('json')) {
    return res.redirect('/drive');
  }
  return res.json({ success: true, message: 'Logged in successfully', user: sessionUser });
});

// 4.2 Signup Handler (Supports JSON & HTML Form)
app.post(['/api/auth/signup', '/signup'], async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  if (!username || !email || !password) {
    if (req.accepts('html') && !req.xhr && !req.headers['content-type']?.includes('json')) {
      return res.render('pages/signup', { error: 'Please fill in all required fields' });
    }
    return res.status(400).json({ error: 'Please fill in all required fields' });
  }

  if (confirmPassword && password !== confirmPassword) {
    if (req.accepts('html') && !req.xhr && !req.headers['content-type']?.includes('json')) {
      return res.render('pages/signup', { error: 'Passwords do not match' });
    }
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  const existing = mockUsers.find(u => 
    u.email.toLowerCase() === email.trim().toLowerCase() ||
    u.username.toLowerCase() === username.trim().toLowerCase()
  );

  if (existing) {
    if (req.accepts('html') && !req.xhr && !req.headers['content-type']?.includes('json')) {
      return res.render('pages/signup', { error: 'Username or email already exists' });
    }
    return res.status(409).json({ error: 'Username or email already exists' });
  }

  const newUser = {
    user_id: `user-${crypto.randomUUID().slice(0, 8)}`,
    name: username.trim(),
    username: username.trim().toLowerCase(),
    email: email.trim().toLowerCase(),
    password: password,
    role: 'user',
    quota: DEFAULT_STORAGE_QUOTA,
    created_at: new Date().toISOString()
  };
  mockUsers.push(newUser);

  const sessionUser = {
    user_id: newUser.user_id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role
  };
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', authService.createSessionCookieHeader(sessionUser, 86400, isHttps));

  recordAuditLog({ user: sessionUser, action: 'SIGNUP', level: 'info', details: `New user "${newUser.name}" registered account`, req });

  if (req.accepts('html') && !req.xhr && !req.headers['content-type']?.includes('json')) {
    return res.redirect('/drive');
  }
  return res.json({ success: true, message: 'Account created successfully', user: sessionUser });
});

// =============================================
// 4.2b Forgot Password & Reset Password Routes
// =============================================

// In-memory store for password-reset tokens (mock mode only; resets on server restart)
const passwordResetTokens = new Map(); // token -> { userId, expiresAt }

// GET /forgot-password - Show forgot-password page
app.get('/forgot-password', (req, res) => {
  const user = getSessionUser(req);
  if (user) return res.redirect('/drive');
  res.render('pages/forgot-password', { error: null, success: null });
});

// POST /forgot-password - Process email submission
app.post('/forgot-password', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) {
    return res.render('pages/forgot-password', { error: 'Please enter your email address.', success: null });
  }

  const foundUser = mockUsers.find(u => u.email.toLowerCase() === email);

  // Always show the same success message to prevent user enumeration
  const successMsg = 'If an account with that email exists, a reset link has been generated.';

  if (foundUser) {
    // Generate a secure random token (hex)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
    passwordResetTokens.set(token, { userId: foundUser.user_id, expiresAt });

    recordAuditLog({
      user: { user_id: foundUser.user_id, name: foundUser.name, email: foundUser.email, role: foundUser.role },
      action: 'FORGOT_PASSWORD',
      level: 'warning',
      details: `Password reset requested for "${foundUser.email}"`,
      req
    });

    // In mock mode: expose the reset URL directly on the page so developers can test it
    const resetUrl = `/reset-password?token=${token}`;
    return res.render('pages/forgot-password', {
      error: null,
      success: successMsg,
      mockResetUrl: IS_MOCK_MODE ? resetUrl : null
    });
  }

  return res.render('pages/forgot-password', { error: null, success: successMsg, mockResetUrl: null });
});

// GET /reset-password - Show reset password form
app.get('/reset-password', (req, res) => {
  const token = (req.query.token || '').trim();
  if (!token) return res.redirect('/forgot-password');

  const entry = passwordResetTokens.get(token);
  if (!entry || Date.now() > entry.expiresAt) {
    return res.render('pages/reset-password', {
      token: null,
      error: 'This reset link has expired or is invalid. Please request a new one.',
      success: null
    });
  }

  res.render('pages/reset-password', { token, error: null, success: null });
});

// POST /reset-password - Process new password
app.post('/reset-password', (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token) {
    return res.render('pages/reset-password', { token: null, error: 'Invalid reset link.', success: null });
  }

  const entry = passwordResetTokens.get(token);
  if (!entry || Date.now() > entry.expiresAt) {
    return res.render('pages/reset-password', {
      token: null,
      error: 'This reset link has expired or is invalid. Please request a new one.',
      success: null
    });
  }

  if (!password || password.length < 6) {
    return res.render('pages/reset-password', {
      token,
      error: 'Password must be at least 6 characters long.',
      success: null
    });
  }

  if (password !== confirmPassword) {
    return res.render('pages/reset-password', {
      token,
      error: 'Passwords do not match.',
      success: null
    });
  }

  // Update the user's password in the mock store
  const userToReset = mockUsers.find(u => u.user_id === entry.userId);
  if (userToReset) {
    userToReset.password = password;
    passwordResetTokens.delete(token);

    recordAuditLog({
      user: { user_id: userToReset.user_id, name: userToReset.name, email: userToReset.email, role: userToReset.role },
      action: 'RESET_PASSWORD',
      level: 'warning',
      details: `Password successfully reset for "${userToReset.email}"`,
      req
    });

    return res.render('pages/reset-password', {
      token: null,
      error: null,
      success: 'Your password has been updated! You can now sign in with your new password.'
    });
  }

  return res.render('pages/reset-password', { token: null, error: 'User not found.', success: null });
});

// 4.3 Drive Page (Protected)
app.get('/drive', requireAuthWeb, (req, res) => {
  const requestedFolderId = req.query.folder ? String(req.query.folder).trim() : null;
  const currentFolder = requestedFolderId ? mockFiles.find(f => f.file_id === requestedFolderId && f.category === 'folder' && canUserAccessFile(f, req.user)) : null;
  const currentFolderId = currentFolder ? currentFolder.file_id : null;

  // Build breadcrumb ancestry trail
  const breadcrumbs = [{ name: 'My Drive', id: null, url: '/drive' }];
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
        curr = mockFiles.find(f => f.file_id === curr.folder_id && f.category === 'folder');
      } else {
        break;
      }
    }
    breadcrumbs.push(...ancestors);
  }

  const activeFiles = mockFiles.filter(f => {
    if (f.status !== 'active') return false;
    const isOwner = f.owner_id === req.user.user_id || (req.user.user_id === 'user-normal-01' && f.owner_id === 'demo-user');
    if (!isOwner) return false;

    // Filter by folder hierarchy
    if (currentFolderId) {
      return f.folder_id === currentFolderId;
    } else {
      return !f.folder_id || f.folder_id === 'root';
    }
  });

  const storage = getUserStorage(req.user.user_id);
  // Sort activeFiles: Pinned items on top, Folders on top, Newest files first (descending by created_at)
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

  res.render('pages/homepage', {
    user: req.user,
    storage,
    currentFolderId,
    currentFolder,
    breadcrumbs,
    files: activeFiles.map(f => {
      const share = mockShares.find(s => s.file_id === f.file_id);
      const remainingDownloads = share && share.max_downloads > 0 ? Math.max(0, share.max_downloads - share.download_count) : 'Unlimited';
      const remainingHours = share && share.expires_at ? Math.max(0, Math.round((share.expires_at - Math.floor(Date.now() / 1000)) / 3600)) : null;

      return {
        id: f.file_id,
        name: f.filename,
        type: f.category === 'folder' ? 'folder' : 'file',
        size: f.size || 0,
        file_hash: f.file_hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        folderId: f.folder_id || null,
        category: f.category || (f.filename ? getCategoryFromExtension(f.filename) : 'other'),
        tags: Array.isArray(f.tags) ? f.tags : (f.category ? [f.category] : []),
        isPinned: Boolean(f.is_pinned),
        pinnedAt: f.pinned_at || null,
        owner: f.owner_id === req.user.user_id ? 'me' : (f.owner_id === 'demo-user' ? 'me' : f.owner_id),
        uploadDate: new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        accessList: f.access_list || [],
        isShared: Boolean(share),
        shareId: share ? share.share_id : null,
        shareUrl: share ? `/share/${share.share_id}` : null,
        shareMaxDownloads: share ? share.max_downloads : 0,
        shareDownloadsLeft: remainingDownloads,
        shareExpireHours: share && share.expires_at ? Math.max(1, Math.round((share.expires_at - Math.floor(new Date(share.created_at).getTime() / 1000)) / 3600)) : 24,
        shareRemainingHours: remainingHours,
        hasPassword: share ? Boolean(share.has_password) : false
      };
    })
  });
});

function getSharedWithMeForUser(user) {
  const userEmail = (user.email || '').toLowerCase();
  const defaultSharedWithMe = [
    {
      id: 'demo-shared-doc',
      shareId: 'demo-share-doc',
      name: 'Shared_Document.pdf',
      size: 1840000,
      category: 'document',
      tags: ['document', 'shared'],
      type: 'file',
      owner: 'Passakorn',
      ownerId: 'demo-passakorn',
      isOwner: false,
      uploadDate: '10 Oct. 2026',
      shareUrl: '/share/demo-share-doc',
      maxDownloads: 0,
      downloadsLeft: 'Unlimited',
      downloadCount: 0,
      hasPassword: false,
      remainingHours: 120,
      accessList: [{ name: 'Anan', permission: 'can view', timeRemaining: '5 days' }]
    }
  ];

  const invitedFiles = mockFiles.filter(f => {
    if (f.status === 'trash') return false;
    const isOwner = f.owner_id === user.user_id || (user.user_id === 'user-normal-01' && f.owner_id === 'demo-user');
    if (isOwner) return false;

    if (Array.isArray(f.dismissed_by) && (f.dismissed_by.includes(user.user_id) || f.dismissed_by.includes(userEmail))) {
      return false;
    }

    return canUserAccessFile(f, user);
  }).map(f => {
    const ownerUser = mockUsers.find(u => u.user_id === f.owner_id);
    const ownerName = ownerUser ? ownerUser.name : (f.owner_id || 'Shared Owner');
    const directEntry = Array.isArray(f.access_list) ? f.access_list.find(a => ((a.email || a.name || '').toLowerCase() === userEmail)) : null;
    const perm = directEntry ? directEntry.permission : 'can view';

    return {
      id: f.file_id,
      shareId: `invite-${f.file_id}`,
      name: f.filename,
      size: f.size || 0,
      category: f.category || (f.filename ? getCategoryFromExtension(f.filename) : 'other'),
      tags: f.tags || [],
      type: f.category === 'folder' ? 'folder' : 'file',
      owner: ownerName,
      ownerId: f.owner_id,
      isOwner: false,
      uploadDate: f.created_at ? new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently',
      shareUrl: null,
      maxDownloads: 0,
      downloadsLeft: 'Unlimited',
      downloadCount: 0,
      hasPassword: false,
      remainingHours: null,
      isDirectInvite: true,
      permission: perm,
      accessList: f.access_list || [{ name: user.name, permission: perm }]
    };
  });

  const publicSharedWithMe = mockShares
    .filter(s => s.owner_id !== user.user_id)
    .map(s => {
      const f = mockFiles.find(file => file.file_id === s.file_id) || {};
      const remainingDownloads = s.max_downloads > 0 ? Math.max(0, s.max_downloads - s.download_count) : 'Unlimited';
      const remainingHours = s.expires_at ? Math.max(0, Math.round((s.expires_at - Math.floor(Date.now() / 1000)) / 3600)) : null;
      return {
        id: s.file_id,
        shareId: s.share_id,
        name: s.filename || f.filename || 'Shared File',
        size: f.size || 0,
        category: f.category || (f.filename ? getCategoryFromExtension(f.filename) : 'other'),
        tags: f.tags || [],
        type: 'file',
        owner: s.owner_email || s.owner_id || 'Shared Link',
        ownerId: s.owner_id,
        isOwner: false,
        uploadDate: new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        shareUrl: `/share/${s.share_id}`,
        maxDownloads: s.max_downloads,
        downloadsLeft: remainingDownloads,
        downloadCount: s.download_count,
        hasPassword: Boolean(s.has_password),
        remainingHours,
        accessList: [{
          name: s.has_password ? 'Protected (PW)' : 'Anyone with link',
          permission: s.max_downloads > 0 ? `Limit: ${remainingDownloads}` : 'can view',
          timeRemaining: remainingHours !== null ? `${remainingHours} hrs` : 'Unlimited'
        }]
      };
    });

  return [
    ...defaultSharedWithMe.filter(d => !Array.isArray(d.dismissed_by) || (!d.dismissed_by.includes(user.user_id) && !d.dismissed_by.includes(userEmail))),
    ...invitedFiles,
    ...publicSharedWithMe
  ];
}

// 4.4 Shared Page (Protected)
app.get('/shared', requireAuthWeb, (req, res) => {
  // Map active shares
  const allShares = mockShares.map(s => {
    const f = mockFiles.find(file => file.file_id === s.file_id) || {};
    const remainingDownloads = s.max_downloads > 0 ? Math.max(0, s.max_downloads - s.download_count) : 'Unlimited';
    const remainingHours = s.expires_at ? Math.max(0, Math.round((s.expires_at - Math.floor(Date.now() / 1000)) / 3600)) : null;
    const isOwner = s.owner_id === req.user.user_id;

    return {
      id: s.file_id,
      shareId: s.share_id,
      name: s.filename || f.filename || 'Shared File',
      size: f.size || 0,
      category: f.category || (f.filename ? getCategoryFromExtension(f.filename) : 'other'),
      tags: f.tags || [],
      type: 'file',
      owner: isOwner ? 'me' : (s.owner_email || s.owner_id || 'Shared Link'),
      ownerId: s.owner_id,
      isOwner,
      uploadDate: new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      shareUrl: `/share/${s.share_id}`,
      maxDownloads: s.max_downloads,
      downloadsLeft: remainingDownloads,
      downloadCount: s.download_count,
      expireHours: s.expires_at ? Math.max(1, Math.round((s.expires_at - Math.floor(new Date(s.created_at).getTime() / 1000)) / 3600)) : 24,
      remainingHours,
      hasPassword: Boolean(s.has_password),
      accessList: [{
        name: s.has_password ? 'Protected (PW)' : 'Anyone with link',
        permission: s.max_downloads > 0 ? `Limit: ${remainingDownloads}` : 'can view',
        timeRemaining: remainingHours !== null ? `${remainingHours} hrs` : 'Unlimited'
      }]
    };
  });

  const defaultSharedWithMe = [
    {
      id: 'demo-shared-doc',
      shareId: 'demo-share-doc',
      name: 'Shared_Document.pdf',
      size: 1840000,
      category: 'document',
      tags: ['document', 'shared'],
      type: 'file',
      owner: 'Passakorn',
      ownerId: 'demo-passakorn',
      isOwner: false,
      uploadDate: '10 Oct. 2026',
      shareUrl: '/share/demo-share-doc',
      maxDownloads: 0,
      downloadsLeft: 'Unlimited',
      downloadCount: 0,
      hasPassword: false,
      remainingHours: 120,
      accessList: [{ name: 'Anan', permission: 'can view', timeRemaining: '5 days' }]
    }
  ];

  // Divide into Shared By Me and Shared With Me
  const sharedByMe = allShares.filter(s => s.isOwner);
  const sharedWithMe = getSharedWithMeForUser(req.user);

  const storage = getUserStorage(req.user.user_id);
  res.render('pages/shared', {
    user: req.user,
    storage,
    sharedByMe,
    sharedWithMe,
    files: [...sharedWithMe, ...sharedByMe] // backward compatible fallback
  });
});

function filterRootTrashedFiles(files = mockFiles, userId) {
  // Pre-collect all trashed folder IDs in O(N)
  const trashedFolderIdSet = new Set(
    files.filter(f => f.status === 'trash' && f.category === 'folder').map(f => f.file_id)
  );

  return files.filter(f => {
    if (f.status !== 'trash') return false;
    const isOwner = f.owner_id === userId || (userId === 'user-normal-01' && f.owner_id === 'demo-user');
    if (!isOwner) return false;

    // Root-level trashed filtering in O(1): hide items whose parent folder is also in trash
    if (f.folder_id && f.folder_id !== 'root') {
      if (trashedFolderIdSet.has(f.folder_id)) return false;
    }
    return true;
  });
}

// 4.5 Trash Page (Protected)
app.get('/trash', requireAuthWeb, (req, res) => {
  const trashedFiles = filterRootTrashedFiles(mockFiles, req.user.user_id);
  const storage = getUserStorage(req.user.user_id);
  // Sort trashedFiles: Folders on top, Newest trashed files first
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

  res.render('pages/trash', {
    user: req.user,
    storage,
    files: trashedFiles.map(f => ({
      id: f.file_id,
      name: f.filename,
      type: f.category === 'folder' ? 'folder' : 'file',
      category: f.category || 'other',
      owner: 'me',
      trashedAt: new Date(f.trashed_at || f.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    }))
  });
});

function emptyUserTrash({ files = mockFiles, userStorage = mockUserStorage, userId, storageModule = storage }) {
  const trashedItems = files.filter(f => {
    if (f.status !== 'trash') return false;
    return f.owner_id === userId || (userId === 'user-normal-01' && f.owner_id === 'demo-user');
  });

  const trashedFolderIds = new Set(
    trashedItems.filter(f => f.category === 'folder').map(f => f.file_id)
  );

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

  // Background non-blocking disk purge
  let purgePromise = null;
  if (storageModule) {
    const foldersToPurge = trashedItems.filter(f => f.category === 'folder');
    const standaloneFilesToPurge = trashedItems.filter(f => f.category !== 'folder' && (!f.folder_id || !trashedFolderIds.has(f.folder_id)));

    purgePromise = new Promise(resolve => {
      setImmediate(async () => {
        try {
          for (const item of foldersToPurge) {
            if (item.owner_id) {
              if (typeof storageModule.deleteStoredFolderAsync === 'function') {
                await storageModule.deleteStoredFolderAsync(item.owner_id, item.file_id);
              } else if (typeof storageModule.deleteStoredFolder === 'function') {
                storageModule.deleteStoredFolder(item.owner_id, item.file_id);
              }
            }
          }
          for (const file of standaloneFilesToPurge) {
            if (typeof storageModule.deleteStoredFile === 'function') {
              storageModule.deleteStoredFile(file);
            }
          }
        } catch (purgeErr) {
          console.warn('Background empty trash purge error:', purgeErr.message);
        } finally {
          resolve();
        }
      });
    });
  }

  if (totalSizeFreed > 0 && userStorage) {
    userStorage.totalUsed = Math.max(0, (userStorage.totalUsed || 0) - totalSizeFreed);
    if (userStorage.breakdown) {
      for (const [cat, sz] of Object.entries(categoryFreed)) {
        if (userStorage.breakdown[cat] !== undefined) {
          userStorage.breakdown[cat] = Math.max(0, userStorage.breakdown[cat] - sz);
        }
      }
    }
  }

  const trashedIds = new Set(trashedItems.map(f => f.file_id));
  const remainingFiles = files.filter(f => !trashedIds.has(f.file_id));
  if (storageModule && storageModule.saveMockFiles) {
    storageModule.saveMockFiles(remainingFiles, false);
  }

  return {
    purgedCount: trashedItems.length,
    totalSizeFreed,
    remainingFiles,
    purgePromise
  };
}

app.post('/trash/empty', requireAuthWeb, (req, res) => {
  let result = { purgedCount: 0, totalSizeFreed: 0 };
  if (IS_MOCK_MODE) {
    result = emptyUserTrash({
      files: mockFiles,
      userStorage: mockUserStorage,
      userId: req.user.user_id,
      storageModule: storage
    });
    mockFiles = result.remainingFiles;
    recordAuditLog({ user: req.user, action: 'PERMANENT_DELETE', level: 'critical', details: `Emptied entire trash bin (${result.purgedCount} items purged)` });
  }

  const wantsJson = (req.headers.accept && req.headers.accept.includes('application/json')) || req.xhr;
  if (wantsJson) {
    return res.json({
      success: true,
      purgedCount: result.purgedCount,
      totalSizeFreed: result.totalSizeFreed
    });
  }

  res.redirect('/trash');
});

// 4.6 Admin Pages (Admin-Only Guard)
app.get(['/management', '/admin'], requireAdminWeb, (req, res) => {
  const totalUsers = mockUsers.length;
  const adminCount = mockUsers.filter(u => u.role === 'admin').length;
  const userCount = totalUsers - adminCount;
  const storage = getUserStorage(req.user.user_id);
  res.render('pages/usermanagement', {
    user: req.user,
    users: mockUsers.map(u => ({
      ...u,
      storageFormatted: formatBytes(getUserStorage(u.user_id).totalUsed)
    })),
    totalUsers,
    adminCount,
    userCount,
    storage
  });
});

app.get('/audit', requireAdminWeb, (req, res) => {
  const totalEvents = mockAuditLogs.length;
  const warningCount = mockAuditLogs.filter(l => l.level === 'warning').length;
  const criticalCount = mockAuditLogs.filter(l => l.level === 'critical').length;
  const storage = getUserStorage(req.user.user_id);
  res.render('pages/audit', {
    user: req.user,
    logs: mockAuditLogs,
    stats: { totalEvents, warningCount, criticalCount },
    storage
  });
});

// 4.7 Public Share Page (Public access, no login required)
app.get('/share/:id', async (req, res) => {
  const shareId = req.params.id;
  let share = null;

  if (IS_MOCK_MODE) {
    share = mockShares.find(s => s.share_id === shareId);
    if (share && (!share.filename || !share.size)) {
      const f = mockFiles.find(file => file.file_id === share.file_id);
      if (f) {
        share.filename = f.filename;
        share.size = f.size;
        share.category = f.category;
      }
    }
  } else {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: SHARES_TABLE,
        Key: { share_id: shareId }
      }));
      share = result.Item;
      if (share && (!share.filename || !share.size)) {
        const fileRes = await docClient.send(new GetCommand({
          TableName: FILES_TABLE,
          Key: { file_id: share.file_id }
        }));
        if (fileRes.Item) {
          share.filename = fileRes.Item.filename;
          share.size = fileRes.Item.size;
          share.category = fileRes.Item.category;
        }
      }
    } catch (err) {
      console.error('Get share link error:', err);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const isExpired = share ? (share.expires_at && now > share.expires_at) : true;
  const isLimitReached = share ? (share.max_downloads > 0 && share.download_count >= share.max_downloads) : false;

  res.render('pages/public-share', {
    share,
    isExpired,
    isLimitReached
  });
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
    let files = mockFiles.filter(f => {
      if (f.status !== statusFilter) return false;
      return f.owner_id === req.user.user_id || (req.user.user_id === 'user-normal-01' && f.owner_id === 'demo-user');
    });
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
  const { folderName, folder_id, parent_id, reuseExisting } = req.body;
  if (!folderName) {
    return res.status(400).json({ error: 'folderName is required' });
  }

  const parentFolderId = folder_id || parent_id || null;

  if (reuseExisting) {
    if (IS_MOCK_MODE) {
      const existingFolder = mockFiles.find(f =>
        (f.owner_id === req.user.user_id || (req.user.user_id === 'user-normal-01' && f.owner_id === 'demo-user')) &&
        f.status === 'active' &&
        f.category === 'folder' &&
        f.filename === folderName &&
        (f.folder_id || null) === parentFolderId
      );
      if (existingFolder) {
        return res.json({ success: true, file: existingFolder, reused: true });
      }
    } else {
      try {
        const queryCmd = new QueryCommand({
          TableName: FILES_TABLE,
          IndexName: 'OwnerIndex',
          KeyConditionExpression: 'owner_id = :owner',
          FilterExpression: '#st = :status AND #fn = :filename AND #cat = :category',
          ExpressionAttributeNames: {
            '#st': 'status',
            '#fn': 'filename',
            '#cat': 'category'
          },
          ExpressionAttributeValues: {
            ':owner': req.user.user_id,
            ':status': 'active',
            ':filename': folderName,
            ':category': 'folder'
          }
        });
        const queryRes = await docClient.send(queryCmd);
        const matched = (queryRes.Items || []).find(f => (f.folder_id || null) === parentFolderId);
        if (matched) {
          return res.json({ success: true, file: matched, reused: true });
        }
      } catch (err) {
        console.warn('Error checking existing folder in DynamoDB:', err);
      }
    }
  }

  const fileId = `folder-${crypto.randomUUID()}`;
  const newFolder = {
    file_id: fileId,
    owner_id: req.user.user_id,
    folder_id: parentFolderId,
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
    storage.saveMockFiles(mockFiles);
    recordAuditLog({ user: req.user, action: 'CREATE_FOLDER', level: 'info', details: `Created folder "${folderName}"` });
    return res.json({ success: true, file: newFolder });
  }

  try {
    await docClient.send(new PutCommand({
      TableName: FILES_TABLE,
      Item: newFolder
    }));
    recordAuditLog({ user: req.user, action: 'CREATE_FOLDER', level: 'info', details: `Created folder "${folderName}"` });
    res.json({ success: true, file: newFolder });
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Mock download endpoint (for local mock mode)
app.get('/mock-download/:filename', (req, res) => {
  const storedPath = storage.findStoredFile(req.params.filename);
  if (storedPath) {
    return res.sendFile(storedPath);
  }
  res.send(`Mock Download Content for file: ${req.params.filename}`);
});

// 5.3 Request Presigned Upload URL
app.post('/api/files/upload-url', authMiddleware, async (req, res) => {
  const filename = req.body.filename || req.body.name;
  const { size, contentType, folder_id, parent_id } = req.body;
  const parentFolderId = folder_id || parent_id || null;
  if (!filename || !size) {
    return res.status(400).json({ error: 'filename and size are required' });
  }

  // Quota Guard: Enforce storage quota limits
  const currentStorage = getUserStorage(req.user.user_id);
  const requestedBytes = Number(size);
  if (currentStorage.totalUsed + requestedBytes > currentStorage.quota) {
    return res.status(400).json({
      error: `Storage quota exceeded. You have ${currentStorage.formattedFree} free space remaining out of ${currentStorage.formattedQuota}.`
    });
  }

  const fileId = `file-${crypto.randomUUID()}`;
  const s3Key = parentFolderId
    ? `uploads/${req.user.user_id}/${parentFolderId}/${fileId}/${filename}`
    : `uploads/${req.user.user_id}/${fileId}/${filename}`;
  const category = getCategoryFromExtension(filename);

  if (IS_MOCK_MODE) {
    const mockFileRecord = {
      file_id: fileId,
      owner_id: req.user.user_id,
      folder_id: parentFolderId,
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
    storage.saveMockFiles(mockFiles);

    // Update mock storage breakdown
    mockUserStorage.totalUsed += Number(size);
    mockUserStorage.breakdown[category] = (mockUserStorage.breakdown[category] || 0) + Number(size);

    recordAuditLog({
      user: req.user,
      action: 'UPLOAD',
      level: 'info',
      details: `Uploaded 1 file (${category}, ${formatBytes(Number(size))})`,
      metadata: {
        file_id: fileId,
        category,
        size: Number(size),
        count: 1
      }
    });

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    return res.json({
      success: true,
      file_id: fileId,
      key: s3Key,
      uploadUrl: `${protocol}://${host}/mock-upload?key=${encodeURIComponent(s3Key)}`,
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
      folder_id: parentFolderId,
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

// 5.3.1 Request Batch Presigned Upload URLs
app.post('/api/files/batch-upload-urls', authMiddleware, async (req, res) => {
  const filesList = req.body.files;
  if (!filesList || !Array.isArray(filesList) || filesList.length === 0) {
    return res.status(400).json({ error: 'files array is required and must not be empty' });
  }

  // Quota Guard: Enforce storage quota limits across all files in the batch
  const currentStorage = getUserStorage(req.user.user_id);
  const totalBatchBytes = filesList.reduce((acc, f) => acc + (Number(f.size) || 0), 0);
  if (currentStorage.totalUsed + totalBatchBytes > currentStorage.quota) {
    return res.status(400).json({
      error: `Storage quota exceeded. You have ${currentStorage.formattedFree} free space remaining out of ${currentStorage.formattedQuota}.`
    });
  }

  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol || 'http';
  const items = [];
  const newMockRecords = [];
  const categoryFreed = {};

  if (IS_MOCK_MODE) {
    for (const fileItem of filesList) {
      const filename = fileItem.filename || fileItem.name;
      const size = Number(fileItem.size) || 0;
      const parentFolderId = fileItem.folder_id || fileItem.parent_id || null;
      const fileId = `file-${crypto.randomUUID()}`;
      const s3Key = parentFolderId
        ? `uploads/${req.user.user_id}/${parentFolderId}/${fileId}/${filename}`
        : `uploads/${req.user.user_id}/${fileId}/${filename}`;
      const category = getCategoryFromExtension(filename);

      const mockFileRecord = {
        file_id: fileId,
        owner_id: req.user.user_id,
        folder_id: parentFolderId,
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
      categoryFreed[category] = (categoryFreed[category] || 0) + size;

      items.push({
        file_id: fileId,
        filename,
        key: s3Key,
        s3_key: s3Key,
        uploadUrl: `${protocol}://${host}/mock-upload?key=${encodeURIComponent(s3Key)}`,
        file: mockFileRecord
      });
    }

    mockFiles.unshift(...newMockRecords);
    storage.saveMockFiles(mockFiles);

    mockUserStorage.totalUsed += totalBatchBytes;
    for (const [cat, sz] of Object.entries(categoryFreed)) {
      mockUserStorage.breakdown[cat] = (mockUserStorage.breakdown[cat] || 0) + sz;
    }

    recordAuditLog({
      user: req.user,
      action: 'UPLOAD',
      level: 'info',
      details: `Batch uploaded ${items.length} files (${formatBytes(totalBatchBytes)})`,
      metadata: {
        file_ids: items.map(item => item.file_id),
        count: items.length,
        total_bytes: totalBatchBytes
      }
    });

    return res.json({
      success: true,
      items
    });
  }

  try {
    for (const fileItem of filesList) {
      const filename = fileItem.filename || fileItem.name;
      const size = Number(fileItem.size) || 0;
      const parentFolderId = fileItem.folder_id || fileItem.parent_id || null;
      const fileId = `file-${crypto.randomUUID()}`;
      const s3Key = parentFolderId
        ? `uploads/${req.user.user_id}/${parentFolderId}/${fileId}/${filename}`
        : `uploads/${req.user.user_id}/${fileId}/${filename}`;

      const putCommand = new PutObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: s3Key,
        ContentType: fileItem.contentType || 'application/octet-stream'
      });
      const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 900 });

      const newFile = {
        file_id: fileId,
        owner_id: req.user.user_id,
        folder_id: parentFolderId,
        filename,
        size,
        category: getCategoryFromExtension(filename),
        s3_key: s3Key,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await docClient.send(new PutCommand({
        TableName: FILES_TABLE,
        Item: newFile
      }));

      items.push({
        file_id: fileId,
        filename,
        key: s3Key,
        s3_key: s3Key,
        uploadUrl,
        file: newFile
      });
    }

    return res.json({
      success: true,
      items
    });
  } catch (err) {
    console.error('Batch presigned URL error:', err);
    res.status(500).json({ error: 'Failed to generate batch upload URLs' });
  }
});

// 5.3.9 Download Entire Folder as ZIP Archive
app.get('/api/folders/:id/download-zip', authMiddleware, async (req, res) => {
  const folderId = req.params.id;

  if (IS_MOCK_MODE) {
    mockFiles = storage.loadMockFiles();
    const folder = mockFiles.find(f => f.file_id === folderId);
    if (!folder || !canUserAccessFile(folder, req.user) || folder.status === 'trash') {
      return res.status(404).json({ error: 'Folder not found' });
    }
    if (folder.category !== 'folder') {
      return res.status(400).json({ error: 'Requested item is not a folder' });
    }

    // Build hierarchical entries
    const entries = [];
    entries.push({
      path: folder.filename,
      isFolder: true,
      date: folder.created_at || folder.uploadDate
    });

    const folderPathMap = new Map();
    folderPathMap.set(folder.file_id, folder.filename);

    const childrenMap = new Map();
    for (const f of mockFiles) {
      if (!f.folder_id) continue;
      let list = childrenMap.get(f.folder_id);
      if (!list) {
        list = [];
        childrenMap.set(f.folder_id, list);
      }
      list.push(f);
    }

    const queue = [folder.file_id];
    let head = 0;
    while (head < queue.length) {
      const parentId = queue[head++];
      const parentPath = folderPathMap.get(parentId);
      const children = childrenMap.get(parentId) || [];

      for (const child of children) {
        if (child.status === 'trash') continue;
        if (!canUserAccessFile(child, req.user)) continue;

        const relPath = `${parentPath}/${child.filename}`;
        if (child.category === 'folder') {
          folderPathMap.set(child.file_id, relPath);
          queue.push(child.file_id);
          entries.push({
            path: relPath,
            isFolder: true,
            date: child.created_at || child.uploadDate
          });
        } else {
          let content = Buffer.alloc(0);
          const storedPath = storage.findStoredFile ? storage.findStoredFile(child) : null;
          if (storedPath && fs.existsSync(storedPath)) {
            try {
              content = fs.readFileSync(storedPath);
            } catch (_) {}
          } else if (child.content) {
            content = Buffer.isBuffer(child.content) ? child.content : Buffer.from(child.content);
          } else {
            content = Buffer.from(`Sample content for ${child.filename}`);
          }

          entries.push({
            path: relPath,
            content,
            isFolder: false,
            date: child.created_at || child.uploadDate
          });
        }
      }
    }

    const zipBuffer = createZipArchive(entries);

    recordAuditLog({
      user: req.user,
      action: 'FOLDER_DOWNLOAD_ZIP',
      level: 'info',
      details: `Downloaded folder "${folder.filename}" as ZIP (${entries.length} items)`
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folder.filename)}.zip"`);
    return res.send(zipBuffer);
  }

  // DynamoDB & S3 production mode
  try {
    const getRes = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { file_id: folderId }
    }));
    const folder = getRes.Item;
    if (!folder || !canUserAccessFile(folder, req.user) || folder.status === 'trash') {
      return res.status(404).json({ error: 'Folder not found' });
    }
    if (folder.category !== 'folder') {
      return res.status(400).json({ error: 'Requested item is not a folder' });
    }

    const scanRes = await docClient.send(new ScanCommand({
      TableName: FILES_TABLE,
      FilterExpression: 'owner_id = :owner AND (attribute_not_exists(#st) OR #st <> :trash)',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: {
        ':owner': req.user.user_id,
        ':trash': 'trash'
      }
    }));
    const allFiles = scanRes.Items || [];

    const entries = [];
    entries.push({
      path: folder.filename,
      isFolder: true,
      date: folder.created_at || folder.uploadDate
    });

    const folderPathMap = new Map();
    folderPathMap.set(folder.file_id, folder.filename);

    const childrenMap = new Map();
    for (const f of allFiles) {
      if (!f.folder_id) continue;
      let list = childrenMap.get(f.folder_id);
      if (!list) {
        list = [];
        childrenMap.set(f.folder_id, list);
      }
      list.push(f);
    }

    const queue = [folder.file_id];
    let head = 0;
    while (head < queue.length) {
      const parentId = queue[head++];
      const parentPath = folderPathMap.get(parentId);
      const children = childrenMap.get(parentId) || [];

      for (const child of children) {
        const relPath = `${parentPath}/${child.filename}`;
        if (child.category === 'folder') {
          folderPathMap.set(child.file_id, relPath);
          queue.push(child.file_id);
          entries.push({
            path: relPath,
            isFolder: true,
            date: child.created_at || child.uploadDate
          });
        } else {
          let content = Buffer.alloc(0);
          if (child.s3_key) {
            try {
              const s3Res = await s3Client.send(new GetObjectCommand({
                Bucket: STORAGE_BUCKET,
                Key: child.s3_key
              }));
              const chunks = [];
              for await (const chunk of s3Res.Body) {
                chunks.push(chunk);
              }
              content = Buffer.concat(chunks);
            } catch (s3Err) {
              console.warn(`Could not read S3 key ${child.s3_key}:`, s3Err.message);
            }
          }
          entries.push({
            path: relPath,
            content,
            isFolder: false,
            date: child.created_at || child.uploadDate
          });
        }
      }
    }

    const zipBuffer = createZipArchive(entries);

    recordAuditLog({
      user: req.user,
      action: 'FOLDER_DOWNLOAD_ZIP',
      level: 'info',
      details: `Downloaded folder "${folder.filename}" as ZIP (${entries.length} items)`
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folder.filename)}.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Download folder zip error:', err);
    res.status(500).json({ error: 'Failed to package folder zip' });
  }
});

// 5.3.10 Batch Download Selected Files as ZIP Archive
app.post('/api/files/batch-download-zip', authMiddleware, async (req, res) => {
  const { file_ids } = req.body || {};
  if (!Array.isArray(file_ids) || file_ids.length === 0) {
    return res.status(400).json({ error: 'file_ids array is required' });
  }

  if (IS_MOCK_MODE) {
    mockFiles = storage.loadMockFiles();
    const targetFiles = mockFiles.filter(f => file_ids.includes(f.file_id) && canUserAccessFile(f, req.user) && f.status !== 'trash');
    if (targetFiles.length === 0) {
      return res.status(404).json({ error: 'No accessible files found to package' });
    }

    const entries = [];
    const childrenMap = new Map();
    for (const f of mockFiles) {
      if (!f.folder_id) continue;
      let list = childrenMap.get(f.folder_id);
      if (!list) {
        list = [];
        childrenMap.set(f.folder_id, list);
      }
      list.push(f);
    }

    for (const target of targetFiles) {
      if (target.category === 'folder') {
        // Collect folder hierarchy
        entries.push({
          path: target.filename,
          isFolder: true,
          date: target.created_at || target.uploadDate
        });

        const folderPathMap = new Map();
        folderPathMap.set(target.file_id, target.filename);

        const queue = [target.file_id];
        let head = 0;
        while (head < queue.length) {
          const parentId = queue[head++];
          const parentPath = folderPathMap.get(parentId);
          const children = childrenMap.get(parentId) || [];

          for (const child of children) {
            if (child.status === 'trash') continue;
            if (!canUserAccessFile(child, req.user)) continue;

            const relPath = `${parentPath}/${child.filename}`;
            if (child.category === 'folder') {
              folderPathMap.set(child.file_id, relPath);
              queue.push(child.file_id);
              entries.push({
                path: relPath,
                isFolder: true,
                date: child.created_at || child.uploadDate
              });
            } else {
              let content = Buffer.alloc(0);
              const storedPath = storage.findStoredFile ? storage.findStoredFile(child) : null;
              if (storedPath && fs.existsSync(storedPath)) {
                try { content = fs.readFileSync(storedPath); } catch (_) {}
              } else if (child.content) {
                content = Buffer.isBuffer(child.content) ? child.content : Buffer.from(child.content);
              } else {
                content = Buffer.from(`Sample content for ${child.filename}`);
              }

              entries.push({
                path: relPath,
                content,
                isFolder: false,
                date: child.created_at || child.uploadDate
              });
            }
          }
        }
      } else {
        // Single file at root of ZIP
        let content = Buffer.alloc(0);
        const storedPath = storage.findStoredFile ? storage.findStoredFile(target) : null;
        if (storedPath && fs.existsSync(storedPath)) {
          try { content = fs.readFileSync(storedPath); } catch (_) {}
        } else if (target.content) {
          content = Buffer.isBuffer(target.content) ? target.content : Buffer.from(target.content);
        } else {
          content = Buffer.from(`Sample content for ${target.filename}`);
        }

        entries.push({
          path: target.filename,
          content,
          isFolder: false,
          date: target.created_at || target.uploadDate
        });
      }
    }

    const zipBuffer = createZipArchive(entries);

    recordAuditLog({
      user: req.user,
      action: 'BATCH_DOWNLOAD_ZIP',
      level: 'info',
      details: `Batch downloaded ${targetFiles.length} item(s) as ZIP (${entries.length} archive entries)`
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="EasyDrive_Batch_Download.zip"');
    return res.send(zipBuffer);
  }

  // DynamoDB / S3 mode
  try {
    const entries = [];
    for (const fileId of file_ids) {
      const result = await docClient.send(new GetCommand({
        TableName: FILES_TABLE,
        Key: { file_id: fileId }
      }));
      const file = result.Item;
      if (!file || file.owner_id !== req.user.user_id || file.status === 'trash') continue;

      let content = Buffer.alloc(0);
      if (file.s3_key) {
        const getCommand = new GetObjectCommand({
          Bucket: STORAGE_BUCKET,
          Key: file.s3_key
        });
        const s3Res = await s3Client.send(getCommand);
        const chunks = [];
        for await (const chunk of s3Res.Body) {
          chunks.push(chunk);
        }
        content = Buffer.concat(chunks);
      }

      entries.push({
        path: file.filename,
        content,
        isFolder: file.category === 'folder',
        date: file.created_at
      });
    }

    const zipBuffer = createZipArchive(entries);

    recordAuditLog({
      user: req.user,
      action: 'BATCH_DOWNLOAD_ZIP',
      level: 'info',
      details: `Batch downloaded ${entries.length} items as ZIP`
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="EasyDrive_Batch_Download.zip"');
    res.send(zipBuffer);
  } catch (err) {
    console.error('Batch download zip error:', err);
    res.status(500).json({ error: 'Failed to package batch download ZIP' });
  }
});

// 5.4 Request Download URL (Owner Download)
app.get('/api/files/:id/download-url', authMiddleware, async (req, res) => {
  const fileId = req.params.id;

  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user));
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

// 5.4.1 Stream File Content Inline (For Preview / Media Streaming)
app.get('/api/files/:id/content', authMiddleware, async (req, res) => {
  const fileId = req.params.id;

  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (!file) return res.status(404).json({ error: 'File not found or unauthorized' });

    const storedPath = storage.findStoredFile(file);
    if (!storedPath) {
      return res.status(404).json({ error: 'File content not found in local storage' });
    }

    const mime = getMimeType(file.filename);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
    return res.sendFile(storedPath);
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId }
    }));
    const file = result.Item;
    if (!file || !canUserAccessFile(file, req.user)) {
      return res.status(404).json({ error: 'File not found or unauthorized' });
    }

    const mime = getMimeType(file.filename);
    const getCommand = new GetObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: file.s3_key,
      ResponseContentType: mime,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(file.filename)}"`
    });
    const inlineUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 900 });
    return res.redirect(inlineUrl);
  } catch (err) {
    console.error('File content error:', err);
    res.status(500).json({ error: 'Failed to retrieve file content' });
  }
});

// 5.4.2 Request Preview URL & Metadata
app.get('/api/files/:id/preview-url', authMiddleware, async (req, res) => {
  const fileId = req.params.id;

  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (!file) return res.status(404).json({ error: 'File not found or unauthorized' });

    return res.json({
      success: true,
      file_id: file.file_id,
      filename: file.filename,
      category: file.category,
      size: file.size,
      mimeType: getMimeType(file.filename),
      previewUrl: `/api/files/${file.file_id}/content`
    });
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId }
    }));
    const file = result.Item;
    if (!file || !canUserAccessFile(file, req.user)) {
      return res.status(404).json({ error: 'File not found or unauthorized' });
    }

    const mime = getMimeType(file.filename);
    const getCommand = new GetObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: file.s3_key,
      ResponseContentType: mime,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(file.filename)}"`
    });
    const previewUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 900 });

    res.json({
      success: true,
      file_id: file.file_id,
      filename: file.filename,
      category: file.category,
      size: file.size,
      mimeType: mime,
      previewUrl
    });
  } catch (err) {
    console.error('Preview URL error:', err);
    res.status(500).json({ error: 'Failed to generate preview URL' });
  }
});

// 5.5 Rename File
app.patch('/api/files/:id', authMiddleware, async (req, res) => {
  const fileId = req.params.id;
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename is required' });

  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (!file) return res.status(404).json({ error: 'File not found' });
    file.filename = filename;
    file.updated_at = new Date().toISOString();
    storage.saveMockFiles(mockFiles);
    recordAuditLog({ user: req.user, action: 'RENAME', level: 'info', details: `Renamed file to "${filename}"` });
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
    recordAuditLog({ user: req.user, action: 'RENAME', level: 'info', details: `Renamed file to "${filename}"` });
    res.json({ success: true, file: result.Attributes });
  } catch (err) {
    console.error('Rename error:', err);
    res.status(500).json({ error: 'Failed to rename file' });
  }
});

// 5.5.1 Update File Tags
app.patch('/api/files/:id/tags', authMiddleware, async (req, res) => {
  const fileId = req.params.id;
  let { tags } = req.body;
  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: 'tags must be an array of strings' });
  }
  // Sanitize tags: trim, lowercase, remove duplicates and empties
  tags = Array.from(new Set(tags.map(t => String(t).trim().toLowerCase()).filter(t => t.length > 0)));

  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (!file) return res.status(404).json({ error: 'File not found' });
    file.tags = tags;
    file.updated_at = new Date().toISOString();
    storage.saveMockFiles(mockFiles);
    recordAuditLog({ user: req.user, action: 'UPDATE_TAGS', level: 'info', details: `Updated tags for "${file.filename}" to: [${tags.join(', ')}]` });
    return res.json({ success: true, file, tags });
  }

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId },
      ConditionExpression: 'owner_id = :owner',
      UpdateExpression: 'SET tags = :tags, updated_at = :up',
      ExpressionAttributeValues: {
        ':tags': tags,
        ':up': new Date().toISOString(),
        ':owner': req.user.user_id
      },
      ReturnValues: 'ALL_NEW'
    }));
    recordAuditLog({ user: req.user, action: 'UPDATE_TAGS', level: 'info', details: `Updated tags for file ${fileId} to: [${tags.join(', ')}]` });
    res.json({ success: true, file: result.Attributes, tags });
  } catch (err) {
    console.error('Update tags error:', err);
    res.status(500).json({ error: 'Failed to update file tags' });
  }
});

// 5.5.2 Move File or Folder (Drag and Drop)
app.patch('/api/files/:id/move', authMiddleware, async (req, res) => {
  const fileId = req.params.id;
  const { target_folder_id } = req.body;

  // Normalize target folder: null, undefined, or 'root' means root directory
  const targetFolderId = (!target_folder_id || target_folder_id === 'root') ? null : String(target_folder_id);

  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (!file) return res.status(404).json({ error: 'File not found' });

    // If target folder is specified, validate destination
    if (targetFolderId) {
      const targetFolder = mockFiles.find(f => f.file_id === targetFolderId && f.category === 'folder');
      if (!targetFolder || targetFolder.status === 'trash') {
        return res.status(404).json({ error: 'Destination folder not found' });
      }

      // Prevent cyclic folder moving
      if (file.category === 'folder') {
        if (targetFolderId === file.file_id) {
          return res.status(400).json({ error: 'Cannot move folder into itself' });
        }
        const descendants = getFolderDescendantIds(file.file_id, mockFiles);
        if (descendants.includes(targetFolderId)) {
          return res.status(400).json({ error: 'Cannot move folder into its own subfolder' });
        }
      }
    }

    file.folder_id = targetFolderId;
    file.updated_at = new Date().toISOString();
    storage.saveMockFiles(mockFiles);

    const destName = targetFolderId
      ? (mockFiles.find(f => f.file_id === targetFolderId)?.filename || targetFolderId)
      : 'My Drive (root)';

    recordAuditLog({
      user: req.user,
      action: 'FILE_MOVE',
      level: 'info',
      details: `Moved "${file.filename}" to ${destName}`
    });

    return res.json({ success: true, file, target_folder_id: targetFolderId });
  }

  try {
    const getRes = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId }
    }));
    const file = getRes.Item;
    if (!file || !canUserAccessFile(file, req.user)) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (targetFolderId) {
      const targetRes = await docClient.send(new GetCommand({
        TableName: FILES_TABLE,
        Key: { file_id: targetFolderId }
      }));
      const targetFolder = targetRes.Item;
      if (!targetFolder || targetFolder.category !== 'folder' || targetFolder.status === 'trash') {
        return res.status(404).json({ error: 'Destination folder not found' });
      }

      if (file.category === 'folder') {
        if (targetFolderId === file.file_id) {
          return res.status(400).json({ error: 'Cannot move folder into itself' });
        }
        const scanRes = await docClient.send(new ScanCommand({
          TableName: FILES_TABLE,
          FilterExpression: 'owner_id = :owner',
          ExpressionAttributeValues: { ':owner': req.user.user_id }
        }));
        const descendants = getFolderDescendantIds(file.file_id, scanRes.Items || []);
        if (descendants.includes(targetFolderId)) {
          return res.status(400).json({ error: 'Cannot move folder into its own subfolder' });
        }
      }
    }

    const updateRes = await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId },
      UpdateExpression: 'SET folder_id = :fid, updated_at = :up',
      ExpressionAttributeValues: {
        ':fid': targetFolderId,
        ':up': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));

    const destName = targetFolderId ? targetFolderId : 'My Drive (root)';
    recordAuditLog({
      user: req.user,
      action: 'FILE_MOVE',
      level: 'info',
      details: `Moved "${file.filename}" to ${destName}`
    });

    res.json({ success: true, file: updateRes.Attributes, target_folder_id: targetFolderId });
  } catch (err) {
    console.error('Move file error:', err);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// 5.5.3 Toggle Pin File or Folder (Pin to Top)
app.post('/api/files/:id/toggle-pin', authMiddleware, async (req, res) => {
  const fileId = req.params.id;

  if (IS_MOCK_MODE) {
    mockFiles = storage.loadMockFiles();
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (!file) return res.status(404).json({ error: 'File not found' });

    file.is_pinned = !file.is_pinned;
    file.pinned_at = file.is_pinned ? new Date().toISOString() : null;
    file.updated_at = new Date().toISOString();
    storage.saveMockFiles(mockFiles, true);

    // Note: Pinning is treated strictly as personal UI view preference, so NO security audit log is created.
    return res.json({
      success: true,
      file_id: file.file_id,
      is_pinned: file.is_pinned,
      pinned_at: file.pinned_at,
      message: file.is_pinned ? 'Item pinned to top' : 'Item unpinned'
    });
  }

  // DynamoDB Mode
  try {
    const getRes = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId }
    }));
    const file = getRes.Item;
    if (!file || (file.owner_id !== req.user.user_id && req.user.role !== 'admin')) {
      return res.status(404).json({ error: 'File not found' });
    }

    const newPinned = !file.is_pinned;
    const pinnedAt = newPinned ? new Date().toISOString() : null;
    await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId },
      UpdateExpression: 'SET is_pinned = :p, pinned_at = :pa, updated_at = :u',
      ExpressionAttributeValues: {
        ':p': newPinned,
        ':pa': pinnedAt,
        ':u': new Date().toISOString()
      }
    }));

    return res.json({
      success: true,
      file_id: fileId,
      is_pinned: newPinned,
      pinned_at: pinnedAt,
      message: newPinned ? 'Item pinned to top' : 'Item unpinned'
    });
  } catch (err) {
    console.error('Toggle pin error:', err);
    return res.status(500).json({ error: 'Failed to toggle pin state' });
  }
});

function permanentlyDeleteFileOrFolder({ fileId, user, files = mockFiles, userStorage = mockUserStorage, storageModule = storage }) {
  const index = files.findIndex(f => f.file_id === fileId && canUserAccessFile(f, user));
  if (index === -1) return { error: 'File not found', status: 404 };

  const targetFile = files[index];
  const isOwner = targetFile.owner_id === user.user_id || (user.user_id === 'user-normal-01' && targetFile.owner_id === 'demo-user');
  if (!isOwner && user.role !== 'admin') {
    return { error: 'Only the resource owner can delete this item', status: 403 };
  }

  const isFolder = targetFile.category === 'folder';
  const descendantIds = isFolder ? getFolderDescendantIds(fileId, files) : [];
  const descendantIdSet = new Set(descendantIds);
  const itemsToDelete = [targetFile];
  if (descendantIds.length > 0) {
    itemsToDelete.push(...files.filter(f => descendantIdSet.has(f.file_id)));
  }

  // Background non-blocking disk purge
  let purgePromise = null;
  if (storageModule) {
    const foldersToPurge = itemsToDelete.filter(f => f.category === 'folder');
    const standaloneFilesToPurge = itemsToDelete.filter(f => f.category !== 'folder');

    purgePromise = new Promise(resolve => {
      setImmediate(async () => {
        try {
          for (const item of foldersToPurge) {
            if (item.owner_id) {
              if (typeof storageModule.deleteStoredFolderAsync === 'function') {
                await storageModule.deleteStoredFolderAsync(item.owner_id, item.file_id);
              } else if (typeof storageModule.deleteStoredFolder === 'function') {
                storageModule.deleteStoredFolder(item.owner_id, item.file_id);
              }
            }
          }
          for (const file of standaloneFilesToPurge) {
            if (typeof storageModule.deleteStoredFile === 'function') {
              storageModule.deleteStoredFile(file);
            }
          }
        } catch (purgeErr) {
          console.warn('Background permanent delete error:', purgeErr.message);
        } finally {
          resolve();
        }
      });
    });
  }

  let totalSizeFreed = 0;
  const categoryFreed = {};

  itemsToDelete.forEach(item => {
    if (item.category !== 'folder') {
      const sz = Number(item.size) || 0;
      if (sz > 0) {
        totalSizeFreed += sz;
        const cat = item.category || 'document';
        categoryFreed[cat] = (categoryFreed[cat] || 0) + sz;
      }
    }
  });

  if (totalSizeFreed > 0 && userStorage) {
    userStorage.totalUsed = Math.max(0, (userStorage.totalUsed || 0) - totalSizeFreed);
    if (userStorage.breakdown) {
      for (const [cat, sz] of Object.entries(categoryFreed)) {
        if (userStorage.breakdown[cat] !== undefined) {
          userStorage.breakdown[cat] = Math.max(0, userStorage.breakdown[cat] - sz);
        }
      }
    }
  }

  const deleteIdSet = new Set(itemsToDelete.map(f => f.file_id));
  const remainingFiles = files.filter(f => !deleteIdSet.has(f.file_id));
  if (storageModule && storageModule.saveMockFiles) {
    storageModule.saveMockFiles(remainingFiles, false);
  }

  return {
    success: true,
    targetFile,
    isFolder,
    descendantCount: descendantIds.length,
    deletedItemsCount: itemsToDelete.length,
    totalSizeFreed,
    remainingFiles,
    purgePromise
  };
}

// 5.6 Move to Trash or Permanent Delete
app.delete('/api/files/:id', authMiddleware, async (req, res) => {
  const fileId = req.params.id;
  const isPermanent = req.query.permanent === 'true';

  if (IS_MOCK_MODE) {
    const index = mockFiles.findIndex(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (index === -1) return res.status(404).json({ error: 'File not found' });

    const targetFile = mockFiles[index];
    const isOwner = targetFile.owner_id === req.user.user_id || (req.user.user_id === 'user-normal-01' && targetFile.owner_id === 'demo-user');
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the resource owner can delete this item' });
    }
    const isFolder = targetFile.category === 'folder';
    const descendantIds = isFolder ? getFolderDescendantIds(fileId) : [];

    if (isPermanent) {
      const delResult = permanentlyDeleteFileOrFolder({
        fileId,
        user: req.user,
        files: mockFiles,
        userStorage: mockUserStorage,
        storageModule: storage
      });
      if (delResult.error) {
        return res.status(delResult.status).json({ error: delResult.error });
      }
      mockFiles = delResult.remainingFiles;
      recordAuditLog({
        user: req.user,
        action: 'PERMANENT_DELETE',
        level: 'critical',
        details: `Permanently deleted ${delResult.isFolder ? 'folder' : 'file'} "${delResult.targetFile ? delResult.targetFile.filename : fileId}"${delResult.descendantCount > 0 ? ` and ${delResult.descendantCount} nested item(s)` : ''}`
      });
      return res.json({
        success: true,
        message: `${delResult.isFolder ? 'Folder' : 'File'} deleted permanently`,
        deletedItemsCount: delResult.deletedItemsCount,
        totalSizeFreed: delResult.totalSizeFreed
      });
    } else {
      targetFile.status = 'trash';
      targetFile.trashed_at = new Date().toISOString();
      if (descendantIds.length > 0) {
        const descendantIdSet = new Set(descendantIds);
        mockFiles.forEach(f => {
          if (descendantIdSet.has(f.file_id)) {
            f.status = 'trash';
            f.trashed_at = targetFile.trashed_at;
          }
        });
      }
      storage.saveMockFiles(mockFiles);
      recordAuditLog({ user: req.user, action: 'MOVE_TO_TRASH', level: 'warning', details: `Moved ${isFolder ? 'folder' : 'file'} "${targetFile.filename}" to trash${descendantIds.length > 0 ? ` and ${descendantIds.length} nested item(s)` : ''}` });
      return res.json({ success: true, message: `${isFolder ? 'Folder' : 'File'} moved to trash` });
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
      recordAuditLog({ user: req.user, action: 'PERMANENT_DELETE', level: 'critical', details: `Permanently deleted file ID: ${fileId}` });
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
      recordAuditLog({ user: req.user, action: 'MOVE_TO_TRASH', level: 'warning', details: `Moved file ID: ${fileId} to trash` });
      res.json({ success: true, message: 'File moved to trash' });
    }
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// 5.6.1 Batch Move to Trash
app.post('/api/files/batch-trash', authMiddleware, async (req, res) => {
  const { file_ids } = req.body || {};
  if (!Array.isArray(file_ids) || file_ids.length === 0) {
    return res.status(400).json({ error: 'file_ids array is required' });
  }

  const targetIdSet = new Set(file_ids);
  let affectedCount = 0;

  if (IS_MOCK_MODE) {
    mockFiles = storage.loadMockFiles();
    const trashedAt = new Date().toISOString();
    const allDescendantIds = new Set();

    mockFiles.forEach(f => {
      if (targetIdSet.has(f.file_id) && canUserAccessFile(f, req.user)) {
        f.status = 'trash';
        f.trashed_at = trashedAt;
        affectedCount++;

        if (f.category === 'folder') {
          const descendantIds = getFolderDescendantIds(f.file_id);
          descendantIds.forEach(id => allDescendantIds.add(id));
        }
      }
    });

    if (allDescendantIds.size > 0) {
      mockFiles.forEach(f => {
        if (allDescendantIds.has(f.file_id)) {
          f.status = 'trash';
          f.trashed_at = trashedAt;
        }
      });
    }

    storage.saveMockFiles(mockFiles, true);

    recordAuditLog({
      user: req.user,
      action: 'BATCH_MOVE_TRASH',
      level: 'warning',
      details: `Moved ${affectedCount} item(s) to trash${allDescendantIds.size > 0 ? ` and ${allDescendantIds.size} nested item(s)` : ''}`
    });

    return res.json({
      success: true,
      message: `Moved ${affectedCount} item(s) to trash`,
      count: affectedCount
    });
  }

  // DynamoDB Mode
  try {
    const trashedAt = new Date().toISOString();
    for (const fileId of file_ids) {
      await docClient.send(new UpdateCommand({
        TableName: FILES_TABLE,
        Key: { file_id: fileId },
        ConditionExpression: 'owner_id = :owner',
        UpdateExpression: 'SET #st = :trash, trashed_at = :t',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':trash': 'trash',
          ':t': trashedAt,
          ':owner': req.user.user_id
        }
      })).catch(e => console.warn(`Skipping batch trash for file ${fileId}:`, e.message));
      affectedCount++;
    }

    recordAuditLog({
      user: req.user,
      action: 'BATCH_MOVE_TRASH',
      level: 'warning',
      details: `Moved ${affectedCount} item(s) to trash`
    });

    res.json({
      success: true,
      message: `Moved ${affectedCount} item(s) to trash`,
      count: affectedCount
    });
  } catch (err) {
    console.error('Batch trash error:', err);
    res.status(500).json({ error: 'Failed to process batch trash' });
  }
});

// 5.7.1 Batch Restore from Trash
app.post('/api/files/batch-restore', authMiddleware, async (req, res) => {
  const { file_ids } = req.body || {};
  if (!Array.isArray(file_ids) || file_ids.length === 0) {
    return res.status(400).json({ error: 'file_ids array is required' });
  }

  const targetIdSet = new Set(file_ids);
  let affectedCount = 0;

  if (IS_MOCK_MODE) {
    mockFiles = storage.loadMockFiles();
    const allDescendantIds = new Set();

    mockFiles.forEach(f => {
      if (targetIdSet.has(f.file_id) && canUserAccessFile(f, req.user)) {
        f.status = 'active';
        delete f.trashed_at;
        affectedCount++;

        if (f.category === 'folder') {
          const descendantIds = getFolderDescendantIds(f.file_id);
          descendantIds.forEach(id => allDescendantIds.add(id));
        }
      }
    });

    if (allDescendantIds.size > 0) {
      mockFiles.forEach(f => {
        if (allDescendantIds.has(f.file_id)) {
          f.status = 'active';
          delete f.trashed_at;
        }
      });
    }

    storage.saveMockFiles(mockFiles, true);

    recordAuditLog({
      user: req.user,
      action: 'BATCH_RESTORE',
      level: 'info',
      details: `Restored ${affectedCount} item(s) from trash${allDescendantIds.size > 0 ? ` and ${allDescendantIds.size} nested item(s)` : ''}`
    });

    return res.json({
      success: true,
      message: `Restored ${affectedCount} item(s) successfully`,
      count: affectedCount
    });
  }

  // DynamoDB Mode
  try {
    for (const fileId of file_ids) {
      await docClient.send(new UpdateCommand({
        TableName: FILES_TABLE,
        Key: { file_id: fileId },
        ConditionExpression: 'owner_id = :owner',
        UpdateExpression: 'SET #st = :active REMOVE trashed_at',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':active': 'active',
          ':owner': req.user.user_id
        }
      })).catch(e => console.warn(`Skipping batch restore for ${fileId}:`, e.message));
      affectedCount++;
    }

    recordAuditLog({
      user: req.user,
      action: 'BATCH_RESTORE',
      level: 'info',
      details: `Restored ${affectedCount} file(s) from trash`
    });

    res.json({
      success: true,
      message: `Restored ${affectedCount} item(s) successfully`,
      count: affectedCount
    });
  } catch (err) {
    console.error('Batch restore error:', err);
    res.status(500).json({ error: 'Failed to restore batch files' });
  }
});

// 5.7.2 Batch Delete Forever (Permanent Deletion)
app.post('/api/files/batch-delete-forever', authMiddleware, async (req, res) => {
  const { file_ids } = req.body || {};
  if (!Array.isArray(file_ids) || file_ids.length === 0) {
    return res.status(400).json({ error: 'file_ids array is required' });
  }

  let totalDeleted = 0;
  let totalFreed = 0;

  if (IS_MOCK_MODE) {
    mockFiles = storage.loadMockFiles();

    for (const fileId of file_ids) {
      const delResult = permanentlyDeleteFileOrFolder({
        fileId,
        user: req.user,
        files: mockFiles,
        userStorage: mockUserStorage,
        storageModule: storage
      });

      if (delResult && !delResult.error) {
        mockFiles = delResult.remainingFiles;
        totalDeleted += delResult.deletedItemsCount || 1;
        totalFreed += delResult.totalSizeFreed || 0;
      }
    }

    storage.saveMockFiles(mockFiles, true);

    recordAuditLog({
      user: req.user,
      action: 'BATCH_PERMANENT_DELETE',
      level: 'critical',
      details: `Permanently deleted ${totalDeleted} item(s) (${formatBytes(totalFreed)})`
    });

    return res.json({
      success: true,
      message: `Permanently deleted ${totalDeleted} item(s)`,
      deletedCount: totalDeleted,
      totalSizeFreed: totalFreed
    });
  }

  // DynamoDB / S3 Mode
  try {
    for (const fileId of file_ids) {
      const getRes = await docClient.send(new GetCommand({ TableName: FILES_TABLE, Key: { file_id: fileId } }));
      if (getRes.Item && getRes.Item.s3_key) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: STORAGE_BUCKET, Key: getRes.Item.s3_key })).catch(() => {});
      }
      await docClient.send(new DeleteCommand({ TableName: FILES_TABLE, Key: { file_id: fileId } })).catch(() => {});
      totalDeleted++;
    }

    recordAuditLog({
      user: req.user,
      action: 'BATCH_PERMANENT_DELETE',
      level: 'critical',
      details: `Permanently deleted ${totalDeleted} item(s)`
    });

    res.json({
      success: true,
      message: `Permanently deleted ${totalDeleted} item(s)`,
      deletedCount: totalDeleted
    });
  } catch (err) {
    console.error('Batch permanent delete error:', err);
    res.status(500).json({ error: 'Failed to permanently delete batch items' });
  }
});

// 5.7 Restore from Trash
app.post('/api/files/:id/restore', authMiddleware, async (req, res) => {
  const fileId = req.params.id;

  if (IS_MOCK_MODE) {
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (!file) return res.status(404).json({ error: 'File not found' });
    file.status = 'active';
    delete file.trashed_at;

    if (file.category === 'folder') {
      const descendantIds = getFolderDescendantIds(fileId);
      mockFiles.forEach(f => {
        if (descendantIds.includes(f.file_id)) {
          f.status = 'active';
          delete f.trashed_at;
        }
      });
    }
    storage.saveMockFiles(mockFiles);

    recordAuditLog({ user: req.user, action: 'RESTORE', level: 'info', details: `Restored ${file.category === 'folder' ? 'folder' : 'file'} "${file.filename}" from trash` });
    return res.json({ success: true, message: 'Restored successfully', file });
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
    recordAuditLog({ user: req.user, action: 'RESTORE', level: 'info', details: `Restored file ID: ${fileId} from trash` });
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

  // Lookup target file details
  let fileInfo = null;
  if (IS_MOCK_MODE) {
    fileInfo = mockFiles.find(f => f.file_id === file_id);
  } else {
    try {
      const getFileRes = await docClient.send(new GetCommand({ TableName: FILES_TABLE, Key: { file_id } }));
      fileInfo = getFileRes.Item;
    } catch (e) {}
  }

  const shareId = `share-${crypto.randomUUID().slice(0, 8)}`;
  const hours = Number(expireHours) || 24;
  const expiresAt = Math.floor(Date.now() / 1000) + (hours * 3600); // Unix timestamp for DynamoDB TTL
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const downloadLimit = Number(maxDownloads) || 0; // 0 = unlimited

  const shareRecord = {
    share_id: shareId,
    file_id,
    filename: fileInfo ? fileInfo.filename : 'Shared File',
    size: fileInfo ? fileInfo.size : 0,
    category: fileInfo ? fileInfo.category : 'file',
    owner_id: req.user.user_id,
    owner_email: req.user.email || req.user.name || 'Owner',
    password_hash: passwordHash,
    has_password: Boolean(password),
    max_downloads: downloadLimit,
    download_count: 0,
    expires_at: expiresAt,
    created_at: new Date().toISOString()
  };

  if (IS_MOCK_MODE) {
    mockShares.push(shareRecord);
    recordAuditLog({
      user: req.user,
      action: 'CREATE_SHARE',
      level: 'info',
      details: `Created share link (${shareId}) for "${shareRecord.filename}"${shareRecord.has_password ? ' [Password Protected]' : ''}${shareRecord.max_downloads > 0 ? ' [Burn-After-Read]' : ''}`
    });
    return res.json({
      success: true,
      share_id: shareId,
      shareId: shareId,
      shareUrl: `/share/${shareId}`,
      filename: shareRecord.filename,
      size: shareRecord.size,
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

    recordAuditLog({
      user: req.user,
      action: 'CREATE_SHARE',
      level: 'info',
      details: `Created share link (${shareId}) for "${shareRecord.filename}"${shareRecord.has_password ? ' [Password Protected]' : ''}${shareRecord.max_downloads > 0 ? ' [Burn-After-Read]' : ''}`
    });

    res.json({
      success: true,
      share_id: shareId,
      shareId: shareId,
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

// 5.8.1 Get Share By File ID
app.get('/api/shares/by-file/:file_id', authMiddleware, async (req, res) => {
  const fileId = req.params.file_id;
  const share = mockShares.find(s => s.file_id === fileId);
  if (!share) {
    return res.json({ success: true, isShared: false, share: null });
  }
  const remainingDownloads = share.max_downloads > 0 ? Math.max(0, share.max_downloads - share.download_count) : 'Unlimited';
  const remainingHours = share.expires_at ? Math.max(0, Math.round((share.expires_at - Math.floor(Date.now() / 1000)) / 3600)) : null;

  res.json({
    success: true,
    isShared: true,
    share: {
      share_id: share.share_id,
      shareUrl: `/share/${share.share_id}`,
      filename: share.filename,
      maxDownloads: share.max_downloads,
      downloadsLeft: remainingDownloads,
      downloadCount: share.download_count,
      expireHours: share.expires_at ? Math.max(1, Math.round((share.expires_at - Math.floor(new Date(share.created_at).getTime() / 1000)) / 3600)) : 24,
      remainingHours,
      hasPassword: Boolean(share.has_password),
      createdAt: share.created_at
    }
  });
});

// 5.8.2 Edit Share Settings (PATCH /api/shares/:id)
app.patch('/api/shares/:id', authMiddleware, async (req, res) => {
  const targetId = req.params.id;
  const { expireHours, maxDownloads, password, removePassword } = req.body;

  let share = null;
  if (IS_MOCK_MODE) {
    share = mockShares.find(s => s.share_id === targetId || s.file_id === targetId);
  }

  if (!share) {
    return res.status(404).json({ error: 'Share link not found' });
  }

  // Permission check: owner or admin
  if (share.owner_id !== req.user.user_id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to edit this share' });
  }

  if (expireHours !== undefined) {
    const hours = Number(expireHours) || 24;
    share.expires_at = Math.floor(Date.now() / 1000) + (hours * 3600);
  }

  if (maxDownloads !== undefined) {
    share.max_downloads = Number(maxDownloads);
  }

  if (removePassword === true || removePassword === 'true') {
    share.has_password = false;
    share.password_hash = null;
  } else if (password && typeof password === 'string' && password.trim().length > 0) {
    share.password_hash = await bcrypt.hash(password.trim(), 10);
    share.has_password = true;
  }

  share.updated_at = new Date().toISOString();

  recordAuditLog({
    user: req.user,
    action: 'UPDATE_SHARE',
    level: 'info',
    details: `Updated share settings for "${share.filename}" (${share.share_id}): TTL=${expireHours || 'unchanged'}h, MaxDL=${share.max_downloads}, PasswordProtected=${share.has_password}`
  });

  const remainingDownloads = share.max_downloads > 0 ? Math.max(0, share.max_downloads - share.download_count) : 'Unlimited';
  const remainingHours = share.expires_at ? Math.max(0, Math.round((share.expires_at - Math.floor(Date.now() / 1000)) / 3600)) : null;

  res.json({
    success: true,
    message: 'Share settings updated successfully',
    share: {
      share_id: share.share_id,
      shareUrl: `/share/${share.share_id}`,
      filename: share.filename,
      maxDownloads: share.max_downloads,
      downloadsLeft: remainingDownloads,
      downloadCount: share.download_count,
      remainingHours,
      hasPassword: Boolean(share.has_password)
    }
  });
});

// 5.8.3 Revoke / Stop Sharing (DELETE /api/shares/:id)
app.delete('/api/shares/:id', authMiddleware, async (req, res) => {
  const targetId = req.params.id;

  let share = null;
  if (IS_MOCK_MODE) {
    share = mockShares.find(s => s.share_id === targetId || s.file_id === targetId);
    if (!share) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    if (share.owner_id !== req.user.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to revoke this share' });
    }

    mockShares = mockShares.filter(s => s.share_id !== share.share_id);
  }

  recordAuditLog({
    user: req.user,
    action: 'REVOKE_SHARE',
    level: 'warning',
    details: `Revoked share link (${share ? share.share_id : targetId}) for "${share ? share.filename : targetId}"`
  });

  res.json({
    success: true,
    message: 'Share link revoked successfully',
    share_id: share ? share.share_id : targetId
  });
});

// 5.8.4 Direct Collaborator Access Control (GET & PUT /api/files/:id/access)
app.get('/api/files/:id/access', authMiddleware, async (req, res) => {
  const fileId = req.params.id;
  const file = mockFiles.find(f => f.file_id === fileId);
  if (!file) {
    return res.status(404).json({ error: 'File or folder not found' });
  }
  if (!canUserAccessFile(file, req.user) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Access denied' });
  }
  res.json({ success: true, accessList: file.access_list || [] });
});

app.put('/api/files/:id/access', authMiddleware, async (req, res) => {
  const fileId = req.params.id;
  const file = mockFiles.find(f => f.file_id === fileId);
  if (!file) {
    return res.status(404).json({ error: 'File or folder not found' });
  }

  const isOwner = file.owner_id === req.user.user_id || (req.user.user_id === 'user-normal-01' && file.owner_id === 'demo-user');
  if (!isOwner && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the resource owner can modify access permissions' });
  }

  const { accessList } = req.body;
  if (!Array.isArray(accessList)) {
    return res.status(400).json({ error: 'accessList must be an array' });
  }

  const sanitized = accessList
    .filter(item => item && (item.email || item.name))
    .map(item => ({
      email: (item.email || item.name).trim().toLowerCase(),
      name: (item.name || item.email).trim(),
      permission: item.permission || 'can view',
      timeRemaining: item.timeRemaining || null,
      hasPassword: Boolean(item.hasPassword),
      password: item.password || '',
      added_at: item.added_at || new Date().toISOString(),
      added_by: req.user.user_id
    }));

  file.access_list = sanitized;
  file.updated_at = new Date().toISOString();

  recordAuditLog({
    user: req.user,
    action: 'SHARE_INVITE',
    level: 'info',
    details: `Updated collaborator access for "${file.filename}": ${sanitized.length} collaborators`
  });

  res.json({ success: true, message: 'Access list updated successfully', accessList: file.access_list });
});

// 5.8.5 Shared With Me Endpoints
app.get('/api/shares/shared-with-me', authMiddleware, async (req, res) => {
  const sharedWithMe = getSharedWithMeForUser(req.user);
  res.json({ success: true, sharedWithMe });
});

app.delete('/api/shares/shared-with-me/:file_id', authMiddleware, async (req, res) => {
  const fileId = req.params.file_id;
  const userEmail = (req.user.email || '').toLowerCase();
  const file = mockFiles.find(f => f.file_id === fileId);
  if (file) {
    file.dismissed_by = file.dismissed_by || [];
    if (!file.dismissed_by.includes(req.user.user_id)) {
      file.dismissed_by.push(req.user.user_id);
    }
    if (!file.dismissed_by.includes(userEmail)) {
      file.dismissed_by.push(userEmail);
    }
    return res.json({ success: true, message: 'File dismissed from Shared with me' });
  }
  res.json({ success: true, message: 'Removed from Shared with me' });
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
    const resolvedFilename = (file ? file.filename : share.filename) || 'shared-file';
    recordAuditLog({
      user: null,
      action: 'DOWNLOAD_SHARE',
      level: 'info',
      details: `Public downloaded shared file "${resolvedFilename}" (Share ID: ${shareId})`
    });
    return res.json({
      success: true,
      filename: resolvedFilename,
      downloadUrl: `http://localhost:3000/mock-download/${encodeURIComponent(resolvedFilename)}`,
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
    const storage = getUserStorage(req.user.user_id);
    return res.json({ success: true, ...storage, storage });
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
      quota: DEFAULT_STORAGE_QUOTA, // 50 GB default
      breakdown: { image: 0, document: 0, code: 0, archive: 0, other: 0 }
    };

    res.json({ success: true, ...storage, storage });
  } catch (err) {
    console.error('Storage breakdown error:', err);
    res.status(500).json({ error: 'Failed to retrieve storage details' });
  }
});

// 5.11 Admin: Get All Users & Storage Quotas
app.get('/api/admin/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  if (IS_MOCK_MODE) {
    const usersWithStorage = mockUsers.map(u => ({
      ...u,
      storage: getUserStorage(u.user_id)
    }));
    return res.json({
      success: true,
      users: usersWithStorage
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

// 5.12 Admin: Update User Role & Quota
app.patch('/api/admin/users/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  const targetUserId = req.params.id;
  const { role, status, quota, storageQuota } = req.body;
  const user = mockUsers.find(u => u.user_id === targetUserId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (role && (role === 'admin' || role === 'user')) {
    user.role = role;
  }
  if (status && (status === 'active' || status === 'inactive')) {
    user.status = status;
  }
  const targetQuota = quota || storageQuota;
  if (targetQuota && Number(targetQuota) > 0) {
    user.quota = Number(targetQuota);
    user.storage_quota = Number(targetQuota);
    if (mockUserStorage && mockUserStorage[targetUserId]) {
      mockUserStorage[targetUserId].quota = Number(targetQuota);
    }
  }
  user.updated_at = new Date().toISOString();

  recordAuditLog({
    user: req.user,
    action: 'ROLE_CHANGE',
    level: 'warning',
    details: `Admin updated user "${user.name}" (${user.email}): Role=${user.role}, Status=${user.status || 'active'}, Quota=${formatBytes(user.quota)}`
  });

  res.json({ success: true, message: 'User updated successfully', user });
});

// 5.13 Admin: Delete User (With self-deletion protection)
app.delete('/api/admin/users/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  const targetUserId = req.params.id;
  if (targetUserId === req.user.user_id) {
    return res.status(400).json({ error: 'Cannot delete your own admin account' });
  }

  const userIndex = mockUsers.findIndex(u => u.user_id === targetUserId);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const deletedUser = mockUsers.splice(userIndex, 1)[0];
  recordAuditLog({
    user: req.user,
    action: 'DELETE_USER',
    level: 'critical',
    details: `Admin permanently deleted user "${deletedUser.name}" (${deletedUser.email})`
  });

  res.json({ success: true, message: 'User deleted successfully' });
});

// 5.14 Admin: Get Audit Logs (With filtering)
app.get('/api/admin/audit', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  const actionFilter = req.query.action;
  const levelFilter = req.query.level;

  let filtered = [...mockAuditLogs];
  if (actionFilter && actionFilter !== 'All') {
    filtered = filtered.filter(l => l.action.toLowerCase() === actionFilter.toLowerCase());
  }
  if (levelFilter && levelFilter !== 'All') {
    filtered = filtered.filter(l => l.level.toLowerCase() === levelFilter.toLowerCase());
  }

  const stats = {
    totalEvents: mockAuditLogs.length,
    total: mockAuditLogs.length,
    warningCount: mockAuditLogs.filter(l => l.level === 'warning').length,
    warning: mockAuditLogs.filter(l => l.level === 'warning').length,
    criticalCount: mockAuditLogs.filter(l => l.level === 'critical').length,
    critical: mockAuditLogs.filter(l => l.level === 'critical').length
  };

  res.json({ success: true, count: filtered.length, stats, logs: filtered });
});

// Export Lambda handler
module.exports.handler = serverless(app);
module.exports.app = app; // Export app for local runner
module.exports.filterRootTrashedFiles = filterRootTrashedFiles;
module.exports.getFolderDescendantIds = getFolderDescendantIds;
module.exports.emptyUserTrash = emptyUserTrash;
module.exports.permanentlyDeleteFileOrFolder = permanentlyDeleteFileOrFolder;
module.exports.recordAuditLog = recordAuditLog;

