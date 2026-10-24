// In-memory sliding window rate limiter suitable for Express & serverless environments

const attemptsMap = new Map();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

const cleanupOldRecords = () => {
  const now = Date.now();
  for (const [key, record] of attemptsMap.entries()) {
    if (now - record.startTime > WINDOW_MS) {
      attemptsMap.delete(key);
    }
  }
};

// Periodic garbage collection every 5 minutes
setInterval(cleanupOldRecords, 5 * 60 * 1000).unref();

const loginRateLimiter = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  let record = attemptsMap.get(clientIp);
  if (!record || (now - record.startTime > WINDOW_MS)) {
    record = { count: 1, startTime: now };
    attemptsMap.set(clientIp, record);
    return next();
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((record.startTime + WINDOW_MS - now) / 1000);
    res.setHeader('Retry-After', retryAfterSeconds);
    return res.status(429).json({
      error: 'Too many login attempts. Please wait before trying again.',
      retryAfterSeconds
    });
  }

  record.count += 1;
  next();
};

module.exports = { loginRateLimiter };
