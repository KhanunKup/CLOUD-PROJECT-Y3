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
let mockFiles = [
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
    quota: 10737418240, // 10 GB
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
    quota: 10737418240, // 10 GB
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
    quota: 5368709120, // 5 GB
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
    details: 'Uploaded file Project_Proposal.pdf (2.45 MB)',
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
function canUserAccessFile(file, user) {
  if (!file || !user) return false;
  if (user.role === 'admin') return true;
  if (file.owner_id === user.user_id) return true;
  if (user.user_id === 'user-normal-01' && file.owner_id === 'demo-user') return true;
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
  const quota = user.quota || 10737418240; // Default 10 GB

  const userFiles = mockFiles.filter(f => {
    if (f.status === 'trash') return false;
    return f.owner_id === userId || (userId === 'user-normal-01' && f.owner_id === 'demo-user');
  });

  const breakdown = {
    document: 0,
    image: 0,
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

function getFolderDescendantIds(folderId) {
  const descendantIds = [];
  const children = mockFiles.filter(f => f.folder_id === folderId);
  for (const child of children) {
    descendantIds.push(child.file_id);
    if (child.category === 'folder') {
      descendantIds.push(...getFolderDescendantIds(child.file_id));
    }
  }
  return descendantIds;
}

function recordAuditLog({ user, action, level = 'info', details = '', req = null }) {
  const logEntry = {
    log_id: `log-${crypto.randomUUID().slice(0, 8)}`,
    user_id: user ? (user.user_id || user.id || 'anonymous') : 'anonymous',
    user_name: user ? (user.name || user.username || 'User') : 'Guest',
    user_email: user ? (user.email || 'guest@easydrive.internal') : 'guest@easydrive.internal',
    role: user ? (user.role || 'user') : 'guest',
    action,
    level, // 'info' | 'warning' | 'critical'
    details,
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

// Helper to parse cookies without extra dependencies
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
  }
  return list;
}

// Helper to extract session user from Cookie or Authorization header
function getSessionUser(req) {
  const cookies = parseCookies(req);
  if (cookies.easydrive_session) {
    try {
      const decoded = JSON.parse(Buffer.from(cookies.easydrive_session, 'base64').toString('utf-8'));
      if (decoded && decoded.user_id) return decoded;
    } catch (e) {}
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const payloadBase64 = token.split('.')[1] || token;
      const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
      if (decoded && (decoded.user_id || decoded.sub)) {
        return {
          user_id: decoded.user_id || decoded.sub || decoded['cognito:username'],
          email: decoded.email,
          name: decoded.name || decoded['cognito:username'] || 'User',
          role: (decoded['cognito:groups'] && decoded['cognito:groups'].includes('Admin')) ? 'admin' : (decoded.role || 'user')
        };
      }
    } catch (e) {}
  }

  return null;
}

// Authentication Middleware (API Endpoints)
function authMiddleware(req, res, next) {
  const user = getSessionUser(req);
  if (user) {
    req.user = user;
    return next();
  }

  if (IS_MOCK_MODE) {
    // Check if x-user-id header is provided (e.g. testing)
    if (req.headers['x-user-id']) {
      req.user = {
        user_id: req.headers['x-user-id'],
        email: 'demo@kmitl.ac.th',
        name: 'Demo User',
        role: req.headers['x-user-role'] || 'user'
      };
      return next();
    }
    // Default fallback to first preset user for headless API calls
    req.user = {
      user_id: mockUsers[0].user_id,
      email: mockUsers[0].email,
      name: mockUsers[0].name,
      role: mockUsers[0].role
    };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
}

// Authentication Guards for Web SSR routes
function requireAuthWeb(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
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
  res.setHeader('Set-Cookie', 'easydrive_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.redirect('/signin');
});

// 4.1 Login Handler (Supports JSON & HTML Form)
app.post(['/api/auth/login', '/signin'], async (req, res) => {
  const { username, email, password } = req.body;
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
  const sessionToken = Buffer.from(JSON.stringify(sessionUser)).toString('base64');
  res.setHeader('Set-Cookie', `easydrive_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);

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
    quota: 10737418240,
    created_at: new Date().toISOString()
  };
  mockUsers.push(newUser);

  const sessionUser = {
    user_id: newUser.user_id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role
  };
  const sessionToken = Buffer.from(JSON.stringify(sessionUser)).toString('base64');
  res.setHeader('Set-Cookie', `easydrive_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);

  recordAuditLog({ user: sessionUser, action: 'SIGNUP', level: 'info', details: `New user "${newUser.name}" registered account`, req });

  if (req.accepts('html') && !req.xhr && !req.headers['content-type']?.includes('json')) {
    return res.redirect('/drive');
  }
  return res.json({ success: true, message: 'Account created successfully', user: sessionUser });
});

// 4.3 Drive Page (Protected)
app.get('/drive', requireAuthWeb, (req, res) => {
  const currentFolderId = req.query.folder ? String(req.query.folder).trim() : null;
  const currentFolder = currentFolderId ? mockFiles.find(f => f.file_id === currentFolderId && f.category === 'folder') : null;

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
    if (req.user.role !== 'admin' && !(f.owner_id === req.user.user_id || f.owner_id === 'demo-user')) return false;

    // Filter by folder hierarchy
    if (currentFolderId) {
      return f.folder_id === currentFolderId;
    } else {
      return !f.folder_id || f.folder_id === 'root';
    }
  });

  const storage = getUserStorage(req.user.user_id);
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
        folderId: f.folder_id || null,
        category: f.category || (f.filename ? getCategoryFromExtension(f.filename) : 'other'),
        tags: Array.isArray(f.tags) ? f.tags : (f.category ? [f.category] : []),
        owner: f.owner_id === req.user.user_id ? 'me' : (f.owner_id === 'demo-user' ? 'me' : f.owner_id),
        uploadDate: new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        accessList: [],
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
  const sharedWithMe = [
    ...defaultSharedWithMe,
    ...allShares.filter(s => !s.isOwner)
  ];

  const storage = getUserStorage(req.user.user_id);
  res.render('pages/shared', {
    user: req.user,
    storage,
    sharedByMe,
    sharedWithMe,
    files: [...sharedWithMe, ...sharedByMe] // backward compatible fallback
  });
});

// 4.5 Trash Page (Protected)
app.get('/trash', requireAuthWeb, (req, res) => {
  const trashedFiles = mockFiles.filter(f => {
    if (f.status !== 'trash') return false;
    if (req.user.role === 'admin') return true;
    return f.owner_id === req.user.user_id || f.owner_id === 'demo-user';
  });
  const storage = getUserStorage(req.user.user_id);
  res.render('pages/trash', {
    user: req.user,
    storage,
    files: trashedFiles.map(f => ({
      id: f.file_id,
      name: f.filename,
      type: 'file',
      owner: 'me',
      trashedAt: new Date(f.trashed_at || f.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    }))
  });
});

app.post('/trash/empty', requireAuthWeb, (req, res) => {
  if (IS_MOCK_MODE) {
    mockFiles = mockFiles.filter(f => f.status !== 'trash');
    recordAuditLog({ user: req.user, action: 'PERMANENT_DELETE', level: 'critical', details: 'Emptied entire trash bin' });
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
      if (req.user.role === 'admin') return true;
      return f.owner_id === req.user.user_id || f.owner_id === 'demo-user';
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
  const { folderName, folder_id, parent_id } = req.body;
  if (!folderName) {
    return res.status(400).json({ error: 'folderName is required' });
  }

  const parentFolderId = folder_id || parent_id || null;
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

// 5.3 Request Presigned Upload URL
app.post('/api/files/upload-url', authMiddleware, async (req, res) => {
  const filename = req.body.filename || req.body.name;
  const { size, contentType, folder_id, parent_id } = req.body;
  const parentFolderId = folder_id || parent_id || null;
  if (!filename || !size) {
    return res.status(400).json({ error: 'filename and size are required' });
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

    // Update mock storage breakdown
    mockUserStorage.totalUsed += Number(size);
    mockUserStorage.breakdown[category] = (mockUserStorage.breakdown[category] || 0) + Number(size);

    recordAuditLog({ user: req.user, action: 'UPLOAD', level: 'info', details: `Uploaded file "${filename}" (${formatBytes(Number(size))})` });

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
    const file = mockFiles.find(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (!file) return res.status(404).json({ error: 'File not found' });
    file.filename = filename;
    file.updated_at = new Date().toISOString();
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
    recordAuditLog({ user: req.user, action: 'UPDATE_TAGS', level: 'info', details: `Updated tags for "${file.filename}" to: [${tags.join(', ')}]` });
    return res.json({ success: true, file, tags });
  }

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { file_id: fileId },
      ConditionExpression: req.user.role === 'admin' ? undefined : 'owner_id = :owner',
      UpdateExpression: 'SET tags = :tags, updated_at = :up',
      ExpressionAttributeValues: {
        ':tags': tags,
        ':up': new Date().toISOString(),
        ...(req.user.role === 'admin' ? {} : { ':owner': req.user.user_id })
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

// 5.6 Move to Trash or Permanent Delete
app.delete('/api/files/:id', authMiddleware, async (req, res) => {
  const fileId = req.params.id;
  const isPermanent = req.query.permanent === 'true';

  if (IS_MOCK_MODE) {
    const index = mockFiles.findIndex(f => f.file_id === fileId && canUserAccessFile(f, req.user));
    if (index === -1) return res.status(404).json({ error: 'File not found' });

    const targetFile = mockFiles[index];
    const isFolder = targetFile.category === 'folder';
    const descendantIds = isFolder ? getFolderDescendantIds(fileId) : [];

    if (isPermanent) {
      const deletedFile = mockFiles.splice(index, 1)[0];
      if (descendantIds.length > 0) {
        mockFiles = mockFiles.filter(f => !descendantIds.includes(f.file_id));
      }
      recordAuditLog({ user: req.user, action: 'PERMANENT_DELETE', level: 'critical', details: `Permanently deleted ${isFolder ? 'folder' : 'file'} "${deletedFile ? deletedFile.filename : fileId}"${descendantIds.length > 0 ? ` and ${descendantIds.length} nested item(s)` : ''}` });
      return res.json({ success: true, message: `${isFolder ? 'Folder' : 'File'} deleted permanently` });
    } else {
      targetFile.status = 'trash';
      targetFile.trashed_at = new Date().toISOString();
      if (descendantIds.length > 0) {
        mockFiles.forEach(f => {
          if (descendantIds.includes(f.file_id)) {
            f.status = 'trash';
            f.trashed_at = new Date().toISOString();
          }
        });
      }
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
      quota: 10737418240, // 10 GB default
      breakdown: { image: 0, document: 0, archive: 0, other: 0 }
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
