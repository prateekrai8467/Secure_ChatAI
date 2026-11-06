/**
 * In-Memory Sliding Window Rate Limiter Middleware.
 * Protects chat and inference endpoints from automated denial-of-service
 * and high-frequency adversarial brute-force probing.
 */

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000; // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 60;   // 60 req/min

const requestCounts = new Map();

// Periodic cleanup of expired rate limit entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requestCounts.entries()) {
    if (now - data.windowStart > WINDOW_MS) {
      requestCounts.delete(ip);
    }
  }
}, 2 * 60 * 1000).unref();

export const rateLimiter = (req, res, next) => {
  // Bypass in automated test runner
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = requestCounts.get(clientIp);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 1, windowStart: now };
    requestCounts.set(clientIp, entry);
  } else {
    entry.count += 1;
  }

  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  const resetTime = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetTime);

  if (entry.count > MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Rate limit exceeded. Please wait before retrying.',
      retryAfterSeconds: resetTime
    });
  }

  next();
};

export default rateLimiter;

