//backend/src/middleware/auth.js

const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // payload should contain at least: { id, email, country_id, role }
    // optional: { region }
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  return next();
}

function requireAssignedCountry(req, res, next) {
  if (req.user?.country_id == null) {
    return res.status(403).json({ error: "Country assignment required" });
  }
  return next();
}

module.exports = { requireAuth, requireAdmin, requireAssignedCountry };
