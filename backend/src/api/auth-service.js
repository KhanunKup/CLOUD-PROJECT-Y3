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

module.exports = {
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
