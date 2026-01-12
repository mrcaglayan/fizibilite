const express = require("express");
const { getPool } = require("../db");
const { requireAuth, requireAssignedCountry } = require("../middleware/auth");
const { getProgressConfig } = require("../utils/progressConfig");

const router = express.Router();
router.use(requireAuth);
router.use(requireAssignedCountry);

/**
 * GET /meta/progress-requirements
 * Returns progress config for current user's country.
 */
router.get("/progress-requirements", async (req, res) => {
  try {
    const pool = getPool();
    const config = await getProgressConfig(pool, req.user.country_id);
    return res.json({ country_id: req.user.country_id, config });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

module.exports = router;
