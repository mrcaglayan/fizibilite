// backend/src/utils/excel/maliTablolarAoa.js

/**
 * AOA builder for sheet #10 "Mali Tablolar".
 * Output format:
 * [title]
 * [headers]
 * [rows...]
 */

function buildMaliTablolarAoa({ model }) {
    if (!model || typeof model !== "object") {
        return [["Mali Tablolar"], ["Kalem", "Y1", "Y2", "Y3"], ["Model empty", null, null, null]];
    }

    const title = String(model.title || "Mali Tablolar");
    const headers = Array.isArray(model.headers) && model.headers.length ? model.headers : ["Kalem", "Y1", "Y2", "Y3"];
    const rows = Array.isArray(model.rows) ? model.rows : [];

    const aoa = [];
    aoa.push([title]);
    aoa.push(headers);

    for (const row of rows) {
        if (!row) continue;
        const label = String(row.label ?? "");
        const values = Array.isArray(row.values) ? row.values : [row.value];
        const v = [values?.[0] ?? null, values?.[1] ?? null, values?.[2] ?? null];
        aoa.push([label, ...v]);
    }

    // Currency note row (non-blocking)
    if (model.currencyLabel) {
        aoa.push(["Para Birimi", String(model.currencyLabel), null, null]);
    }

    return aoa;
}

module.exports = { buildMaliTablolarAoa };
