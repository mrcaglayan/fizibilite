// backend/src/utils/report/buildMaliTablolarModel.js

/**
 * Pure model builder for Excel export sheet #10: "Mali Tablolar"
 *
 * Matches UI "Özet Rapor" quick KPI lines:
 * - Net Toplam Gelir
 * - Net Ciro
 * - Toplam Gider
 * - Net Sonuç
 * - Kâr Marjı
 */

function safeNumOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function pickYears(report) {
    if (!report) return { y1: null, y2: null, y3: null };
    if (report?.years && typeof report.years === "object") {
        return {
            y1: report.years.y1 || null,
            y2: report.years.y2 || null,
            y3: report.years.y3 || null,
        };
    }
    return { y1: report, y2: null, y3: null };
}

function canShowLocal(currencyMeta) {
    const fx = Number(currencyMeta?.fx_usd_to_local || 0);
    return currencyMeta?.input_currency === "LOCAL" && fx > 0 && currencyMeta?.local_currency_code;
}

function buildMaliTablolarModel({ scenario, inputs, report, currencyMeta, reportCurrency }) {
    const years = pickYears(report);

    const fx = Number(currencyMeta?.fx_usd_to_local || 0);
    const showLocal = reportCurrency === "local" && canShowLocal(currencyMeta);
    const currencyLabel = showLocal ? String(currencyMeta?.local_currency_code || "LOCAL") : "USD";

    const money = (v) => {
        const n = safeNumOrNull(v);
        if (n == null) return null;
        return showLocal ? n * fx : n;
    };

    const yOf = (ky) => years?.[ky] || null;
    const get = (ky, path) => {
        const y = yOf(ky);
        if (!y) return null;
        const parts = String(path).split(".");
        let cur = y;
        for (const p of parts) {
            if (!cur || typeof cur !== "object") return null;
            cur = cur[p];
        }
        return cur;
    };

    const rowMoney = (label, path) => ({
        label,
        values: [money(get("y1", path)), money(get("y2", path)), money(get("y3", path))],
        type: "money",
    });

    const rowPercent = (label, path) => {
        const v1 = safeNumOrNull(get("y1", path));
        const v2 = safeNumOrNull(get("y2", path));
        const v3 = safeNumOrNull(get("y3", path));
        const toPct = (v) => (v == null ? null : v * 100);
        return {
            label,
            values: [toPct(v1), toPct(v2), toPct(v3)],
            type: "percent",
        };
    };

    const rows = [
        rowMoney("Net Toplam Gelir", "income.netIncome"),
        rowMoney("Net Ciro", "income.netActivityIncome"),
        rowMoney("Toplam Gider", "expenses.totalExpenses"),
        { ...rowMoney("Net Sonuç", "result.netResult"), emphasize: true },
        rowPercent("Kâr Marjı", "kpis.profitMargin"),
    ];

    return {
        title: "Mali Tablolar",
        currencyLabel,
        headers: ["Kalem", "Y1", "Y2", "Y3"],
        rows,
        meta: {
            scenarioId: scenario?.id ?? null,
            schoolId: scenario?.school_id ?? null,
            academicYear: scenario?.academic_year ?? null,
            programType: scenario?.program_type || inputs?.temelBilgiler?.programType || null,
        },
    };
}

module.exports = { buildMaliTablolarModel };
