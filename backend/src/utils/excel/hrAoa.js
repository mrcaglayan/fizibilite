// backend/src/utils/excel/hrAoa.js
// Converts the HR/IK model to a plain AOA sheet.
// IMPORTANT: AOA only. No templates. No fallbacks.

function normalizeRow(row) {
  if (!Array.isArray(row)) return [];
  return row;
}

function buildHrAoa({ model }) {
  const m = model && typeof model === "object" ? model : {};
  const sections = Array.isArray(m.sections) ? m.sections : [];

  const aoa = [];

  // Sheet title
  if (m.title) {
    aoa.push([String(m.title)]);
    aoa.push([]);
  }

  for (const section of sections) {
    if (!section) continue;
    const st = String(section.title || "").trim();
    if (st) aoa.push([st]);

    const tables = Array.isArray(section.tables) ? section.tables : [];
    for (const table of tables) {
      if (!table) continue;
      const tt = String(table.title || "").trim();
      if (tt) aoa.push([tt]);

      if (Array.isArray(table.headers) && table.headers.length) {
        aoa.push(normalizeRow(table.headers));
      }

      const rows = Array.isArray(table.rows) ? table.rows : [];
      for (const r of rows) {
        aoa.push(normalizeRow(r));
      }

      // separator between tables
      aoa.push([]);
    }

    // separator between sections
    aoa.push([]);
  }

  return aoa;
}

module.exports = { buildHrAoa };
