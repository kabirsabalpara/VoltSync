const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({ error: `Forbidden: ${role} role required.` });
  }
  next();
};

module.exports = { requireRole };
