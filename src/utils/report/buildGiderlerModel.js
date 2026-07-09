// backend/src/utils/report/buildGiderlerModel.js

/**
 * buildGiderlerModel
 *
 * Mirrors the UI tab:
 *   frontend/src/components/ExpensesEditor.jsx
 *
 * Output is a pure-data model consumed by backend/src/utils/excel/giderlerAoa.js.
 * AOA ONLY (no templates, no fallbacks).
 */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const safeDiv = (a, b) => {
    const na = toNum(a);
    const nb = toNum(b);
    return nb !== 0 ? na / nb : 0;
};

const pctToDisplay = (frac) => {
    if (frac == null) return null;
    const n = Number(frac);
    return Number.isFinite(n) ? n * 100 : null;
};

const yoy = (cur, prev) => (prev > 0 ? cur / prev - 1 : null);

const YEAR_KEYS = ["y1", "y2", "y3"];

function buildYearMeta(baseYear) {
    const y = Number.isFinite(Number(baseYear)) ? Number(baseYear) : null;
    const mk = (idx) => {
        const n = idx + 1;
        const start = y != null ? y + idx : null;
        const end = start != null ? start + 1 : null;
        const range = start != null && end != null ? `${start}-${end}` : "";
        const labelLong = range ? `${n}.Yıl (${range} EĞİTİM ÖĞRETİM YILI)` : `${n}.Yıl`;
        const labelShort = range ? `${n}.Yıl (${range})` : `${n}.Yıl`;
        return { n, start, end, range, labelLong, labelShort };
    };
    return { y1: mk(0), y2: mk(1), y3: mk(2) };
}

function getInflationFactors(temelBilgiler) {
    const infl = temelBilgiler?.inflation || {};
    const y2 = toNum(infl?.y2);
    const y3 = toNum(infl?.y3);
    return {
        y1: 1,
        y2: 1 + y2,
        y3: (1 + y2) * (1 + y3),
    };
}

// These 5 rows are auto-calculated from HR (IK) and must be read-only in Expenses.
const IK_AUTO_KEYS = new Set([
    "turkPersonelMaas",
    "turkDestekPersonelMaas",
    "yerelPersonelMaas",
    "yerelDestekPersonelMaas",
    "internationalPersonelMaas",
]);

// --- UI "Giderler" kalemleri ---
const OPERATING_ITEMS = [
    { key: "ulkeTemsilciligi", no: 1, code: 632, label: "Ülke Temsilciliği Giderleri (Temsilcilik Per. Gid. HARİÇ)" },
    {
        key: "genelYonetim",
        no: 2,
        code: 632,
        label: "Genel Yönetim Giderleri (Ofis Giderleri, Kırtasiye, Aidatlar,Sosyal Yardımlar, Araç Kiralama, Sigorta vb.)",
    },

    { key: "kira", no: 3, code: 622, group: "Eğitim Hizmetleri Maliyeti", label: "İşletme Giderleri (Kira)" },
    {
        key: "emsalKira",
        no: 4,
        code: 622,
        label: "İşletme Giderleri (Emsal Kira, Bina Tahsis veya Vakıf'a ait ise Emsal Kira Bedeli Yazılacak)",
    },
    {
        key: "enerjiKantin",
        no: 5,
        code: 622,
        label: "İşletme Giderleri (Elektrik, Su, Isıtma, Soğutma, Veri/Ses İletişim vb. Kantin)",
    },

    {
        key: "turkPersonelMaas",
        no: 6,
        code: 622,
        label: "Yurt dışı TÜRK Personel Maaş Giderleri (Müdür, Müdür Yardımcısı,Yönetici, Eğitimci, Öğretmen, Belletmen vb.)",
    },
    {
        key: "turkDestekPersonelMaas",
        no: 7,
        code: 622,
        label: "Yurt dışı TÜRK DESTEK Personel Maaş Giderleri (Eğitim faaliyetinde bulunmayan diğer çalışanlar. Ülke Temsilcisi, Temsilcilik destek vb.)",
    },
    {
        key: "yerelPersonelMaas",
        no: 8,
        code: 622,
        label: "Yurt dışı YEREL Personel Maaş Giderleri (Yönetici, Eğitimci, Öğretmen, Belletmen vb.)",
    },
    {
        key: "yerelDestekPersonelMaas",
        no: 9,
        code: 622,
        label: "Yurt dışı YEREL DESTEK ve Ülke Temsilciği DESTEK Personel Maaş Giderleri (Eğitim faaliyetinde bulunmayan diğer çalışanlar)",
    },
    {
        key: "internationalPersonelMaas",
        no: 10,
        code: 622,
        label: "Yurt dışı INTERNATIONAL Personel Maaş Giderleri (Yönetici, Eğitimci, Öğretmen, Belletmen vb.)",
    },

    {
        key: "disaridanHizmet",
        no: 11,
        code: 632,
        label: "Dışarıdan Sağlanan Mal ve Hizmet Alımları (Güvenlik,Temizlik,Avukatlık, Danışmanlık, İş Sağlığı ve Güvenliği, Mali Müşavir vb.)",
    },
    {
        key: "egitimAracGerec",
        no: 12,
        code: 622,
        label: "Eğitim Araç ve Gereçleri (Okul ve Sınıflar için Kırtasiye Malzemeleri, Kitaplar, vb.) - (Öğrencilere dönem başı verilen)",
    },
    {
        key: "finansalGiderler",
        no: 13,
        code: 632,
        label: "Finansal Giderler (Prim ödemeleri, Komisyon ve Kredi Giderleri, Teminat Mektupları)",
    },
    {
        key: "egitimAmacliHizmet",
        no: 14,
        code: 622,
        label: "Eğitim Amaçlı Hizmet Alımları (İzinler ve lisanslama, Cambridge Lisanslamaları vb.)",
    },

    {
        key: "temsilAgirlama",
        no: 16,
        code: 632,
        label: "Temsil ve Ağırlama - Kampüs bazında (Öğlen Yemeği Giderleri Hariç) mutfak giderleri vs.)",
    },
    {
        key: "ulkeIciUlasim",
        no: 17,
        code: 622,
        label: "Ülke İçi Ulaşım ve Konaklama / Uçak Bileti Dahil / PERSONEL ULAŞIM",
    },
    {
        key: "ulkeDisiUlasim",
        no: 18,
        code: 632,
        label: "Ülke Dışı Ulaşım ve Konaklama / Uçak Bileti Dahil / (TMV Merkez Misafir Ağırlama, Türk Personel)",
    },

    {
        key: "vergilerResmiIslemler",
        no: 21,
        code: 632,
        label: "Vergiler Resmi İşlemler (Mahkeme,Dava ve İcra, Resmi İzinler,Tescil ve Kuruluş İşlemleri, Noter vb.)",
    },
    { key: "vergiler", no: 22, code: 632, label: "Vergiler (Kira Stopaj dahil)" },

    {
        key: "demirbasYatirim",
        no: 23,
        code: 622,
        label: "Demirbaş, Arsa, Bina, Taşıt ve Diğer Yatırım Alımları (Lisanslama, Yazılım ve program, Telif hakları vb. dahil)",
    },
    {
        key: "rutinBakim",
        no: 24,
        code: 622,
        label: "Rutin Bakım, Onarım Giderleri (Boya, Tamirat, Tadilat, Makine Teçhizat, Araç, Ofis Malzeme Tamiri vb.)",
    },

    {
        key: "pazarlamaOrganizasyon",
        no: 25,
        code: 631,
        label: "Pazarlama, Tanıtım Organizasyon, Etkinlikler (Öğrenci Faaliyetleri Dahil)",
    },
    { key: "reklamTanitim", no: 26, code: 631, label: "Reklam, Tanıtım, Basım, İlan" },

    { key: "tahsilEdilemeyenGelirler", no: 29, code: 622, label: "Tahsil Edilemeyen Gelirler" },
];

const SERVICE_ITEMS = [
    {
        key: "yemek",
        no: 27,
        code: 622,
        label: "Yemek (Öğrenci ve Personel öğlen yemeği için yapılan harcamalar (Enerji, gıda,yakıt,elektrik,gaz vs. ve org. gideri))",
    },
    {
        key: "uniforma",
        no: 28,
        code: 621,
        label: "Üniforma (Öğrenci Üniforma maliyeti (Liste fiyatı değil, maliyet fiyatı))",
    },
    {
        key: "kitapKirtasiye",
        no: 29,
        code: 621,
        label: "Kitap-Kırtasiye (Öğrencilere dönem başı verdiğimiz materyallerin maliyeti)",
    },
    {
        key: "ulasimServis",
        no: 30,
        code: 622,
        label: "Ulaşım (Okul Servisi) Öğrencilerimiz için kullanılan servis maliyeti",
    },
];

const DORM_ITEMS = [
    {
        key: "yurtGiderleri",
        no: 31,
        code: 622,
        label: "Yurt Giderleri (Kampüs giderleri içinde gösterilmmeyecek; yurt için yapılan giderler)",
    },
    { key: "digerYurt", no: 32, code: 622, label: "Diğer (Yaz Okulu Giderleri vs)" },
];

const SERVICE_TO_INCOME_KEY = {
    yemek: "yemek",
    uniforma: "uniforma",
    kitapKirtasiye: "kitap",
    ulasimServis: "ulasim",
};

const DORM_TO_INCOME_KEY = {
    yurtGiderleri: "yurt",
    digerYurt: "yazOkulu",
};

const studentCountFromIncomeRow = (row, yearKey) => {
    if (!row) return 0;
    if (yearKey === "y2") return toNum(row?.studentCountY2 ?? row?.studentCount);
    if (yearKey === "y3") return toNum(row?.studentCountY3 ?? row?.studentCount);
    return toNum(row?.studentCount);
};

const BURS_DEFAULTS = [
    { name: "MAGİS BAŞARI BURSU" },
    { name: "MAARİF YETENEK BURSU" },
    { name: "İHTİYAÇ BURSU" },
    { name: "OKUL BAŞARI BURSU" },
    { name: "TAM EĞİTİM BURSU" },
    { name: "BARINMA BURSU" },
    { name: "TÜRKÇE BAŞARI BURSU" },
    { name: "VAKFIN ULUSLARARASI YÜKÜMLÜLÜKLERİNDEN KAYNAKLI İNDİRİM" },
    { name: "VAKIF ÇALIŞANI İNDİRİMİ" },
    { name: "KARDEŞ İNDİRİMİ" },
    { name: "ERKEN KAYIT İNDİRİMİ" },
    { name: "PEŞİN ÖDEME İNDİRİMİ" },
    { name: "KADEME GEÇİŞ İNDİRİMİ" },
    { name: "TEMSİL İNDİRİMİ" },
    { name: "KURUM İNDİRİMİ" },
    { name: "İSTİSNAİ İNDİRİM" },
    { name: "YEREL MEVZUATIN ŞART KOŞTUĞU İNDİRİM" },
];

function deepMerge(target, source) {
    const t = { ...(target || {}) };
    const s = source || {};
    for (const k of Object.keys(s)) {
        const sv = s[k];
        if (sv && typeof sv === "object" && !Array.isArray(sv)) t[k] = deepMerge(t[k], sv);
        else t[k] = sv;
    }
    return t;
}

function defaultGiderler() {
    const isletmeItems = {};
    for (const it of OPERATING_ITEMS) isletmeItems[it.key] = 0;

    const svc = {};
    for (const it of SERVICE_ITEMS) svc[it.key] = { studentCount: 0, unitCost: 0 };

    const dorm = {};
    for (const it of DORM_ITEMS) dorm[it.key] = { studentCount: 0, unitCost: 0 };

    return {
        isletme: { items: isletmeItems },
        ogrenimDisi: { items: svc },
        yurt: { items: dorm },
    };
}

// ---- IK salary mapping (same formula as HR tab) ----
const IK_LEVELS = [
    "okulOncesi",
    "ilkokulYerel",
    "ilkokulInt",
    "ortaokulYerel",
    "ortaokulInt",
    "liseYerel",
    "liseInt",
];
const IK_ROLES = [
    "turk_mudur",
    "turk_mdyard",
    "turk_egitimci",
    "turk_temsil",
    "yerel_yonetici_egitimci",
    "yerel_destek",
    "yerel_ulke_temsil_destek",
    "int_yonetici_egitimci",
];

const IK_ROLE_META = {
    yerel_yonetici_egitimci: { groupKey: "yerel" },
    yerel_destek: { groupKey: "yerel" },
    yerel_ulke_temsil_destek: { groupKey: "yerel" },
};

const DEFAULT_UNIT_COST_RATIO = 1.1;

function defaultYearIK() {
    return {
        unitCosts: {},
        headcountsByLevel: {},
    };
}

function defaultIK3Y() {
    return {
        unitCostRatio: DEFAULT_UNIT_COST_RATIO,
        years: {
            y1: defaultYearIK(),
            y2: defaultYearIK(),
            y3: defaultYearIK(),
        },
    };
}

function buildIK(value) {
    const base = defaultIK3Y();
    const v = value || {};

    // Backward compatibility:
    // - old shape: { unitCosts, headcountsByLevel }
    // - new shape: { years: { y1: {..}, y2: {..}, y3: {..} } }
    if (v?.years && typeof v.years === "object") {
        return deepMerge(base, v);
    }

    if (v?.unitCosts || v?.headcountsByLevel) {
        return deepMerge(base, { years: { y1: v } });
    }

    return deepMerge(base, v);
}

function normalizeUnitCostRatio(value) {
    const n = toNum(value);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_UNIT_COST_RATIO;
    return n;
}

function applyUnitCostGrowth(input, ratioValue, inflFactors) {
    const ratio = normalizeUnitCostRatio(ratioValue);
    const factors = inflFactors || { y1: 1, y2: 1, y3: 1 };

    const next = typeof structuredClone === "function" ? structuredClone(input || {}) : JSON.parse(JSON.stringify(input || {}));
    next.unitCostRatio = ratio;
    next.years = next.years || {};
    next.years.y1 = next.years.y1 || defaultYearIK();
    next.years.y2 = next.years.y2 || defaultYearIK();
    next.years.y3 = next.years.y3 || defaultYearIK();
    next.years.y1.unitCosts = next.years.y1.unitCosts || {};
    next.years.y2.unitCosts = next.years.y2.unitCosts || {};
    next.years.y3.unitCosts = next.years.y3.unitCosts || {};

    for (const roleKey of IK_ROLES) {
        const base = toNum(next.years.y1.unitCosts?.[roleKey]);
        const meta = IK_ROLE_META[roleKey] || {};
        const useInflation = meta.groupKey === "yerel";
        const y2 = useInflation ? base * (factors.y2 ?? 1) : base * ratio;
        const y3 = useInflation ? base * (factors.y3 ?? 1) : y2 * ratio;
        next.years.y2.unitCosts[roleKey] = y2;
        next.years.y3.unitCosts[roleKey] = y3;
    }

    return next;
}

function salaryMapForYear(yearIK) {
    const unitCosts = yearIK?.unitCosts || {};
    const hc = yearIK?.headcountsByLevel || {};
    const roleAnnual = {};

    for (const role of IK_ROLES) {
        let totalCount = 0;
        for (const lvl of IK_LEVELS) totalCount += toNum(hc?.[lvl]?.[role]);
        roleAnnual[role] = toNum(unitCosts?.[role]) * totalCount;
    }

    const sum = (keys) => keys.reduce((s, k) => s + toNum(roleAnnual[k]), 0);
    return {
        turkPersonelMaas: sum(["turk_mudur", "turk_mdyard", "turk_egitimci"]),
        turkDestekPersonelMaas: sum(["turk_temsil"]),
        yerelPersonelMaas: sum(["yerel_yonetici_egitimci"]),
        yerelDestekPersonelMaas: sum(["yerel_destek", "yerel_ulke_temsil_destek"]),
        internationalPersonelMaas: sum(["int_yonetici_egitimci"]),
    };
}

function applyScaleToGelirler(gelirler, scale) {
    const g = gelirler && typeof gelirler === "object" ? gelirler : {};
    const out = typeof structuredClone === "function" ? structuredClone(g) : JSON.parse(JSON.stringify(g || {}));
    const applyRows = (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        return list.map((r) => {
            if (!r || typeof r !== "object") return r;
            return { ...r, unitFee: toNum(r.unitFee) * scale };
        });
    };

    if (out?.tuition) {
        out.tuition = { ...out.tuition, rows: applyRows(out.tuition.rows) };
    }
    if (out?.nonEducationFees) {
        out.nonEducationFees = { ...out.nonEducationFees, rows: applyRows(out.nonEducationFees.rows) };
    }
    if (out?.dormitory) {
        out.dormitory = { ...out.dormitory, rows: applyRows(out.dormitory.rows) };
    }

    out.tuitionFeePerStudentYearly = toNum(out.tuitionFeePerStudentYearly) * scale;
    out.lunchFeePerStudentYearly = toNum(out.lunchFeePerStudentYearly) * scale;
    out.dormitoryFeePerStudentYearly = toNum(out.dormitoryFeePerStudentYearly) * scale;

    return out;
}

function applyScaleToDiscounts(discounts, scale) {
    const list = Array.isArray(discounts) ? discounts : [];
    return list.map((d) => {
        if (!d || typeof d !== "object") return d;
        const mode = d.mode || "percent";
        if (mode !== "fixed") return d;
        return {
            ...d,
            value: toNum(d.value) * scale,
            maxAmount: d.maxAmount == null ? d.maxAmount : toNum(d.maxAmount) * scale,
        };
    });
}

function applyScaleToIkUnitCosts(ik3y, scale) {
    const out = typeof structuredClone === "function" ? structuredClone(ik3y || {}) : JSON.parse(JSON.stringify(ik3y || {}));
    out.years = out.years || {};
    for (const y of YEAR_KEYS) {
        out.years[y] = out.years[y] || defaultYearIK();
        out.years[y].unitCosts = out.years[y].unitCosts || {};
        for (const roleKey of IK_ROLES) {
            out.years[y].unitCosts[roleKey] = toNum(out.years[y].unitCosts[roleKey]) * scale;
        }
    }
    return out;
}

// Same logic as frontend/src/utils/discounts.js
function computeDiscountTotalForYear({
    discounts,
    tuitionStudents,
    grossTuition,
    avgTuitionFee,
    yearKey,
}) {
    const list = Array.isArray(discounts) ? discounts : [];
    let total = 0;
    for (const d of list) {
        if (!d) continue;
        const mode = d.mode || "percent";
        const val = toNum(d.value);
        const maxAmount = d.maxAmount == null || d.maxAmount === "" ? null : toNum(d.maxAmount);

        let studentCount = toNum(d.studentCount);
        let ratio = toNum(d.ratio);

        if (yearKey === "y2") {
            if (d.studentCountY2 != null && d.studentCountY2 !== "") studentCount = toNum(d.studentCountY2);
            if (d.ratioY2 != null && d.ratioY2 !== "") ratio = toNum(d.ratioY2);
        }
        if (yearKey === "y3") {
            if (d.studentCountY3 != null && d.studentCountY3 !== "") studentCount = toNum(d.studentCountY3);
            if (d.ratioY3 != null && d.ratioY3 !== "") ratio = toNum(d.ratioY3);
        }

        studentCount = Math.max(0, studentCount);
        ratio = clamp(ratio, 0, 1);

        let amount = 0;
        if (mode === "fixed") {
            amount = val;
        } else {
            const base = grossTuition > 0 ? grossTuition : tuitionStudents * avgTuitionFee;
            amount = base * val * ratio;
        }

        if (maxAmount != null && Number.isFinite(maxAmount)) {
            amount = Math.min(amount, maxAmount);
        }
        total += amount;
    }
    return total;
}

function computeIncomeYears(gelirler, totalStudents, factors) {
    const inc = gelirler || {};
    const tuitionRows = Array.isArray(inc?.tuition?.rows) ? inc.tuition.rows : [];

    const studentCountForYear = (row, yearKey) => {
        if (!row) return 0;
        if (yearKey === "y2") return toNum(row?.studentCountY2 ?? row?.studentCount);
        if (yearKey === "y3") return toNum(row?.studentCountY3 ?? row?.studentCountY2 ?? row?.studentCount);
        return toNum(row?.studentCount);
    };

    const tuitionStudentsForYear = (yearKey) => {
        if (!tuitionRows.length) return totalStudents;
        return tuitionRows.reduce((s, r) => s + studentCountForYear(r, yearKey), 0);
    };

    const grossTuitionForYear = (yearKey) => {
        const f = factors?.[yearKey] ?? 1;
        if (tuitionRows.length) {
            return tuitionRows.reduce((s, r) => s + studentCountForYear(r, yearKey) * toNum(r?.unitFee) * f, 0);
        }
        return tuitionStudentsForYear(yearKey) * toNum(inc.tuitionFeePerStudentYearly) * f;
    };

    const nonEdRows = Array.isArray(inc?.nonEducationFees?.rows) ? inc.nonEducationFees.rows : [];
    const dormRows = Array.isArray(inc?.dormitory?.rows) ? inc.dormitory.rows : [];

    const nonEdForYear = (yearKey) => {
        const f = factors?.[yearKey] ?? 1;
        if (nonEdRows.length) {
            return nonEdRows.reduce((s, r) => s + studentCountForYear(r, yearKey) * toNum(r?.unitFee) * f, 0);
        }
        return totalStudents * toNum(inc.lunchFeePerStudentYearly) * f;
    };

    const dormForYear = (yearKey) => {
        const f = factors?.[yearKey] ?? 1;
        if (dormRows.length) {
            return dormRows.reduce((s, r) => s + studentCountForYear(r, yearKey) * toNum(r?.unitFee) * f, 0);
        }
        return totalStudents * toNum(inc.dormitoryFeePerStudentYearly) * f;
    };

    const out = {};
    for (const y of YEAR_KEYS) {
        const grossTuition = grossTuitionForYear(y);
        const tuitionStudents = tuitionStudentsForYear(y);
        const nonEdTotal = nonEdForYear(y);
        const dormIncomeTotal = dormForYear(y);
        const activityGross = grossTuition + nonEdTotal + dormIncomeTotal;
        const avgTuitionFee = tuitionStudents > 0 ? grossTuition / tuitionStudents : 0;
        out[y] = { grossTuition, tuitionStudents, avgTuitionFee, activityGross };
    }
    return out;
}

function computeTotalStudentsFallback(inputs) {
    // Best effort fallback if tuition rows are empty.
    // Prefer GradesYears (y1) if present, else 0.
    const gy = inputs?.gradesYears && typeof inputs.gradesYears === "object" ? inputs.gradesYears : null;
    const list = gy?.y1;
    if (Array.isArray(list) && list.length) {
        return list.reduce((sum, r) => sum + toNum(r?.studentsPerBranch), 0);
    }
    return 0;
}

/**
 * buildGiderlerModel
 */
function buildGiderlerModel({ scenario, inputs, report, programType, currencyMeta, reportCurrency }) {
    // report + programType are part of signature for parity / future use.
    void report;
    void programType;

    const _inputs = inputs && typeof inputs === "object" ? inputs : {};

    const baseYear = Number(String(scenario?.academic_year || "").split("-")[0]) || null;
    const yearMeta = buildYearMeta(baseYear);

    const inputCurrency = currencyMeta?.input_currency || scenario?.input_currency || "USD";
    const fx = toNum(currencyMeta?.fx_usd_to_local) || 1;
    const localCode = currencyMeta?.local_currency_code || scenario?.local_currency_code || "LOCAL";
    const showLocal = String(reportCurrency || "usd").toLowerCase() === "local";
    const currencyCode = showLocal ? localCode : "USD";
    const scale = inputCurrency === "LOCAL" && !showLocal ? 1 / fx : 1;

    const factors = getInflationFactors(_inputs?.temelBilgiler);

    // Scale incomes/discounts when scenario was entered in LOCAL but reportCurrency is USD.
    const gelirlerScaled = applyScaleToGelirler(_inputs?.gelirler || {}, scale);
    const discountsScaled = applyScaleToDiscounts(_inputs?.discounts || [], scale);

    const totalStudentsFallback = computeTotalStudentsFallback(_inputs);
    const incomeYears = computeIncomeYears(gelirlerScaled, totalStudentsFallback, factors);

    const discountTotals = {
        y1: computeDiscountTotalForYear({
            discounts: discountsScaled,
            tuitionStudents: incomeYears.y1.tuitionStudents,
            grossTuition: incomeYears.y1.grossTuition,
            avgTuitionFee: incomeYears.y1.avgTuitionFee,
            yearKey: "y1",
        }),
        y2: computeDiscountTotalForYear({
            discounts: discountsScaled,
            tuitionStudents: incomeYears.y2.tuitionStudents,
            grossTuition: incomeYears.y2.grossTuition,
            avgTuitionFee: incomeYears.y2.avgTuitionFee,
            yearKey: "y2",
        }),
        y3: computeDiscountTotalForYear({
            discounts: discountsScaled,
            tuitionStudents: incomeYears.y3.tuitionStudents,
            grossTuition: incomeYears.y3.grossTuition,
            avgTuitionFee: incomeYears.y3.avgTuitionFee,
            yearKey: "y3",
        }),
    };

    const netCiro = {
        y1: Math.max(0, incomeYears.y1.activityGross - discountTotals.y1),
        y2: Math.max(0, incomeYears.y2.activityGross - discountTotals.y2),
        y3: Math.max(0, incomeYears.y3.activityGross - discountTotals.y3),
    };

    const gBase = defaultGiderler();
    const g = deepMerge(gBase, _inputs?.giderler || {});

    // Ensure unitCosts for Y2/Y3 are derived (same as HR tab) then scale unitCosts if needed.
    const ik3y = applyScaleToIkUnitCosts(applyUnitCostGrowth(buildIK(_inputs?.ik || {}), _inputs?.ik?.unitCostRatio, factors), scale);
    const salaryByYear = {
        y1: salaryMapForYear(ik3y?.years?.y1),
        y2: salaryMapForYear(ik3y?.years?.y2),
        y3: salaryMapForYear(ik3y?.years?.y3),
    };

    const getSalaryAmount = (key, yearKey) => {
        const baseIsletmeVal = toNum(g.isletme?.items?.[key]) * scale;
        const ikBaseY1 = toNum(salaryByYear?.y1?.[key]);
        const extraY1 = ikBaseY1 > 0 ? Math.max(0, baseIsletmeVal - ikBaseY1) : 0;
        const base = ikBaseY1 > 0 ? ikBaseY1 : baseIsletmeVal;
        const fromIk = toNum(salaryByYear?.[yearKey]?.[key]);
        const baseYearVal = fromIk > 0 ? fromIk : yearKey === "y1" ? base : base * (factors?.[yearKey] ?? 1);
        const extraYearVal = yearKey === "y1" ? extraY1 : extraY1 * (factors?.[yearKey] ?? 1);
        return baseYearVal + extraYearVal;
    };

    const getOperatingAmount = (key, yearKey) => {
        if (IK_AUTO_KEYS.has(key)) return getSalaryAmount(key, yearKey);
        const base1 = toNum(g.isletme?.items?.[key]) * scale;
        if (yearKey === "y1") return base1;
        return base1 * (factors?.[yearKey] ?? 1);
    };

    // Operating totals by year
    const operatingTotals = { y1: 0, y2: 0, y3: 0 };
    for (const it of OPERATING_ITEMS) {
        operatingTotals.y1 += getOperatingAmount(it.key, "y1");
        operatingTotals.y2 += getOperatingAmount(it.key, "y2");
        operatingTotals.y3 += getOperatingAmount(it.key, "y3");
    }

    // SECTION 2: Öğrenim Dışı (service) totals
    const svcTotals = { y1: 0, y2: 0, y3: 0 };
    const serviceRows = [];
    for (const it of SERVICE_ITEMS) {
        const expRow = g?.ogrenimDisi?.items?.[it.key] || {};
        const uc1 = toNum(expRow?.unitCost) * scale;
        const uc2 = uc1 * (factors.y2 ?? 1);
        const uc3 = uc1 * (factors.y3 ?? 1);

        const incomeKey = SERVICE_TO_INCOME_KEY[it.key];
        const srcRow = Array.isArray(gelirlerScaled?.nonEducationFees?.rows)
            ? gelirlerScaled.nonEducationFees.rows.find((r) => r?.key === incomeKey)
            : null;

        const sc1 = studentCountFromIncomeRow(srcRow, "y1");
        const sc2 = studentCountFromIncomeRow(srcRow, "y2");
        const sc3 = studentCountFromIncomeRow(srcRow, "y3");

        const t1 = sc1 * uc1;
        const t2 = sc2 * uc2;
        const t3 = sc3 * uc3;
        svcTotals.y1 += t1;
        svcTotals.y2 += t2;
        svcTotals.y3 += t3;

        serviceRows.push({
            key: it.key,
            code: it.code,
            label: it.label,
            y1: { studentCount: sc1, unitCost: uc1, total: t1 },
            y2: { studentCount: sc2, unitCost: uc2, total: t2 },
            y3: { studentCount: sc3, unitCost: uc3, total: t3 },
        });
    }

    // SECTION 3: Yurt / Konaklama totals
    const dormTotals = { y1: 0, y2: 0, y3: 0 };
    const dormRows = [];
    for (const it of DORM_ITEMS) {
        const expRow = g?.yurt?.items?.[it.key] || {};
        const uc1 = toNum(expRow?.unitCost) * scale;
        const uc2 = uc1 * (factors.y2 ?? 1);
        const uc3 = uc1 * (factors.y3 ?? 1);

        const incomeKey = DORM_TO_INCOME_KEY[it.key];
        const srcRow = Array.isArray(gelirlerScaled?.dormitory?.rows) ? gelirlerScaled.dormitory.rows.find((r) => r?.key === incomeKey) : null;

        const sc1 = studentCountFromIncomeRow(srcRow, "y1");
        const sc2 = studentCountFromIncomeRow(srcRow, "y2");
        const sc3 = studentCountFromIncomeRow(srcRow, "y3");

        const t1 = sc1 * uc1;
        const t2 = sc2 * uc2;
        const t3 = sc3 * uc3;
        dormTotals.y1 += t1;
        dormTotals.y2 += t2;
        dormTotals.y3 += t3;

        dormRows.push({
            key: it.key,
            code: it.code,
            label: it.label,
            y1: { studentCount: sc1, unitCost: uc1, total: t1 },
            y2: { studentCount: sc2, unitCost: uc2, total: t2 },
            y3: { studentCount: sc3, unitCost: uc3, total: t3 },
        });
    }

    const totalExpenses = {
        y1: operatingTotals.y1 + svcTotals.y1 + dormTotals.y1,
        y2: operatingTotals.y2 + svcTotals.y2 + dormTotals.y2,
        y3: operatingTotals.y3 + svcTotals.y3 + dormTotals.y3,
    };

    // SECTION 1 rows (operating)
    const operatingByKey = new Map();
    for (const it of OPERATING_ITEMS) operatingByKey.set(it.key, it);

    const OPERATING_GROUPS = [
        { label: null, keys: ["ulkeTemsilciligi", "genelYonetim"] },
        {
            label: "Eğitim Hizmetleri Maliyetleri",
            keys: [
                "kira",
                "emsalKira",
                "enerjiKantin",
                "turkPersonelMaas",
                "turkDestekPersonelMaas",
                "yerelPersonelMaas",
                "yerelDestekPersonelMaas",
                "internationalPersonelMaas",
                "disaridanHizmet",
                "egitimAracGerec",
                "finansalGiderler",
                "egitimAmacliHizmet",
            ],
        },
        { label: null, keys: ["temsilAgirlama"] },
        { label: null, keys: ["ulkeIciUlasim"] },
        { label: null, keys: ["ulkeDisiUlasim"] },
        { label: "Vergiler", keys: ["vergilerResmiIslemler", "vergiler"] },
        { label: null, keys: ["demirbasYatirim", "rutinBakim"] },
        { label: "Pazarlama, Tanıtım", keys: ["pazarlamaOrganizasyon", "reklamTanitim"] },
        { label: null, keys: ["tahsilEdilemeyenGelirler"] },
    ];

    const operatingRows = [];
    for (const grp of OPERATING_GROUPS) {
        const items = grp.keys.map((k) => operatingByKey.get(k)).filter(Boolean);
        for (let idx = 0; idx < items.length; idx++) {
            const it = items[idx];
            const groupLabel = grp.label ? (idx === 0 ? grp.label : "") : "";

            const a1 = getOperatingAmount(it.key, "y1");
            const a2 = getOperatingAmount(it.key, "y2");
            const a3 = getOperatingAmount(it.key, "y3");

            const inc2 = yoy(a2, a1);
            const inc3 = yoy(a3, a2);

            const op1 = operatingTotals.y1 > 0 ? a1 / operatingTotals.y1 : null;
            const op2 = operatingTotals.y2 > 0 ? a2 / operatingTotals.y2 : null;
            const op3 = operatingTotals.y3 > 0 ? a3 / operatingTotals.y3 : null;

            const c1 = netCiro.y1 > 0 ? a1 / netCiro.y1 : null;
            const c2 = netCiro.y2 > 0 ? a2 / netCiro.y2 : null;
            const c3 = netCiro.y3 > 0 ? a3 / netCiro.y3 : null;

            operatingRows.push({
                key: it.key,
                groupLabel,
                code: it.code,
                label: it.label,
                y1: { amount: a1, opPct: pctToDisplay(op1), ciroPct: pctToDisplay(c1) },
                y2: { yoyPct: pctToDisplay(inc2), amount: a2, opPct: pctToDisplay(op2), ciroPct: pctToDisplay(c2) },
                y3: { yoyPct: pctToDisplay(inc3), amount: a3, opPct: pctToDisplay(op3), ciroPct: pctToDisplay(c3) },
            });
        }
    }

    // Burs/Discount section rows (Section 4)
    const bursRows = [];
    const byName = new Map();
    for (const d of discountsScaled) {
        if (!d) continue;
        byName.set(String(d.name || "").trim(), d);
    }

    const tuitionStudents = {
        y1: toNum(incomeYears?.y1?.tuitionStudents),
        y2: toNum(incomeYears?.y2?.tuitionStudents),
        y3: toNum(incomeYears?.y3?.tuitionStudents),
    };

    const getCount = (d, yearKey) => {
        const baseStudents = tuitionStudents?.[yearKey] || 0;
        let c = toNum(d?.studentCount);
        if (yearKey === "y2") c = toNum(d?.studentCountY2 ?? d?.studentCount);
        if (yearKey === "y3") c = toNum(d?.studentCountY3 ?? d?.studentCount);
        if (c > 0) return c;
        const ratio = clamp(toNum(yearKey === "y2" ? d?.ratioY2 : yearKey === "y3" ? d?.ratioY3 : d?.ratio), 0, 1);
        return Math.round(baseStudents * ratio);
    };

    const getPct = (d, yearKey) => {
        let p = toNum(d?.value);
        if (d?.mode === "fixed") return 0;
        // UI stores percent-mode as decimal [0..1]
        return clamp(p, 0, 1);
    };

    const calcAmount = (d, yearKey, studentCount, pctDecimal) => {
        const grossTuition = toNum(incomeYears?.[yearKey]?.grossTuition);
        const avgTuitionFee = toNum(incomeYears?.[yearKey]?.avgTuitionFee);
        if (d?.mode === "fixed") {
            const maxAmount = d?.maxAmount == null || d.maxAmount === "" ? null : toNum(d.maxAmount);
            let amt = toNum(d?.value);
            if (maxAmount != null && Number.isFinite(maxAmount)) amt = Math.min(amt, maxAmount);
            return amt;
        }
        const base = grossTuition > 0 ? grossTuition : studentCount * avgTuitionFee;
        const ratio = tuitionStudents?.[yearKey] > 0 ? studentCount / tuitionStudents[yearKey] : 0;
        let amount = base * pctDecimal * ratio;
        const maxAmount = d?.maxAmount == null || d.maxAmount === "" ? null : toNum(d.maxAmount);
        if (maxAmount != null && Number.isFinite(maxAmount)) amount = Math.min(amount, maxAmount);
        return amount;
    };

    let bursTotals = { s1: 0, a1: 0, s2: 0, a2: 0, s3: 0, a3: 0 };
    for (const def of BURS_DEFAULTS) {
        const d = byName.get(def.name) || { name: def.name, mode: "percent", value: 0, ratio: 0 };

        const c1 = getCount(d, "y1");
        const c2 = getCount(d, "y2");
        const c3 = getCount(d, "y3");

        const p1 = getPct(d, "y1");
        const p2 = getPct(d, "y2");
        const p3 = getPct(d, "y3");

        const a1 = calcAmount(d, "y1", c1, p1);
        const a2 = calcAmount(d, "y2", c2, p2);
        const a3 = calcAmount(d, "y3", c3, p3);

        bursTotals.s1 += c1;
        bursTotals.s2 += c2;
        bursTotals.s3 += c3;
        bursTotals.a1 += a1;
        bursTotals.a2 += a2;
        bursTotals.a3 += a3;

        bursRows.push({
            name: def.name,
            y1: { studentCount: c1, avgPct: pctToDisplay(p1), total: a1 },
            y2: { studentCount: c2, avgPct: pctToDisplay(p2), total: a2 },
            y3: { studentCount: c3, avgPct: pctToDisplay(p3), total: a3 },
        });
    }

    const bursRatioStudentsY1 = tuitionStudents.y1 > 0 ? bursTotals.s1 / tuitionStudents.y1 : 0;
    const bursRatioAmountY1 = incomeYears?.y1?.grossTuition > 0 ? bursTotals.a1 / incomeYears.y1.grossTuition : 0;

    // Summary
    const summaryRows = [
        { label: "İşletme Giderleri", y1: operatingTotals.y1, y2: operatingTotals.y2, y3: operatingTotals.y3, kind: "money" },
        { label: "Öğrenim Dışı Maliyetler", y1: svcTotals.y1, y2: svcTotals.y2, y3: svcTotals.y3, kind: "money" },
        { label: "Yurt/Konaklama Giderleri", y1: dormTotals.y1, y2: dormTotals.y2, y3: dormTotals.y3, kind: "money" },
        { label: "Toplam Gider", y1: totalExpenses.y1, y2: totalExpenses.y2, y3: totalExpenses.y3, kind: "money" },
        { label: "Net Ciro", y1: netCiro.y1, y2: netCiro.y2, y3: netCiro.y3, kind: "money" },
        {
            label: "Gider / Net Ciro",
            y1: pctToDisplay(netCiro.y1 > 0 ? totalExpenses.y1 / netCiro.y1 : 0),
            y2: pctToDisplay(netCiro.y2 > 0 ? totalExpenses.y2 / netCiro.y2 : 0),
            y3: pctToDisplay(netCiro.y3 > 0 ? totalExpenses.y3 / netCiro.y3 : 0),
            kind: "percent",
        },
    ];

    return {
        sheetTitle: "Giderler ( Expenses )",
        currencyCode,
        baseYear,
        yearMeta,
        factors,
        totals: {
            operatingTotals,
            svcTotals,
            dormTotals,
            totalExpenses,
            netCiro,
            discountTotals,
        },
        sections: {
            operating: {
                title: `GİDERLER (İŞLETME) / YIL (${currencyCode})`,
                rows: operatingRows,
                totals: operatingTotals,
            },
            service: {
                title: `GİDERLER (ÖĞRENİM DIŞI HİZMETLERE YÖNELİK SATILAN MAL VE HİZMETLER) / YIL (${currencyCode})`,
                rows: serviceRows,
                totals: svcTotals,
            },
            dorm: {
                title: `GİDERLER (YURT, KONAKLAMA) / YIL (${currencyCode})`,
                rows: dormRows,
                totals: dormTotals,
            },
            burs: {
                title: `BURS VE İNDİRİMLER / YIL (${currencyCode})`,
                rows: bursRows,
                totals: {
                    y1: { studentCount: bursTotals.s1, total: bursTotals.a1 },
                    y2: { studentCount: bursTotals.s2, total: bursTotals.a2 },
                    y3: { studentCount: bursTotals.s3, total: bursTotals.a3 },
                },
                ratios: {
                    ratioStudentsY1: pctToDisplay(bursRatioStudentsY1),
                    ratioAmountY1: pctToDisplay(bursRatioAmountY1),
                },
            },
            summary: {
                title: "ÖZET",
                rows: summaryRows,
            },
        },
    };
}

module.exports = { buildGiderlerModel };
