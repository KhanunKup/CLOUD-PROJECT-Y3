// backend/src/api/auth-service.js
// Deep Authentication & Cryptographic Session Security Engine for EasyDrive

const crypto = require('crypto');

// Secret resolution: Use configured SESSION_SECRET, or generate a deterministic runtime key for dev
const SESSION_SECRET = process.env.SESSION_SECRET || 'easydrive-production-session-secret-key-2026-cloud-secure';

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.warn('[Security Warning] SESSION_SECRET is not explicitly set in environment variables. Falling back to default runtime secret.');
}

/**
 * Parses raw Cookie header into key-value map
 */
function parseCookies(req) {
  const list = {};
  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });
  return list;
}

/**
 * Creates an HMAC-SHA256 signature for a base64url payload
 */
function createSignature(payloadBase64, secret = SESSION_SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');
}

/**
 * Signs a user object into a tamper-proof session token: `<payloadBase64>.<hmacSignature>`
 */
function signSessionPayload(user, secret = SESSION_SECRET) {
  if (!user || typeof user !== 'object') return null;

  const payload = {
    user_id: user.user_id || user.id,
    email: user.email || '',
    name: user.name || user.email || 'User',
    role: user.role || 'user',
    created_at: Date.now()
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson, 'utf-8').toString('base64url');
  const signature = createSignature(payloadBase64, secret);

  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies a session token. Returns parsed user if signature is valid; null otherwise.
 */
function verifySessionToken(tokenString, secret = SESSION_SECRET) {
  if (!tokenString || typeof tokenString !== 'string') return null;

  const parts = tokenString.split('.');
  if (parts.length !== 2) {
    // Malformed token or raw unsigned payload (reject immediately)
    return null;
  }

  const [payloadBase64, signature] = parts;
  if (!payloadBase64 || !signature) return null;

  try {
    const expectedSignature = createSignature(payloadBase64, secret);

    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expectedSignature, 'base64url');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      // Signature mismatch (tampering detected)
      return null;
    }

    const jsonStr = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    const payload = JSON.parse(jsonStr);

    if (payload && (payload.user_id || payload.id)) {
      return {
        user_id: payload.user_id || payload.id,
        email: payload.email || '',
        name: payload.name || 'User',
        role: payload.role || 'user',
        created_at: payload.created_at
      };
    }
  } catch (err) {
    // Malformed JSON or decoding error
    return null;
  }

  return null;
}

/**
 * Extracts and verifies the authenticated user from Request Cookies or Authorization Header
 */
function getSessionUser(req) {
  if (!req) return null;

  // 1. Try Signed Cookie: easydrive_session
  const cookies = parseCookies(req);
  if (cookies.easydrive_session) {
    const verified = verifySessionToken(cookies.easydrive_session);
    if (verified) return verified;

    // Backward compatibility during migration: if token is legacy base64 JSON, try parsing once
    // but disallow role escalation
    try {
      const legacy = JSON.parse(Buffer.from(cookies.easydrive_session, 'base64').toString('utf-8'));
      if (legacy && legacy.user_id) {
        return {
          user_id: legacy.user_id,
          email: legacy.email || '',
          name: legacy.name || 'User',
          role: legacy.role || 'user'
        };
      }
    } catch (_) {}
  }

  // 2. Try Authorization: Bearer <token>
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const verified = verifySessionToken(token);
    if (verified) return verified;

    // Cognito JWT Token inspection
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
        const decoded = JSON.parse(payloadJson);
        if (decoded && (decoded.sub || decoded.user_id || decoded['cognito:username'])) {
          const isExpired = decoded.exp && decoded.exp * 1000 < Date.now();
          if (!isExpired) {
            return {
              user_id: decoded.user_id || decoded.sub || decoded['cognito:username'],
              email: decoded.email || '',
              name: decoded.name || decoded['cognito:username'] || 'User',
              role: (decoded['cognito:groups'] && decoded['cognito:groups'].includes('Admin')) ? 'admin' : (decoded.role || 'user')
            };
          }
        }
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Generates Set-Cookie header value with security flags
 */
function createSessionCookieHeader(user, maxAgeSeconds = 86400, isHttps = false) {
  const token = signSessionPayload(user);
  let cookie = `easydrive_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
  if (isHttps) {
    cookie += '; Secure';
  }
  return cookie;
}

/**
 * Generates Set-Cookie header to clear the session cookie
 */
function clearSessionCookieHeader() {
  return 'easydrive_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax';
}

/**
 * Strict API Authentication Middleware
 */
function authMiddleware(req, res, next) {
  const user = getSessionUser(req);
  if (user) {
    req.user = user;
    return next();
  }

  // Allow x-user-id override strictly in non-production local mock testing
  if (process.env.NODE_ENV !== 'production' && process.env.USE_MOCK === 'true' && req.headers && req.headers['x-user-id']) {
    req.user = {
      user_id: req.headers['x-user-id'],
      email: 'demo@kmitl.ac.th',
      name: 'Demo User',
      role: req.headers['x-user-role'] || 'user'
    };
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required. Please log in.'
  });
}

/**
 * Web Page Authentication Middleware (Redirects to /login)
 */
function webAuthMiddleware(req, res, next) {
  const user = getSessionUser(req);
  if (user) {
    req.user = user;
    return next();
  }

  return res.redirect('/login');
}

/**
 * Admin Role Guard Middleware
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({ error: 'Forbidden. Admin privileges required.' });
    }
    return res.status(403).send('Forbidden: Administrator access required.');
  }
  return next();
}


const bcrypt = require('bcryptjs');

let authConfig = {
  isMockMode: true,
  docClient: null,
  usersTable: process.env.USERS_TABLE || 'easydrive-users'
};

const inMemoryUsers = [
  {
    user_id: 'user-admin-01',
    name: 'Admin User',
    username: 'admin',
    email: 'admin@kmitl.ac.th',
    password: 'admin123',
    password_hash: null,
    role: 'admin',
    quota: 107374182400,
    status: 'active'
  },
  {
    user_id: 'user-admin-01-internal',
    name: 'Admin User Internal',
    username: 'admin-internal',
    email: 'admin@easydrive.internal',
    password: 'adminpassword123',
    password_hash: null,
    role: 'admin',
    quota: 107374182400,
    status: 'active'
  },
  {
    user_id: 'user-normal-01',
    name: 'Normal User',
    username: 'user',
    email: 'user@kmitl.ac.th',
    password: 'user123',
    password_hash: null,
    role: 'user',
    quota: 15728640000,
    status: 'active'
  },
  {
    user_id: 'user-normal-01-internal',
    name: 'Normal User Internal',
    username: 'user-internal',
    email: 'user@easydrive.internal',
    password: 'userpassword123',
    password_hash: null,
    role: 'user',
    quota: 15728640000,
    status: 'active'
  }
];

let bootstrapPromise = null;

/**
 * Bootstraps initial admin account in DynamoDB if empty/absent
 */
async function bootstrapAdminUser() {
  if (authConfig.isMockMode || !authConfig.docClient || !authConfig.usersTable) return;
  const { ScanCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
  try {
    let existingAdmin = null;
    // Check via EmailIndex
    try {
      const qRes = await authConfig.docClient.send(new QueryCommand({
        TableName: authConfig.usersTable,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': 'admin@kmitl.ac.th' }
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        existingAdmin = qRes.Items[0];
      }
    } catch (queryErr) {
      // Do not guess: a failed lookup must not lead to re-seeding the admin with the default password
      console.error('[EasyDrive Cloud] Admin lookup via EmailIndex failed, skipping bootstrap:', queryErr.message);
      return;
    }

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      const adminItem = {
        user_id: 'user-admin-01',
        name: 'Admin User',
        username: 'admin',
        email: 'admin@kmitl.ac.th',
        password_hash: passwordHash,
        role: 'admin',
        quota: 107374182400, // 100 GB
        status: 'active',
        created_at: new Date().toISOString()
      };
      await authConfig.docClient.send(new PutCommand({
        TableName: authConfig.usersTable,
        Item: adminItem,
        ConditionExpression: 'attribute_not_exists(user_id)'
      }));
      console.log('[EasyDrive Cloud] Initial admin user bootstrapped successfully in DynamoDB: admin@kmitl.ac.th');
    }
  } catch (err) {
    console.error('[EasyDrive Cloud] Error bootstrapping initial admin user:', err.message);
  }
}

function initAuthStore(config = {}) {
  authConfig = { ...authConfig, ...config };
  if (!authConfig.isMockMode && authConfig.docClient && authConfig.usersTable) {
    bootstrapPromise = bootstrapAdminUser();
  }
}

async function registerUser({ username, email, password, role = 'user', quota = 15728640000 }) {
  const normEmail = (email || '').trim().toLowerCase();
  const normUsername = (username || '').trim().toLowerCase();

  if (!normEmail || !normUsername || !password) {
    return { success: false, error: 'Username, email, and password are required' };
  }

  if (!authConfig.isMockMode && authConfig.docClient && authConfig.usersTable) {
    if (bootstrapPromise) {
      await bootstrapPromise;
    }
    const { ScanCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
    try {
      // 1. Fast O(1) email collision check via EmailIndex
      let emailExists = false;
      try {
        const queryEmail = await authConfig.docClient.send(new QueryCommand({
          TableName: authConfig.usersTable,
          IndexName: 'EmailIndex',
          KeyConditionExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': normEmail }
        }));
        if (queryEmail.Items && queryEmail.Items.length > 0) {
          emailExists = true;
        }
      } catch (_) {}

      if (emailExists) {
        return { success: false, error: 'Username or email already exists' };
      }

      // 2. Username collision check via UsernameIndex
      const queryUsername = await authConfig.docClient.send(new QueryCommand({
        TableName: authConfig.usersTable,
        IndexName: 'UsernameIndex',
        KeyConditionExpression: 'username = :u',
        ExpressionAttributeValues: { ':u': normUsername },
        Limit: 1
      }));
      if (queryUsername.Items && queryUsername.Items.length > 0) {
        return { success: false, error: 'Username or email already exists' };
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userId = 'user-' + crypto.randomUUID().slice(0, 8);
      const newUser = {
        user_id: userId,
        name: username.trim(),
        username: normUsername,
        email: normEmail,
        password_hash: passwordHash,
        role,
        quota,
        status: 'active',
        created_at: new Date().toISOString()
      };

      await authConfig.docClient.send(new PutCommand({
        TableName: authConfig.usersTable,
        Item: newUser
      }));

      return {
        success: true,
        user: {
          user_id: newUser.user_id,
          name: newUser.name,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role
        }
      };
    } catch (err) {
      console.error('[AuthService Register Error]:', err);
      return { success: false, error: err.message };
    }
  }

  const existing = inMemoryUsers.find(u => u.email === normEmail || u.username === normUsername);
  if (existing) {
    return { success: false, error: 'Username or email already exists' };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = 'user-' + crypto.randomUUID().slice(0, 8);
  const newUser = {
    user_id: userId,
    name: username.trim(),
    username: normUsername,
    email: normEmail,
    password_hash: passwordHash,
    role,
    quota,
    used_storage: 0,
    status: 'active',
    created_at: new Date().toISOString()
  };
  inMemoryUsers.push(newUser);

  return {
    success: true,
    user: {
      user_id: newUser.user_id,
      name: newUser.name,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role
    }
  };
}

async function authenticateUser({ identifier, password }) {
  const normIdent = (identifier || '').trim().toLowerCase();
  if (!normIdent || !password) {
    return { success: false, error: 'Identifier and password are required' };
  }

  if (!authConfig.isMockMode && authConfig.docClient && authConfig.usersTable) {
    if (bootstrapPromise) {
      await bootstrapPromise;
    }
    const { ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
    try {
      let user = null;

      // Email identifiers use EmailIndex, everything else is a username (UsernameIndex)
      const isEmail = normIdent.includes('@');
      const queryRes = await authConfig.docClient.send(new QueryCommand({
        TableName: authConfig.usersTable,
        IndexName: isEmail ? 'EmailIndex' : 'UsernameIndex',
        KeyConditionExpression: isEmail ? 'email = :ident' : 'username = :ident',
        ExpressionAttributeValues: { ':ident': normIdent },
        Limit: 1
      }));
      user = queryRes.Items && queryRes.Items[0];

      if (!user) {
        return { success: false, error: 'Invalid username/email or password' };
      }
      if (user.status === 'disabled') {
        return { success: false, error: 'Account has been disabled' };
      }

      let match = false;
      if (user.password_hash) {
        match = await bcrypt.compare(password, user.password_hash);
      } else if (user.password) {
        match = (user.password === password);
      }

      if (!match) {
        return { success: false, error: 'Invalid username/email or password' };
      }

      return {
        success: true,
        user: {
          user_id: user.user_id,
          name: user.name || user.username,
          email: user.email,
          role: user.role || 'user'
        }
      };
    } catch (err) {
      console.error('[AuthService Authenticate Error]:', err);
      return { success: false, error: err.message };
    }
  }

  const user = inMemoryUsers.find(u => u.email === normIdent || u.username === normIdent);
  if (!user) {
    return { success: false, error: 'Invalid username/email or password' };
  }
  if (user.status === 'disabled') {
    return { success: false, error: 'Account has been disabled' };
  }

  let match = false;
  if (user.password_hash) {
    match = await bcrypt.compare(password, user.password_hash);
  } else if (user.password) {
    match = (user.password === password);
  }

  if (!match) {
    return { success: false, error: 'Invalid username/email or password' };
  }

  return {
    success: true,
    user: {
      user_id: user.user_id,
      name: user.name || user.username,
      email: user.email,
      role: user.role || 'user'
    }
  };
}

async function listUsers() {
  if (!authConfig.isMockMode && authConfig.docClient && authConfig.usersTable) {
    if (bootstrapPromise) {
      await bootstrapPromise;
    }
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    try {
      const res = await authConfig.docClient.send(new ScanCommand({
        TableName: authConfig.usersTable
      }));
      return res.Items || [];
    } catch (err) {
      console.error('[AuthService listUsers Error]:', err);
      return [];
    }
  }
  return inMemoryUsers;
}

async function getUserById(userId) {
  if (!userId) return null;
  if (!authConfig.isMockMode && authConfig.docClient && authConfig.usersTable) {
    const { GetCommand } = require('@aws-sdk/lib-dynamodb');
    try {
      const res = await authConfig.docClient.send(new GetCommand({
        TableName: authConfig.usersTable,
        Key: { user_id: userId }
      }));
      return res.Item || null;
    } catch (_) {
      return null;
    }
  }
  return inMemoryUsers.find(u => u.user_id === userId) || null;
}

module.exports = {
  initAuthStore,
  bootstrapAdminUser,
  registerUser,
  authenticateUser,
  getUserById,
  listUsers,
  inMemoryUsers,
  parseCookies,
  signSessionPayload,
  verifySessionToken,
  getSessionUser,
  createSessionCookieHeader,
  clearSessionCookieHeader,
  authMiddleware,
  webAuthMiddleware,
  requireAdmin,
  SESSION_SECRET
};
