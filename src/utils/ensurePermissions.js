//backend/src/utils/ensurePermissions.js

const { getPool } = require("../db");
const { PERMISSIONS_CATALOG } = require("./permissionsCatalog");

/**
 * Ensures that all permissions defined in the catalog exist in the database.
 *
 * This function is idempotent: running it multiple times will not create
 * duplicate rows because it checks for the existence of each permission
 * before inserting.  It expects the `permissions` table to have a unique
 * constraint on (resource, action) (see schema.sql).
 */
async function ensurePermissions() {
  const pool = getPool();
  for (const perm of PERMISSIONS_CATALOG) {
    const { resource, action } = perm;
    try {
      // Check if the permission already exists
      const [rows] = await pool.query(
        "SELECT id FROM permissions WHERE resource=:resource AND action=:action",
        { resource, action }
      );
      if (!rows || rows.length === 0) {
        // Insert missing permission
        await pool.query(
          "INSERT INTO permissions (resource, action) VALUES (:resource, :action)",
          { resource, action }
        );
      }
    } catch (err) {
      // Log and continue; do not abort the entire process
      console.error(`ensurePermissions: failed to upsert permission ${resource}/${action}`, err);
    }
  }
}

module.exports = { ensurePermissions };