// backend/src/utils/excel/gelirlerAoa.js

/**
 * buildGelirlerAoa
 *
 * Creates an Array-of-Arrays (AOA) representation for the Excel sheet
 * "Gelirler ( Incomes )" using the model produced by buildGelirlerModel().
 *
 * AOA ONLY: no templates, no fallbacks.
 */

function buildGelirlerAoa({ model }) {
    const m = model && typeof model === "object" ? model : {};
    const tables = Array.isArray(m.tables) ? m.tables : [];

    const aoa = [];

    // Sheet title
    aoa.push([m.sheetTitle || "Gelirler ( Incomes )"]);
    aoa.push([`Para Birimi: ${m.currencyCode || "USD"}`]);
    aoa.push([]);

    for (const t of tables) {
        if (!t) continue;
        aoa.push([t.title || ""]);

        const headerRows = Array.isArray(t.headerRows) ? t.headerRows : [];
        for (const hr of headerRows) {
            aoa.push(Array.isArray(hr) ? hr : []);
        }

        const rows = Array.isArray(t.rows) ? t.rows : [];
        for (const r of rows) {
            aoa.push(Array.isArray(r) ? r : []);
        }

        aoa.push([]);
    }

    // Safety: if everything empty
    if (aoa.length <= 3) {
        return [["Gelirler model empty"]];
    }

    return aoa;
}

module.exports = {
    buildGelirlerAoa,
};
