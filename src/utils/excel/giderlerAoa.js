// backend/src/utils/excel/giderlerAoa.js

/**
 * buildGiderlerAoa
 *
 * Builds an AOA array for Excel export from the model produced by:
 *   backend/src/utils/report/buildGiderlerModel.js
 *
 * AOA ONLY. No templates. No fallbacks.
 */

const toCell = (v) => (v === undefined ? null : v);

function buildGiderlerAoa({ model }) {
    const m = model && typeof model === "object" ? model : null;
    if (!m) return [["Giderler model empty"]];

    const aoa = [];
    aoa.push([m.sheetTitle]);
    aoa.push(["Para Birimi", m.currencyCode]);
    aoa.push([]);

    const { yearMeta } = m;

    // -------------------------------
    // SECTION 1: OPERATING
    // -------------------------------
    {
        const sec = m.sections?.operating;
        aoa.push([sec?.title || "GİDERLER (İŞLETME)"]);

        // 14 columns
        aoa.push([
            "Grup",
            "Hesap",
            "Gider Kalemi",
            yearMeta?.y1?.labelLong || "Y1",
            "",
            "",
            yearMeta?.y2?.labelLong || "Y2",
            "",
            "",
            "",
            yearMeta?.y3?.labelLong || "Y3",
            "",
            "",
            "",
        ]);
        aoa.push([
            "",
            "",
            "",
            `Toplam (${m.currencyCode})`,
            "İşletme Giderleri Toplamı içindeki %",
            "Toplam Ciro içindeki %",
            "Tahmini artış %",
            `Toplam (${m.currencyCode})`,
            "İşletme Giderleri Toplamı içindeki %",
            "Toplam Ciro içindeki %",
            "Tahmini artış %",
            `Toplam (${m.currencyCode})`,
            "İşletme Giderleri Toplamı içindeki %",
            "Toplam Ciro içindeki %",
        ]);

        const rows = Array.isArray(sec?.rows) ? sec.rows : [];
        for (const r of rows) {
            aoa.push([
                r.groupLabel || "",
                toCell(r.code),
                r.label || "",
                toCell(r?.y1?.amount),
                toCell(r?.y1?.opPct),
                toCell(r?.y1?.ciroPct),
                toCell(r?.y2?.yoyPct),
                toCell(r?.y2?.amount),
                toCell(r?.y2?.opPct),
                toCell(r?.y2?.ciroPct),
                toCell(r?.y3?.yoyPct),
                toCell(r?.y3?.amount),
                toCell(r?.y3?.opPct),
                toCell(r?.y3?.ciroPct),
            ]);
        }

        const totals = sec?.totals || {};
        const netCiro = m?.totals?.netCiro || {};
        const yoyPct = (curr, prev) => {
            const c = Number(curr);
            const p = Number(prev);
            if (!Number.isFinite(c) || !Number.isFinite(p) || p <= 0) return null;
            return ((c / p) - 1) * 100;
        };
        const ciroPct = (amount, ciro) => {
            const a = Number(amount);
            const c = Number(ciro);
            if (!Number.isFinite(a) || !Number.isFinite(c) || c <= 0) return null;
            return (a / c) * 100;
        };

        aoa.push([
            "",
            "",
            "TOPLAM",
            toCell(totals?.y1),
            100,
            toCell(ciroPct(totals?.y1, netCiro?.y1)),
            toCell(yoyPct(totals?.y2, totals?.y1)),
            toCell(totals?.y2),
            100,
            toCell(ciroPct(totals?.y2, netCiro?.y2)),
            toCell(yoyPct(totals?.y3, totals?.y2)),
            toCell(totals?.y3),
            100,
            toCell(ciroPct(totals?.y3, netCiro?.y3)),
        ]);

        aoa.push([]);
    }

    // -------------------------------
    // SECTION 2: SERVICE / NON-ED
    // -------------------------------
    {
        const sec = m.sections?.service;
        aoa.push([sec?.title || "GİDERLER (ÖĞRENİM DIŞI)"]);
        aoa.push([
            "Hesap",
            "Gider Kalemi",
            yearMeta?.y1?.labelLong || "Y1",
            "",
            "",
            yearMeta?.y2?.labelLong || "Y2",
            "",
            "",
            yearMeta?.y3?.labelLong || "Y3",
            "",
            "",
        ]);
        aoa.push([
            "",
            "",
            "Öğrenci",
            `Birim (${m.currencyCode})`,
            `Toplam (${m.currencyCode})`,
            "Öğrenci",
            `Birim (${m.currencyCode})`,
            `Toplam (${m.currencyCode})`,
            "Öğrenci",
            `Birim (${m.currencyCode})`,
            `Toplam (${m.currencyCode})`,
        ]);

        const rows = Array.isArray(sec?.rows) ? sec.rows : [];
        for (const r of rows) {
            aoa.push([
                toCell(r.code),
                r.label || "",
                toCell(r?.y1?.studentCount),
                toCell(r?.y1?.unitCost),
                toCell(r?.y1?.total),
                toCell(r?.y2?.studentCount),
                toCell(r?.y2?.unitCost),
                toCell(r?.y2?.total),
                toCell(r?.y3?.studentCount),
                toCell(r?.y3?.unitCost),
                toCell(r?.y3?.total),
            ]);
        }

        const totals = sec?.totals || {};
        aoa.push(["", "TOPLAM", "", "", toCell(totals?.y1), "", "", toCell(totals?.y2), "", "", toCell(totals?.y3)]);
        aoa.push([]);
    }

    // -------------------------------
    // SECTION 3: DORM
    // -------------------------------
    {
        const sec = m.sections?.dorm;
        aoa.push([sec?.title || "GİDERLER (YURT/KONAKLAMA)"]);
        aoa.push([
            "Hesap",
            "Gider Kalemi",
            yearMeta?.y1?.labelLong || "Y1",
            "",
            "",
            yearMeta?.y2?.labelLong || "Y2",
            "",
            "",
            yearMeta?.y3?.labelLong || "Y3",
            "",
            "",
        ]);
        aoa.push([
            "",
            "",
            "Öğrenci",
            `Birim (${m.currencyCode})`,
            `Toplam (${m.currencyCode})`,
            "Öğrenci",
            `Birim (${m.currencyCode})`,
            `Toplam (${m.currencyCode})`,
            "Öğrenci",
            `Birim (${m.currencyCode})`,
            `Toplam (${m.currencyCode})`,
        ]);

        const rows = Array.isArray(sec?.rows) ? sec.rows : [];
        for (const r of rows) {
            aoa.push([
                toCell(r.code),
                r.label || "",
                toCell(r?.y1?.studentCount),
                toCell(r?.y1?.unitCost),
                toCell(r?.y1?.total),
                toCell(r?.y2?.studentCount),
                toCell(r?.y2?.unitCost),
                toCell(r?.y2?.total),
                toCell(r?.y3?.studentCount),
                toCell(r?.y3?.unitCost),
                toCell(r?.y3?.total),
            ]);
        }

        const totals = sec?.totals || {};
        aoa.push(["", "TOPLAM", "", "", toCell(totals?.y1), "", "", toCell(totals?.y2), "", "", toCell(totals?.y3)]);
        aoa.push([]);
    }

    // -------------------------------
    // SECTION 4: DISCOUNTS / SCHOLARSHIPS
    // -------------------------------
    {
        const sec = m.sections?.burs;
        aoa.push([sec?.title || "BURS VE İNDİRİMLER"]);

        // 10 columns
        aoa.push([
            "Burs / İndirim",
            yearMeta?.y1?.labelLong || "Y1",
            "",
            "",
            yearMeta?.y2?.labelLong || "Y2",
            "",
            "",
            yearMeta?.y3?.labelLong || "Y3",
            "",
            "",
        ]);
        aoa.push([
            "",
            "Burslu Öğrenci",
            "Ort. %",
            `Toplam (${m.currencyCode})`,
            "Burslu Öğrenci",
            "Ort. %",
            `Toplam (${m.currencyCode})`,
            "Burslu Öğrenci",
            "Ort. %",
            `Toplam (${m.currencyCode})`,
        ]);

        const rows = Array.isArray(sec?.rows) ? sec.rows : [];
        for (const r of rows) {
            aoa.push([
                r.name || "",
                toCell(r?.y1?.studentCount),
                toCell(r?.y1?.avgPct),
                toCell(r?.y1?.total),
                toCell(r?.y2?.studentCount),
                toCell(r?.y2?.avgPct),
                toCell(r?.y2?.total),
                toCell(r?.y3?.studentCount),
                toCell(r?.y3?.avgPct),
                toCell(r?.y3?.total),
            ]);
        }

        const t = sec?.totals || {};
        aoa.push([
            "TOPLAM",
            toCell(t?.y1?.studentCount),
            "",
            toCell(t?.y1?.total),
            toCell(t?.y2?.studentCount),
            "",
            toCell(t?.y2?.total),
            toCell(t?.y3?.studentCount),
            "",
            toCell(t?.y3?.total),
        ]);

        const ratios = sec?.ratios || {};
        aoa.push(["Burs/İndirimli Öğrenci Oranı (Y1)", toCell(ratios?.ratioStudentsY1), "", "", "", "", "", "", "", ""]);
        aoa.push([
            "Burs/İndirimlerin Öğrenci Ücret Gelirleri İçindeki % (Y1)",
            toCell(ratios?.ratioAmountY1),
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
        ]);

        aoa.push([]);
    }

    // -------------------------------
    // SUMMARY
    // -------------------------------
    {
        const sec = m.sections?.summary;
        aoa.push([sec?.title || "ÖZET"]);
        aoa.push(["", "Y1", "Y2", "Y3"]);

        const rows = Array.isArray(sec?.rows) ? sec.rows : [];
        for (const r of rows) {
            aoa.push([r.label || "", toCell(r.y1), toCell(r.y2), toCell(r.y3)]);
        }
        aoa.push([]);
    }

    return aoa;
}

module.exports = { buildGiderlerAoa };
