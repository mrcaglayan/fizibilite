//backend/src/routes/auth.js

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { getPool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function signToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    country_id: user.country_id,
    role: user.role,
    region: user.region || null,
    must_reset_password: Boolean(user.must_reset_password),
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });
}

function pickCountryIdFromBody(body) {
  const b = body || {};
  const direct = b.country_id ?? b.countryId;
  if (direct != null && Number.isFinite(Number(direct))) return Number(direct);
  return null;
}

async function resolveCountry(pool, body) {
  const id = pickCountryIdFromBody(body);
  if (id) {
    const [[c]] = await pool.query("SELECT id, name, code, region FROM countries WHERE id=:id", { id });
    return c || null;
  }
  const code = String(body?.country_code ?? body?.countryCode ?? "").trim();
  if (code) {
    const [[c]] = await pool.query("SELECT id, name, code, region FROM countries WHERE code=:code", { code });
    return c || null;
  }
  return null;
}

/**
 * POST /auth/register
 * Body: { full_name|fullName, email, password, country_id|countryId|country_code|countryCode (optional), role? }
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const fullName = req.body?.full_name ?? req.body?.fullName ?? null;
    const role = String(req.body?.role || "user");

    if (!email || !password) return res.status(400).json({ error: "email and password are required" });

    const pool = getPool();
    const hasCountryInput =
      req.body?.country_id != null ||
      req.body?.countryId != null ||
      String(req.body?.country_code ?? req.body?.countryCode ?? "").trim();
    let country = null;
    if (hasCountryInput) {
      country = await resolveCountry(pool, req.body);
      if (!country) {
        return res.status(400).json({ error: "country_id or country_code is invalid" });
      }
    }
    const region = country?.region ?? null;

    const [[existing]] = await pool.query("SELECT id FROM users WHERE email=:email", { email });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const password_hash = await bcrypt.hash(String(password), 10);

    const [r] = await pool.query(
      "INSERT INTO users (full_name, email, password_hash, must_reset_password, country_id, role, region) VALUES (:full_name,:email,:password_hash,:must_reset_password,:country_id,:role,:region)",
      {
        full_name: fullName,
        email,
        password_hash,
        must_reset_password: 0,
        country_id: country?.id ?? null,
        role,
        region,
      }
    );

    const user = {
      id: r.insertId,
      full_name: fullName,
      email,
      country_id: country?.id ?? null,
      country_name: country?.name ?? null,
      country_code: country?.code ?? null,
      role,
      region,
      must_reset_password: false,
    };

    const token = signToken(user);
    return res.json({ token, user });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /auth/login
 * Body: { email, password }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });

    const pool = getPool();
    const [[row]] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.country_id, u.role, u.region, u.must_reset_password,
              c.name AS country_name, c.code AS country_code
       FROM users u
       LEFT JOIN countries c ON c.id = u.country_id
       WHERE u.email=:email`,
      { email }
    );

    if (!row) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(String(password), String(row.password_hash || ""));
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const user = {
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      country_id: row.country_id,
      country_name: row.country_name,
      country_code: row.country_code,
      role: row.role,
      region: row.region,
      must_reset_password: Boolean(row.must_reset_password),
    };

    const token = signToken(user);
    return res.json({ token, user });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /auth/me
 * Returns current user info (region / country)
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const [[row]] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.country_id, u.role, u.region, u.must_reset_password,
              c.name AS country_name, c.code AS country_code
       FROM users u
       LEFT JOIN countries c ON c.id = u.country_id
       WHERE u.id=:id`,
      { id: req.user.id }
    );
    if (!row) return res.status(404).json({ error: "User not found" });

    return res.json({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      country_id: row.country_id,
      country_name: row.country_name,
      country_code: row.country_code,
      role: row.role,
      region: row.region,
      must_reset_password: Boolean(row.must_reset_password),
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /auth/change-password
 * Body: { current_password|currentPassword, new_password|newPassword }
 */
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const currentPassword = req.body?.current_password ?? req.body?.currentPassword;
    const newPassword = req.body?.new_password ?? req.body?.newPassword;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "current_password and new_password are required" });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    const pool = getPool();
    const [[row]] = await pool.query(
      `SELECT u.id, u.password_hash
       FROM users u
       WHERE u.id=:id`,
      { id: req.user.id }
    );
    if (!row) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(String(currentPassword), String(row.password_hash || ""));
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

    const same = await bcrypt.compare(String(newPassword), String(row.password_hash || ""));
    if (same) return res.status(400).json({ error: "New password must be different" });

    const password_hash = await bcrypt.hash(String(newPassword), 10);
    await pool.query(
      "UPDATE users SET password_hash=:password_hash, must_reset_password=0 WHERE id=:id",
      { id: req.user.id, password_hash }
    );

    const [[updated]] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.country_id, u.role, u.region, u.must_reset_password,
              c.name AS country_name, c.code AS country_code
       FROM users u
       LEFT JOIN countries c ON c.id = u.country_id
       WHERE u.id=:id`,
      { id: req.user.id }
    );
    if (!updated) return res.status(404).json({ error: "User not found" });

    const user = {
      id: updated.id,
      full_name: updated.full_name,
      email: updated.email,
      country_id: updated.country_id,
      country_name: updated.country_name,
      country_code: updated.country_code,
      role: updated.role,
      region: updated.region,
      must_reset_password: Boolean(updated.must_reset_password),
    };

    const token = signToken(user);
    return res.json({ token, user });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

module.exports = router;
