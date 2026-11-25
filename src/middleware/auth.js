const { getAuth } = require('@clerk/express');

/**
 * Clerk authentication guard middleware for API endpoints.
 * Requires a valid Clerk session token passed via Authorization: Bearer header or cookie.
 * Returns 401 Unauthorized if token is missing, expired, or invalid.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireClerkAuth(req, res, next) {
  if (require('../config').AUTH_MODE === 'none') {
    const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/i;
    const origin = req.get('origin');
    const localOrigin = !origin || /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/i.test(origin);
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
        || !localHost.test(req.get('host')) || !localOrigin || req.get('forwarded') || req.get('x-forwarded-for')
        || req.get('x-desk-local') !== '1') {
      return res.status(403).json({ message: 'Open your personal desk on localhost.' });
    }
    req.auth = { userId: 'local-reader' };
    return next();
  }
  const auth = getAuth(req);

  if (!auth || !auth.userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required. Missing or invalid Clerk session token.',
    });
  }

  req.auth = auth;
  next();
}

module.exports = { requireClerkAuth };
