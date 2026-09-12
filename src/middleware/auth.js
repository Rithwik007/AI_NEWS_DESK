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
