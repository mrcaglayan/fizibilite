//backend/src/routes/scenarios.js

const express = require("express");
const { getPool } = require("../db");
const { requireAuth, requireAssignedCountry } = require("../middleware/auth");
const { calculateSchoolFeasibility } = require("../engine/feasibilityEngine");
const { computeScenarioProgress } = require("../utils/scenarioProgress");
const { getProgressConfig } = require("../utils/progressConfig");
const xlsx = require("xlsx");
const crypto = require("crypto");

const router = express.Router();
router.use(requireAuth);
router.use(requireAssignedCountry);

function normalizeKademeConfig(input) {
  const base = {
    okulOncesi: { enabled: true, from: "KG", to: "KG" },
    ilkokul: { enabled: true, from: "1", to: "5" },
    ortaokul: { enabled: true, from: "6", to: "9" },
    lise: { enabled: true, from: "10", to: "12" },
  };
  const cfg = input && typeof input === "object" ? input : {};
  const out = {};
  for (const key of Object.keys(base)) {
    const row = cfg[key] && typeof cfg[key] === "object" ? cfg[key] : {};
    out[key] = {
      enabled: row.enabled !== false,
      from: String(row.from ?? base[key].from),
      to: String(row.to ?? base[key].to),
    };
  }
  return out;
}

const NORM_YEAR_KEYS = ["y1", "y2", "y3"];
const DEFAULT_NORM_MAX_HOURS = 24;

function normalizeNormConfigRow(row) {
  const maxHoursRaw = Number(row?.teacher_weekly_max_hours);
  const baseHours = Number.isFinite(maxHoursRaw) && maxHoursRaw > 0 ? maxHoursRaw : DEFAULT_NORM_MAX_HOURS;
  const raw = row?.curriculum_weekly_hours_json;
  const yearSource =
    raw && typeof raw === "object" && raw.years && typeof raw.years === "object"
      ? raw.years
      : raw && typeof raw === "object" && NORM_YEAR_KEYS.some((y) => y in raw)
        ? raw
        : null;

  if (!yearSource) {
    const curriculum = raw && typeof raw === "object" ? raw : {};
    return { teacherWeeklyMaxHours: baseHours, curriculumWeeklyHours: curriculum };
  }

  const years = {};
  for (const y of NORM_YEAR_KEYS) {
    const src = yearSource?.[y] || {};
    const hoursRaw = Number(src?.teacherWeeklyMaxHours ?? baseHours);
    const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : baseHours;
    const curr =
      src?.curriculumWeeklyHours && typeof src.curriculumWeeklyHours === "object"
        ? src.curriculumWeeklyHours
        : src && typeof src === "object"
          ? src
          : {};
    years[y] = { teacherWeeklyMaxHours: hours, curriculumWeeklyHours: curr };
  }

  return {
    years,
    teacherWeeklyMaxHours: years.y1.teacherWeeklyMaxHours,
    curriculumWeeklyHours: years.y1.curriculumWeeklyHours,
  };
}

const KPI_YEAR_KEYS = ["y1", "y2", "y3"];

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const CURRENCY_CODE_REGEX = /^[A-Z0-9]{2,10}$/;

function normalizeCurrencyCode(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizeAcademicYear(value) {
  const raw = String(value || "").trim();
  // Accept: "YYYY" or "YYYY-YYYY" where end = start + 1
  const single = raw.match(/^(\d{4})$/);
  if (single) return single[1];
  const range = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end === start + 1) {
      return `${start}-${end}`;
    }
  }
  const err = new Error("Invalid academicYear format. Use YYYY or YYYY-YYYY (end must be start+1).");
  err.status = 400;
  throw err;
}

function parseInputsJson(inputsRaw) {
  if (inputsRaw == null) return {};
  if (typeof inputsRaw === "string") {
    try {
      return JSON.parse(inputsRaw);
    } catch (err) {
      const error = new Error("Invalid inputs JSON");
      error.status = 400;
      throw error;
    }
  }
  if (typeof inputsRaw === "object") return inputsRaw;
  return {};
}

function cloneInputs(value) {
  if (!value || typeof value !== "object") return {};
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeInputsToUsd(inputsRaw, scenario) {
  const inputs = parseInputsJson(inputsRaw);
  if (!scenario || scenario.input_currency !== "LOCAL") return inputs;

  const fx = Number(scenario.fx_usd_to_local);
  if (!Number.isFinite(fx) || fx <= 0) {
    const error = new Error("FX rate required for local currency");
    error.status = 400;
    throw error;
  }

  const out = cloneInputs(inputs);
  const convert = (obj, key) => {
    if (!obj || typeof obj !== "object") return;
    const n = Number(obj[key]);
    if (Number.isFinite(n)) obj[key] = n / fx;
  };
  const convertRows = (rows, key) => {
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => convert(row, key));
  };

  const gelirler = out.gelirler && typeof out.gelirler === "object" ? out.gelirler : {};
  convertRows(gelirler?.tuition?.rows, "unitFee");
  convertRows(gelirler?.nonEducationFees?.rows, "unitFee");
  convertRows(gelirler?.dormitory?.rows, "unitFee");
  convertRows(gelirler?.otherInstitutionIncome?.rows, "amount");
  convert(gelirler, "governmentIncentives");
  convert(gelirler, "tuitionFeePerStudentYearly");
  convert(gelirler, "lunchFeePerStudentYearly");
  convert(gelirler, "dormitoryFeePerStudentYearly");
  convert(gelirler, "otherFeePerStudentYearly");

  const giderler = out.giderler && typeof out.giderler === "object" ? out.giderler : {};
  const isletmeItems = giderler?.isletme?.items;
  if (isletmeItems && typeof isletmeItems === "object") {
    const skipKeys = ["pct", "percent", "ratio", "margin"];
    Object.entries(isletmeItems).forEach(([key, value]) => {
      const lower = key.toLowerCase();
      if (skipKeys.some((token) => lower.includes(token))) return;
      const n = Number(value);
      if (Number.isFinite(n)) isletmeItems[key] = n / fx;
    });
  }

  const legacyExpenseKeys = [
    "educationStaffYearlyCostTotal",
    "managementStaffYearlyCost",
    "supportStaffYearlyCost",
    "operationalExpensesYearly",
  ];
  legacyExpenseKeys.forEach((key) => convert(giderler, key));

  const convertUnitCostItems = (items) => {
    if (!items || typeof items !== "object") return;
    Object.values(items).forEach((row) => convert(row, "unitCost"));
  };
  convertUnitCostItems(giderler?.ogrenimDisi?.items);
  convertUnitCostItems(giderler?.yurt?.items);

  const ik = out.ik && typeof out.ik === "object" ? out.ik : {};
  const ikYears = ik?.years && typeof ik.years === "object" ? ik.years : {};
  ["y1", "y2", "y3"].forEach((yearKey) => {
    const unitCosts = ikYears?.[yearKey]?.unitCosts;
    if (!unitCosts || typeof unitCosts !== "object") return;
    Object.entries(unitCosts).forEach(([key, value]) => {
      const n = Number(value);
      if (Number.isFinite(n)) unitCosts[key] = n / fx;
    });
  });
  const legacyUnitCosts = ik?.unitCosts;
  if (legacyUnitCosts && typeof legacyUnitCosts === "object") {
    Object.entries(legacyUnitCosts).forEach(([key, value]) => {
      const n = Number(value);
      if (Number.isFinite(n)) legacyUnitCosts[key] = n / fx;
    });
  }

  if (Array.isArray(out.discounts)) {
    out.discounts = out.discounts.map((d) => {
      if (!d || typeof d !== "object") return d;
      const mode = String(d.mode || "percent");
      if (mode !== "fixed") return d;
      const n = Number(d.value);
      if (!Number.isFinite(n)) return d;
      return { ...d, value: n / fx };
    });
  }

  return out;
}

function extractScenarioYears(results) {
  let parsed = results;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== "object") return {};
  if (parsed?.years && typeof parsed.years === "object") return parsed.years;
  return { y1: parsed };
}

async function upsertScenarioKpis(pool, scenarioId, academicYear, results) {
  const years = extractScenarioYears(results);
  for (const yearKey of KPI_YEAR_KEYS) {
    const y = years?.[yearKey];
    if (!y || typeof y !== "object") continue;
    const netCiro = safeNumber(y?.income?.netActivityIncome);
    const netIncome = safeNumber(y?.income?.netIncome);
    const totalExpenses = safeNumber(y?.expenses?.totalExpenses);
    const netResult = safeNumber(y?.result?.netResult);
    const studentsTotal = Math.round(safeNumber(y?.students?.totalStudents));

    await pool.query(
      `INSERT INTO scenario_kpis
        (scenario_id, academic_year, year_key, net_ciro, net_income, total_expenses, net_result, students_total)
       VALUES
        (:scenario_id, :academic_year, :year_key, :net_ciro, :net_income, :total_expenses, :net_result, :students_total)
       ON DUPLICATE KEY UPDATE
        academic_year=VALUES(academic_year),
        net_ciro=VALUES(net_ciro),
        net_income=VALUES(net_income),
        total_expenses=VALUES(total_expenses),
        net_result=VALUES(net_result),
        students_total=VALUES(students_total)`,
      {
        scenario_id: scenarioId,
        academic_year: academicYear,
        year_key: yearKey,
        net_ciro: netCiro,
        net_income: netIncome,
        total_expenses: totalExpenses,
        net_result: netResult,
        students_total: studentsTotal,
      }
    );
  }
}

async function assertSchoolInUserCountry(pool, schoolId, countryId) {
  const [[s]] = await pool.query(
    "SELECT id, name, status FROM schools WHERE id=:id AND country_id=:country_id",
    { id: schoolId, country_id: countryId }
  );
  return s || null;
}

async function assertScenarioInSchool(pool, scenarioId, schoolId) {
  const [[s]] = await pool.query(
    "SELECT id, name, academic_year, status, submitted_at, reviewed_at, review_note, input_currency, local_currency_code, fx_usd_to_local FROM school_scenarios WHERE id=:id AND school_id=:school_id",
    { id: scenarioId, school_id: schoolId }
  );
  return s || null;
}

/**
 * GET /schools/:schoolId/scenarios
 */
router.get("/schools/:schoolId/scenarios", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const limitValue = Number(req.query?.limit);
    const offsetValue = Number(req.query?.offset);
    const fieldsParam = String(req.query?.fields || "all").toLowerCase();
    const briefColumns = ["id", "name", "academic_year", "status", "created_at", "submitted_at"];
    const defaultColumns = [
      "id",
      "name",
      "academic_year",
      "status",
      "submitted_at",
      "reviewed_at",
      "review_note",
      "created_by",
      "created_at",
      "input_currency",
      "local_currency_code",
      "fx_usd_to_local",
    ];
    const columns = fieldsParam === "brief" ? briefColumns : defaultColumns;

    const queryParams = { school_id: schoolId };
    const hasLimit = Number.isFinite(limitValue) && limitValue > 0;
    const hasOffset = Number.isFinite(offsetValue) && offsetValue >= 0;
    const limitClause = hasLimit ? ` LIMIT :limit` : "";
    if (hasLimit) queryParams.limit = limitValue;
    const offsetClause = hasOffset ? ` OFFSET :offset` : "";
    if (hasOffset) queryParams.offset = offsetValue;

    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM school_scenarios WHERE school_id=:school_id",
      { school_id: schoolId }
    );
    const total = Number(countRows?.[0]?.total ?? 0);

    const sql = `
      SELECT ${columns.join(", ")}
      FROM school_scenarios
      WHERE school_id=:school_id
      ORDER BY created_at DESC${limitClause}${offsetClause}
    `;
    const [rows] = await pool.query(sql, queryParams);

    res.setHeader("X-Total-Scenarios", total);
    if (!hasLimit && !hasOffset && fieldsParam === "all") {
      return res.json(rows);
    }

    return res.json({
      scenarios: rows,
      total,
      limit: hasLimit ? queryParams.limit : null,
      offset: hasOffset ? queryParams.offset : 0,
      fields: fieldsParam,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /schools/:schoolId/scenarios
 * Body: { name, academicYear }
 */
router.post("/schools/:schoolId/scenarios", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const { name, academicYear, kademeConfig, inputCurrency, localCurrencyCode, fxUsdToLocal } = req.body || {};
    if (!name || !academicYear) return res.status(400).json({ error: "name and academicYear required" });
    const academicYearNorm = normalizeAcademicYear(academicYear);
    const inputCurrencyValue = String(inputCurrency || "USD").trim().toUpperCase();
    if (!["USD", "LOCAL"].includes(inputCurrencyValue)) {
      return res.status(400).json({ error: "Invalid inputCurrency" });
    }

    let localCode = null;
    let fxValue = null;
    if (inputCurrencyValue === "LOCAL") {
      localCode = normalizeCurrencyCode(localCurrencyCode);
      if (!CURRENCY_CODE_REGEX.test(localCode)) {
        return res.status(400).json({ error: "Invalid localCurrencyCode" });
      }
      const fxNum = Number(fxUsdToLocal);
      if (!Number.isFinite(fxNum) || fxNum <= 0) {
        return res.status(400).json({ error: "Invalid fxUsdToLocal" });
      }
      fxValue = fxNum;
    }

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });
    if (school.status === "closed" && req.user.role !== "admin") {
      return res.status(409).json({ error: "School is closed; cannot create new scenarios." });
    }

    const [[existing]] = await pool.query(
      "SELECT id FROM school_scenarios WHERE school_id=:school_id AND academic_year=:year LIMIT 1",
      { school_id: schoolId, year: academicYearNorm }
    );
    if (existing?.id) {
      return res.status(409).json({ error: "This academic year already has a scenario." });
    }

    let r;
    try {
      [r] = await pool.query(
      `INSERT INTO school_scenarios
        (school_id, name, academic_year, input_currency, local_currency_code, fx_usd_to_local, created_by)
       VALUES
        (:school_id,:name,:year,:input_currency,:local_currency_code,:fx_usd_to_local,:created_by)`,
      {
        school_id: schoolId,
        name,
        year: academicYearNorm,
        input_currency: inputCurrencyValue,
        local_currency_code: localCode,
        fx_usd_to_local: fxValue,
        created_by: req.user.id,
      }
    );
    } catch (e) {
      if (e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062)) {
        return res.status(409).json({ error: "This academic year already has a scenario." });
      }
      throw e;
    }

    // default inputs
    const defaultGrades = [
      { grade: "KG", branchCount: 0, studentsPerBranch: 0 },
      { grade: "1", branchCount: 0, studentsPerBranch: 0 },
      { grade: "2", branchCount: 0, studentsPerBranch: 0 },
      { grade: "3", branchCount: 0, studentsPerBranch: 0 },
      { grade: "4", branchCount: 0, studentsPerBranch: 0 },
      { grade: "5", branchCount: 0, studentsPerBranch: 0 },
      { grade: "6", branchCount: 0, studentsPerBranch: 0 },
      { grade: "7", branchCount: 0, studentsPerBranch: 0 },
      { grade: "8", branchCount: 0, studentsPerBranch: 0 },
      { grade: "9", branchCount: 0, studentsPerBranch: 0 },
      { grade: "10", branchCount: 0, studentsPerBranch: 0 },
      { grade: "11", branchCount: 0, studentsPerBranch: 0 },
      { grade: "12", branchCount: 0, studentsPerBranch: 0 },
    ];
    const cloneGrades = () => defaultGrades.map((row) => ({ ...row }));

    const defaultInputs = {
      kapasite: {
  currentStudents: 0,
  years: { y1: 0, y2: 0, y3: 0 },
},
      grades: cloneGrades(),
      gradesYears: {
        y1: cloneGrades(),
        y2: cloneGrades(),
        y3: cloneGrades(),
      },

      // Optional: current-year grade distribution for comparison in the Norm tab
      gradesCurrent: cloneGrades(),


      // TEMEL BİLGİLER (Excel: "TEMEL BİLGİLER")
      temelBilgiler: {
        // 2. ve 3. yıl (Gelirler/Giderler) enflasyon çarpanları için kullanılır
        inflation: {
          expenseDeviationPct: 0,
          y2023: 0,
          y2024: 0,
          y2025: 0,
          y1: 0,
          y2: 0,
          y3: 0,
          currentSeasonAvgFee: 0,
        },

        // BÖLGE / ÜLKE / KAMPÜS-OKUL otomatik gösterilecek (user+school'dan gelir),
        // fakat bu sayfadaki diğer alanlar manuel girilir.
        yetkililer: {
          mudur: "",
          ulkeTemsilcisi: "",
          raporuHazirlayan: "",
        },

        okulEgitimBilgileri: {
          egitimBaslamaTarihi: "", // YYYY-MM-DD
          zorunluEgitimDonemleri: "",
          birDersSuresiDakika: 0,
          gunlukDersSaati: 0,
          haftalikDersSaatiToplam: 0,
          sabahciOglenci: "", // EVET/HAYIR veya açıklama
          ogretmenHaftalikDersOrt: 0,
          gecisSinaviBilgisi: "",
          uygulananProgram: "",
        },


        kademeler: normalizeKademeConfig(kademeConfig),

        // OKUL ÜCRETLERİ HESAPLAMA EVET/HAYIR
        okulUcretleriHesaplama: true,

        // OKUL ÜCRETLERİ (YENİ DÖNEM) ARTIŞ ORANLARI %
        ucretArtisOranlari: {
          okulOncesi: 0,
          ilkokulYerel: 0,
          ilkokulInt: 0,
          ortaokulYerel: 0,
          ortaokulInt: 0,
          liseYerel: 0,
          liseInt: 0,
        },

        // İnsan Kaynakları - Mevcut (manuel), Planlanan (IK modülünden otomatik türetilecek)
        ikMevcut: {
          turkPersonelYoneticiEgitimci: 0,
          turkPersonelTemsilcilik: 0,
          yerelKadroluEgitimci: 0,
          yerelUcretliVakaterEgitimci: 0,
          yerelDestek: 0,
          yerelTemsilcilik: 0,
          international: 0,
        },

        // Burs ve İndirimler - öğrenci sayısı (manuel)
        bursIndirimOgrenciSayilari: {
          magisBasariBursu: 0,
          maarifYetenekBursu: 0,
          ihtiyacBursu: 0,
          okulBasariBursu: 0,
          tamEgitimBursu: 0,
          barinmaBursu: 0,
          turkceBasariBursu: 0,
          uluslararasiYukumlulukIndirimi: 0,
          vakifCalisaniIndirimi: 0,
          kardesIndirimi: 0,
          erkenKayitIndirimi: 0,
          pesinOdemeIndirimi: 0,
          kademeGecisIndirimi: 0,
          temsilIndirimi: 0,
          kurumIndirimi: 0,
          istisnaiIndirim: 0,
          yerelMevzuatIndirimi: 0,
        },

        // Rakip analizi (manuel)
        rakipAnalizi: {
          okulOncesi: { a: 0, b: 0, c: 0 },
          ilkokul: { a: 0, b: 0, c: 0 },
          ortaokul: { a: 0, b: 0, c: 0 },
          lise: { a: 0, b: 0, c: 0 },
        },

        // Gerçekleşen/Planlanan performans
        performans: {
          gerceklesen: {
            ogrenciSayisi: 0,
            gelirler: 0,
            giderler: 0,
            karZararOrani: 0, // %
            bursVeIndirimler: 0,
          },
        },

        degerlendirme: "",
      },

      // ✅ Excel "IK" (HR) – 1/2/3 yıl kolonlu model
      ik: {
        unitCostRatio: 1,
        years: {
          y1: { unitCosts: {}, headcountsByLevel: {} },
          y2: { unitCosts: {}, headcountsByLevel: {} },
          y3: { unitCosts: {}, headcountsByLevel: {} },
        },
      },

      gelirler: {
        tuition: {
          rows: [
            { key: "okulOncesi", label: "Okul Öncesi", studentCount: 0, unitFee: 0 },
            { key: "ilkokulYerel", label: "İlkokul-YEREL", studentCount: 0, unitFee: 0 },
            { key: "ilkokulInt", label: "İlkokul-INT.", studentCount: 0, unitFee: 0 },
            { key: "ortaokulYerel", label: "Ortaokul-YEREL", studentCount: 0, unitFee: 0 },
            { key: "ortaokulInt", label: "Ortaokul-INT.", studentCount: 0, unitFee: 0 },
            { key: "liseYerel", label: "Lise-YEREL", studentCount: 0, unitFee: 0 },
            { key: "liseInt", label: "Lise-INT.", studentCount: 0, unitFee: 0 },
          ],
        },
        nonEducationFees: {
          rows: [
            { key: "yemek", label: "Yemek", studentCount: 0, unitFee: 0 },
            { key: "uniforma", label: "Üniforma", studentCount: 0, unitFee: 0 },
            { key: "kitap", label: "Kitap", studentCount: 0, unitFee: 0 },
            { key: "ulasim", label: "Ulaşım", studentCount: 0, unitFee: 0 },
          ],
        },
        dormitory: {
          rows: [
            { key: "yurt", label: "Yurt Gelirleri", studentCount: 0, unitFee: 0 },
            { key: "yazOkulu", label: "Yaz Okulu Dersleri Gelirleri", studentCount: 0, unitFee: 0 },
          ],
        },
        otherInstitutionIncome: {
          rows: [
            { key: "gayrimenkulKira", label: "Gayrimenkul Kira Gelirleri ve Diğer Gelirler", amount: 0 },
            { key: "isletmeGelirleri", label: "İşletme Gelirleri (Kantin, Kafeterya, Sosyal Faaliyet ve Spor Kulüpleri vb.)", amount: 0 },
            { key: "tesisKira", label: "Bina ve Tesislerin Konaklama, Sosyal, Kültür, Spor vb. Amaçlı Kullanımından Kaynaklı Tesis Kira Gelirleri", amount: 0 },
            { key: "egitimDisiHizmet", label: "Eğitim Dışı Verilen Hizmetler (Danışmanlık vb.) Karşılığı Gelirler", amount: 0 },
            { key: "yazOkuluOrganizasyon", label: "Yaz Okulları, Organizasyon, Kurs vb. İkinci Eğitim Gelirleri", amount: 0 },
            { key: "kayitUcreti", label: "Kayıt Ücreti", amount: 0 },
            { key: "bagislar", label: "Bağışlar", amount: 0 },
            { key: "stkKamu", label: "STK/Kamu Sübvansiyonları", amount: 0 },
            { key: "faizPromosyon", label: "Faiz, Banka Promosyon/Komisyon vb. Kaynaklı Gelirler", amount: 0 },
          ],
        },
        governmentIncentives: 0,
      },

      // Excel (Giderler) -> Burs/İndirim kategorileri
      discounts: [
        { name: "MAGİS BAŞARI BURSU", mode: "percent", value: 0, ratio: 0 },
        { name: "MAARİF YETENEK BURSU", mode: "percent", value: 0, ratio: 0 },
        { name: "İHTİYAÇ BURSU", mode: "percent", value: 0, ratio: 0 },
        { name: "OKUL BAŞARI BURSU", mode: "percent", value: 0, ratio: 0 },
        { name: "TAM EĞİTİM BURSU", mode: "percent", value: 0, ratio: 0 },
        { name: "BARINMA BURSU", mode: "percent", value: 0, ratio: 0 },
        { name: "TÜRKÇE BAŞARI BURSU", mode: "percent", value: 0, ratio: 0 },
        { name: "VAKFIN ULUSLARARASI YÜKÜMLÜLÜKLERİNDEN KAYNAKLI İNDİRİM", mode: "percent", value: 0, ratio: 0 },
        { name: "VAAKIF ÇALIŞANI İNDİRİMİ", mode: "percent", value: 0, ratio: 0 },
        { name: "KARDEŞ İNDİRİMİ", mode: "percent", value: 0, ratio: 0 },
        { name: "ERKEN KAYIT İNDİRİMİ", mode: "percent", value: 0, ratio: 0 },
        { name: "PEŞİN ÖDEME İNDİRİMİ", mode: "percent", value: 0, ratio: 0 },
        { name: "KADEME GEÇİŞ İNDİRİMİ", mode: "percent", value: 0, ratio: 0 },
        { name: "TEMSİL İNDİRİMİ", mode: "percent", value: 0, ratio: 0 },
        { name: "KURUM İNDİRİMİ", mode: "percent", value: 0, ratio: 0 },
        { name: "İSTİSNAİ İNDİRİM", mode: "percent", value: 0, ratio: 0 },
        { name: "YEREL MEVZUATIN ŞART KOŞTUĞU İNDİRİM", mode: "percent", value: 0, ratio: 0 },
      ],

      // Excel "Giderler" yapısına uygun (tek yıl)
      giderler: {
        isletme: {
          items: {
            ulkeTemsilciligi: 0,
            genelYonetim: 0,
            kira: 0,
            emsalKira: 0,
            enerjiKantin: 0,
            turkPersonelMaas: 0,
            turkDestekPersonelMaas: 0,
            yerelPersonelMaas: 0,
            yerelDestekPersonelMaas: 0,
            internationalPersonelMaas: 0,
            disaridanHizmet: 0,
            egitimAracGerec: 0,
            finansalGiderler: 0,
            egitimAmacliHizmet: 0,
            temsilAgirlama: 0,
            ulkeIciUlasim: 0,
            ulkeDisiUlasim: 0,
            vergilerResmiIslemler: 0,
            vergiler: 0,
            demirbasYatirim: 0,
            rutinBakim: 0,
            pazarlamaOrganizasyon: 0,
            reklamTanitim: 0,
            tahsilEdilemeyenGelirler: 0,
          },
        },
        ogrenimDisi: {
          items: {
            yemek: { studentCount: 0, unitCost: 0 },
            uniforma: { studentCount: 0, unitCost: 0 },
            kitapKirtasiye: { studentCount: 0, unitCost: 0 },
            ulasimServis: { studentCount: 0, unitCost: 0 },
          },
        },
        yurt: {
          items: {
            yurtGiderleri: { studentCount: 0, unitCost: 0 },
            digerYurt: { studentCount: 0, unitCost: 0 },
          },
        },
      },
    };

    await pool.query(
      "INSERT INTO scenario_inputs (scenario_id, inputs_json, updated_by) VALUES (:scenario_id,:json,:updated_by)",
      { scenario_id: r.insertId, json: JSON.stringify(defaultInputs), updated_by: req.user.id }
    );

    return res.json({
      id: r.insertId,
      name,
      academic_year: academicYear,
      input_currency: inputCurrencyValue,
      local_currency_code: localCode,
      fx_usd_to_local: fxValue,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PATCH /schools/:schoolId/scenarios/:scenarioId
 * Body: { name?, academicYear?, kademeConfig? }
 */
router.patch("/schools/:schoolId/scenarios/:scenarioId", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);
    const name = req.body?.name;
    const academicYear = req.body?.academicYear;
    const kademeConfig = req.body?.kademeConfig;
    const hasLocalCurrencyCode = req.body?.localCurrencyCode != null;
    const hasFxUsdToLocal = req.body?.fxUsdToLocal != null;

    const hasName = typeof name === "string";
    const hasYear = typeof academicYear === "string";
    const hasKademe = kademeConfig && typeof kademeConfig === "object";
    if (!hasName && !hasYear && !hasKademe && !hasLocalCurrencyCode && !hasFxUsdToLocal) {
      return res.status(400).json({ error: "name, academicYear, kademeConfig, or local currency fields required" });
    }
    if (hasName && !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (hasYear && !String(academicYear).trim()) {
      return res.status(400).json({ error: "academicYear is required" });
    }

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    if (scenario.status === "submitted" || scenario.status === "approved") {
      return res.status(409).json({ error: "Scenario locked. Awaiting admin review." });
    }

    if (req.body?.inputCurrency != null || req.body?.input_currency != null) {
      return res.status(409).json({ error: "input_currency cannot be changed" });
    }

    const wantsLocalUpdate = hasLocalCurrencyCode || hasFxUsdToLocal;
    if (wantsLocalUpdate && scenario.input_currency !== "LOCAL") {
      return res.status(409).json({ error: "local currency fields can only be updated for LOCAL scenarios" });
    }

    const updates = [];
    const params = { id: scenarioId, school_id: schoolId };
    if (hasName) {
      updates.push("name=:name");
      params.name = String(name).trim();
    }
    if (hasYear) {
      const normalizedYear = normalizeAcademicYear(academicYear);
      // If changing to a different year, enforce uniqueness per school
      const currentYear = String(scenario.academic_year || "").trim();
      if (normalizedYear !== currentYear) {
        const [[dup]] = await pool.query(
          "SELECT id FROM school_scenarios WHERE school_id=:school_id AND academic_year=:year AND id<>:id LIMIT 1",
          { school_id: schoolId, year: normalizedYear, id: scenarioId }
        );
        if (dup?.id) {
          return res.status(409).json({ error: "This academic year already has a scenario." });
        }
      }
      updates.push("academic_year=:year");
      params.year = normalizedYear;
    }

    let nextLocalCode = scenario.local_currency_code ?? null;
    let nextFx = scenario.fx_usd_to_local != null ? Number(scenario.fx_usd_to_local) : null;
    if (scenario.input_currency === "LOCAL") {
      if (hasLocalCurrencyCode) {
        const normalized = normalizeCurrencyCode(req.body?.localCurrencyCode);
        if (!CURRENCY_CODE_REGEX.test(normalized)) {
          return res.status(400).json({ error: "Invalid localCurrencyCode" });
        }
        nextLocalCode = normalized;
        updates.push("local_currency_code=:local_currency_code");
        params.local_currency_code = normalized;
      }
      if (hasFxUsdToLocal) {
        const fxNum = Number(req.body?.fxUsdToLocal);
        if (!Number.isFinite(fxNum) || fxNum <= 0) {
          return res.status(400).json({ error: "Invalid fxUsdToLocal" });
        }
        nextFx = fxNum;
        updates.push("fx_usd_to_local=:fx_usd_to_local");
        params.fx_usd_to_local = fxNum;
      }
    }

    if (updates.length) {
      try {
        await pool.query(
          `UPDATE school_scenarios SET ${updates.join(", ")} WHERE id=:id AND school_id=:school_id`,
          params
        );
      } catch (e) {
        if (e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062)) {
          return res.status(409).json({ error: "This academic year already has a scenario." });
        }
        throw e;
      }
    }

    if (hasKademe) {
      const [[row]] = await pool.query(
        "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=:id",
        { id: scenarioId }
      );
      if (!row) return res.status(404).json({ error: "Inputs not found" });

      const inputs = parseInputsJson(row.inputs_json);
      inputs.temelBilgiler =
        inputs.temelBilgiler && typeof inputs.temelBilgiler === "object" ? inputs.temelBilgiler : {};
      inputs.temelBilgiler.kademeler = normalizeKademeConfig(kademeConfig);

      await pool.query(
        "UPDATE scenario_inputs SET inputs_json=:json, updated_by=:u WHERE scenario_id=:id",
        { json: JSON.stringify(inputs), u: req.user.id, id: scenarioId }
      );
    }

    const shouldClearCache =
      scenario.input_currency === "LOCAL" &&
      ((hasLocalCurrencyCode && nextLocalCode !== (scenario.local_currency_code ?? null)) ||
        (hasFxUsdToLocal && !Number.isNaN(nextFx) && Math.abs(Number(nextFx) - Number(scenario.fx_usd_to_local || 0)) > 1e-9));

    if (shouldClearCache) {
      await pool.query("DELETE FROM scenario_results WHERE scenario_id=:id", { id: scenarioId });
      await pool.query("DELETE FROM scenario_kpis WHERE scenario_id=:id", { id: scenarioId });
    }

    const [[updated]] = await pool.query(
      "SELECT id, name, academic_year, input_currency, local_currency_code, fx_usd_to_local FROM school_scenarios WHERE id=:id",
      { id: scenarioId }
    );

    return res.json({ scenario: updated || null });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * DELETE /schools/:schoolId/scenarios/:scenarioId
 */
router.delete("/schools/:schoolId/scenarios/:scenarioId", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    const status = scenario.status || "draft";
    if (status === "submitted" || status === "approved") {
      return res.status(409).json({ error: "Scenario locked. Awaiting admin review." });
    }

    await pool.query(
      "DELETE FROM school_scenarios WHERE id=:id AND school_id=:school_id",
      { id: scenarioId, school_id: schoolId }
    );

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /schools/:schoolId/scenarios/:scenarioId/inputs
 */
router.get("/schools/:schoolId/scenarios/:scenarioId/inputs", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    const [[row]] = await pool.query(
      "SELECT inputs_json, updated_at FROM scenario_inputs WHERE scenario_id=:id",
      { id: scenarioId }
    );
    if (!row) return res.status(404).json({ error: "Inputs not found" });

    const inputs = parseInputsJson(row.inputs_json);
    return res.json({ inputs, updatedAt: row.updated_at, scenario });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PUT /schools/:schoolId/scenarios/:scenarioId/inputs
 * Body: { inputs }
 */
router.put("/schools/:schoolId/scenarios/:scenarioId/inputs", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);
    const { inputs } = req.body || {};
    if (!inputs || typeof inputs !== "object")
      return res.status(400).json({ error: "inputs object is required" });

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });
    if (scenario.status === "submitted" || scenario.status === "approved") {
      return res.status(409).json({ error: "Scenario locked. Awaiting admin review." });
    }

    await pool.query(
      "UPDATE scenario_inputs SET inputs_json=:json, updated_by=:u WHERE scenario_id=:id",
      { json: JSON.stringify(inputs), u: req.user.id, id: scenarioId }
    );

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /schools/:schoolId/scenarios/:scenarioId/calculate
 * Calculates and caches results
 */
router.post("/schools/:schoolId/scenarios/:scenarioId/calculate", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    const [[inputsRow]] = await pool.query(
      "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=:id",
      { id: scenarioId }
    );
    if (!inputsRow) return res.status(404).json({ error: "Inputs not found" });

    const [[normRow]] = await pool.query(
      "SELECT teacher_weekly_max_hours, curriculum_weekly_hours_json FROM school_norm_configs WHERE school_id=:id",
      { id: schoolId }
    );
    if (!normRow) return res.status(400).json({ error: "Norm config missing for school" });

    const normConfig = normalizeNormConfigRow(normRow);
    const inputsForCalc = normalizeInputsToUsd(inputsRow.inputs_json, scenario);
    const results = calculateSchoolFeasibility(inputsForCalc, normConfig);

    // upsert cache
    await pool.query(
      "INSERT INTO scenario_results (scenario_id, results_json, calculated_by) VALUES (:id,:json,:u) ON DUPLICATE KEY UPDATE results_json=VALUES(results_json), calculated_by=VALUES(calculated_by), calculated_at=CURRENT_TIMESTAMP",
      { id: scenarioId, json: JSON.stringify(results), u: req.user.id }
    );
    await upsertScenarioKpis(pool, scenarioId, scenario.academic_year, results);

    return res.json({ results });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /schools/:schoolId/scenarios/:scenarioId/submit
 * Submits a scenario for admin review
 */
router.post("/schools/:schoolId/scenarios/:scenarioId/submit", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    const status = scenario.status || "draft";
    if (!["draft", "revision_requested"].includes(status)) {
      return res.status(409).json({ error: "Scenario already submitted." });
    }

    const [[inputsRow]] = await pool.query(
      "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=:id",
      { id: scenarioId }
    );
    if (!inputsRow) return res.status(404).json({ error: "Inputs not found" });

    const inputsForProgress = parseInputsJson(inputsRow.inputs_json);

    const [[cached]] = await pool.query(
      "SELECT results_json FROM scenario_results WHERE scenario_id=:id",
      { id: scenarioId }
    );

    let results = cached?.results_json || null;
    const [[normRow]] = await pool.query(
      "SELECT teacher_weekly_max_hours, curriculum_weekly_hours_json FROM school_norm_configs WHERE school_id=:id",
      { id: schoolId }
    );
    const normConfig = normRow ? normalizeNormConfigRow(normRow) : null;
    if (!results) {
      if (!normRow) return res.status(400).json({ error: "Norm config missing for school" });
      const inputsForCalc = normalizeInputsToUsd(inputsRow.inputs_json, scenario);
      results = calculateSchoolFeasibility(inputsForCalc, normConfig);

      await pool.query(
        "INSERT INTO scenario_results (scenario_id, results_json, calculated_by) VALUES (:id,:json,:u) ON DUPLICATE KEY UPDATE results_json=VALUES(results_json), calculated_by=VALUES(calculated_by), calculated_at=CURRENT_TIMESTAMP",
        { id: scenarioId, json: JSON.stringify(results), u: req.user.id }
      );
    }

    if (results) {
      await upsertScenarioKpis(pool, scenarioId, scenario.academic_year, results);
    }

    let progressSnapshot = null;
    try {
      const progressConfig = await getProgressConfig(pool, req.user.country_id);
      progressSnapshot = computeScenarioProgress({ inputs: inputsForProgress, norm: normConfig, config: progressConfig });
    } catch (_) {
      progressSnapshot = null;
    }

    await pool.query(
      `UPDATE school_scenarios
       SET status='submitted',
           submitted_at=CURRENT_TIMESTAMP,
           submitted_by=:u,
           reviewed_at=NULL,
           reviewed_by=NULL,
           review_note=NULL,
           progress_pct=:progress_pct,
           progress_json=:progress_json,
           progress_calculated_at=CURRENT_TIMESTAMP
       WHERE id=:id AND school_id=:school_id`,
      {
        id: scenarioId,
        school_id: schoolId,
        u: req.user.id,
        progress_pct: progressSnapshot ? progressSnapshot.pct : null,
        progress_json: progressSnapshot ? JSON.stringify(progressSnapshot) : null,
      }
    );

    await pool.query(
      "INSERT INTO scenario_review_events (scenario_id, action, note, actor_user_id) VALUES (:id,'submit',NULL,:u)",
      { id: scenarioId, u: req.user.id }
    );

    const [[updated]] = await pool.query(
      "SELECT id, name, academic_year, status, submitted_at, reviewed_at, review_note, input_currency, local_currency_code, fx_usd_to_local FROM school_scenarios WHERE id=:id",
      { id: scenarioId }
    );

    return res.json({ scenario: updated || null });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /schools/:schoolId/scenarios/:scenarioId/report
 * Returns cached results if present, else calculates on the fly.
 */
router.get("/schools/:schoolId/scenarios/:scenarioId/report", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    const [[cache]] = await pool.query(
      "SELECT results_json, calculated_at FROM scenario_results WHERE scenario_id=:id",
      { id: scenarioId }
    );

    let resultsPayload = null;
    let resultsString = null;
    let calculatedAt = cache?.calculated_at ?? null;
    let servedFromCache = false;

    if (cache && cache.results_json) {
      resultsPayload = cache.results_json;
      resultsString = cache.results_json;
      servedFromCache = true;
    } else {
      const [[inputsRow]] = await pool.query(
        "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=:id",
        { id: scenarioId }
      );
      if (!inputsRow) return res.status(404).json({ error: "Inputs not found" });

      const [[normRow]] = await pool.query(
        "SELECT teacher_weekly_max_hours, curriculum_weekly_hours_json FROM school_norm_configs WHERE school_id=:id",
        { id: schoolId }
      );
      if (!normRow) return res.status(400).json({ error: "Norm config missing for school" });

      const normConfig = normalizeNormConfigRow(normRow);
      const inputsForCalc = normalizeInputsToUsd(inputsRow.inputs_json, scenario);
      const results = calculateSchoolFeasibility(inputsForCalc, normConfig);

      const serialized = JSON.stringify(results);
      resultsPayload = results;
      resultsString = serialized;
      calculatedAt = null;
    }

    const etag = crypto.createHash("sha1").update(resultsString).digest("hex");
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.json({
      results: resultsPayload,
      cached: servedFromCache,
      calculatedAt,
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /schools/:schoolId/scenarios/:scenarioId/export-xlsx
 * Basic Excel export (reference format). You can expand this to match your existing template.
 */
/**
 * GET /schools/:schoolId/scenarios/:scenarioId/export-xlsx
 * Excel export (reference format, now 1/2/3-year columns for Gelirler & Giderler).
 * 2. ve 3. yıl, TEMEL BİLGİLER tabındaki tahmini enflasyon oranlarına göre türetilir.
 */
router.get("/schools/:schoolId/scenarios/:scenarioId/export-xlsx", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    const reportCurrency = String(req.query?.reportCurrency || "usd").toLowerCase();
    if (!["usd", "local"].includes(reportCurrency)) {
      return res.status(400).json({ error: "Invalid reportCurrency" });
    }

    const localCode = scenario.local_currency_code;
    const fxRate = Number(scenario.fx_usd_to_local);
    const showLocal = reportCurrency === "local";
    if (showLocal) {
      if (scenario.input_currency !== "LOCAL") {
        return res.status(400).json({ error: "Local report requires LOCAL scenario" });
      }
      if (!localCode || !Number.isFinite(fxRate) || fxRate <= 0) {
        return res.status(400).json({ error: "FX rate and local currency code required" });
      }
    }

    const [[inputsRow]] = await pool.query(
      "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=:id",
      { id: scenarioId }
    );
    const [[normRow]] = await pool.query(
      "SELECT teacher_weekly_max_hours, curriculum_weekly_hours_json FROM school_norm_configs WHERE school_id=:id",
      { id: schoolId }
    );

    const inputs = parseInputsJson(inputsRow?.inputs_json);
    const normConfig = normalizeNormConfigRow(normRow);
    const inputsForCalc = normalizeInputsToUsd(inputsRow?.inputs_json, scenario);
    const results = calculateSchoolFeasibility(inputsForCalc, normConfig);

    const years = results?.years || { y1: results, y2: null, y3: null };

    const infl = (results?.temelBilgiler && results.temelBilgiler.inflation) || (inputs?.temelBilgiler && inputs.temelBilgiler.inflation) || {};
    const infl2 = Number(infl.y2 || 0);
    const infl3 = Number(infl.y3 || 0);

    const factors = (results?.temelBilgiler && results.temelBilgiler.inflationFactors) || {
      y1: 1,
      y2: 1 + infl2,
      y3: (1 + infl2) * (1 + infl3),
    };

    const n = (v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    const money = (v) => {
      const x = Number(v);
      if (!Number.isFinite(x)) return 0;
      return showLocal ? x * fxRate : x;
    };
    const withCurrencyLabels = (rows) => {
      if (!showLocal || !localCode) return rows;
      return rows.map((row) =>
        row.map((cell) => (typeof cell === "string" ? cell.replace("(USD)", `(${localCode})`) : cell))
      );
    };

    // IK salary mapping (same as engine)
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

    function salaryMapForYear(yearIK) {
      const unitCosts = yearIK?.unitCosts || {};
      const hc = yearIK?.headcountsByLevel || {};
      const roleAnnual = {};
      for (const role of IK_ROLES) {
        let totalCount = 0;
        for (const lvl of IK_LEVELS) totalCount += n(hc?.[lvl]?.[role]);
        roleAnnual[role] = n(unitCosts?.[role]) * totalCount;
      }
      const sum = (keys) => keys.reduce((s, k) => s + n(roleAnnual[k]), 0);
      return {
        turkPersonelMaas: sum(["turk_mudur", "turk_mdyard", "turk_egitimci"]),
        turkDestekPersonelMaas: sum(["turk_temsil"]),
        yerelPersonelMaas: sum(["yerel_yonetici_egitimci"]),
        yerelDestekPersonelMaas: sum(["yerel_destek", "yerel_ulke_temsil_destek"]),
        internationalPersonelMaas: sum(["int_yonetici_egitimci"]),
      };
    }
    const ikYears = inputs?.ik?.years || {};
    const salaryByYear = {
      y1: salaryMapForYear(ikYears?.y1 || {}),
      y2: salaryMapForYear(ikYears?.y2 || {}),
      y3: salaryMapForYear(ikYears?.y3 || {}),
    };

    const wb = xlsx.utils.book_new();

    // TEMEL BİLGİLER
    const temel = [
      ["TEMEL BİLGİLER"],
      ["2. YIL TAHMİNİ ENFLASYON ORANI", infl2],
      ["3. YIL TAHMİNİ ENFLASYON ORANI", infl3],
      ["Y2 FAKTÖR", factors.y2],
      ["Y3 FAKTÖR", factors.y3],
    ];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(temel), "Temel Bilgiler");

    // GELİRLER (3Y)
    const g = inputs.gelirler || {};
    const tuitionRows = Array.isArray(g?.tuition?.rows) ? g.tuition.rows : [];
    const nonEdRows = Array.isArray(g?.nonEducationFees?.rows) ? g.nonEducationFees.rows : [];
    const dormRows = Array.isArray(g?.dormitory?.rows) ? g.dormitory.rows : [];
    const otherRows = Array.isArray(g?.otherInstitutionIncome?.rows) ? g.otherInstitutionIncome.rows : [];

    const gelirlerSheet = [];
    const addPerStudentSection = (title, rows, legacyUnitFee, fallbackLabel) => {
      gelirlerSheet.push([title]);
      gelirlerSheet.push([
        "Gelirler (USD)",
        "Öğrenci Sayısı (Y1)",
        "Birim Ücret (Y1)",
        "Toplam (Y1)",
        "Öğrenci Sayısı (Y2)",
        "Birim Ücret (Y2)",
        "Toplam (Y2)",
        "Öğrenci Sayısı (Y3)",
        "Birim Ücret (Y3)",
        "Toplam (Y3)",
      ]);

      let t1 = 0,
        t2 = 0,
        t3 = 0;

      const rowsToUse =
        rows && rows.length
          ? rows
          : [
              {
                label: fallbackLabel,
                studentCount: n(years?.y1?.students?.totalStudents || 0),
                unitFee: n(legacyUnitFee || 0),
              },
            ];

      rowsToUse.forEach((r) => {
        const label = r.label || r.key || "";
        const sc1 = n(r.studentCount);
        const uf1 = n(r.unitFee);
        const sc2 = sc1;
        const sc3 = sc1;

        const uf2 = uf1 * n(factors.y2);
        const uf3 = uf1 * n(factors.y3);

        const tot1 = sc1 * uf1;
        const tot2 = sc2 * uf2;
        const tot3 = sc3 * uf3;

        t1 += tot1;
        t2 += tot2;
        t3 += tot3;

        gelirlerSheet.push([label, sc1, uf1, tot1, sc2, uf2, tot2, sc3, uf3, tot3]);
      });

      gelirlerSheet.push(["TOPLAM", "", "", t1, "", "", t2, "", "", t3]);
      gelirlerSheet.push([]);
      return { t1, t2, t3 };
    };

    const tuitionLegacyUnit = g?.tuitionFeePerStudentYearly;
    const lunchLegacyUnit = g?.lunchFeePerStudentYearly;
    const dormLegacyUnit = g?.dormitoryFeePerStudentYearly;

    const secTuition = addPerStudentSection(
      "EĞİTİM FAALİYET GELİRLERİ (Öğrenci Ücret Gelirleri) / YIL",
      tuitionRows,
      tuitionLegacyUnit,
      "(Eski model) Eğitim Ücreti"
    );

    const secNonEd = addPerStudentSection(
      "ÖĞRENİM DIŞI HİZMETLERE İLİŞKİN GELİRLER (Brüt)",
      nonEdRows,
      lunchLegacyUnit,
      "(Eski model) Öğrenim Dışı Hizmet"
    );

    const secDorm = addPerStudentSection(
      "YURT GELİRLERİ (Brüt)",
      dormRows,
      dormLegacyUnit,
      "(Eski model) Yurt"
    );

    // Other institutional income (lump sum)
    gelirlerSheet.push(["ÖĞRENCİ ÜCRETLERİ HARİÇ KURUMUN DİĞER GELİRLERİ (BRÜT)"]);
    gelirlerSheet.push(["Gelirler (USD)", "Toplam (Y1)", "Toplam (Y2)", "Toplam (Y3)"]);
    let oi1 = 0,
      oi2 = 0,
      oi3 = 0;
    const otherToUse = otherRows.length ? otherRows : [{ label: "(Eski model) Diğer", amount: n(g?.otherInstitutionIncomeYearly || 0) }];
    otherToUse.forEach((r) => {
      const a1 = n(r.amount);
      const a2 = a1 * n(factors.y2);
      const a3 = a1 * n(factors.y3);
      oi1 += a1;
      oi2 += a2;
      oi3 += a3;
      gelirlerSheet.push([r.label || r.key || "", a1, a2, a3]);
    });
    gelirlerSheet.push(["TOPLAM", oi1, oi2, oi3]);
    gelirlerSheet.push([]);

    // Government incentives
    const govt1 = n(g?.governmentIncentives);
    const govt2 = govt1 * n(factors.y2);
    const govt3 = govt1 * n(factors.y3);

    gelirlerSheet.push(["DEVLET TEŞVİKLERİ"]);
    gelirlerSheet.push(["Gelirler (USD)", "Toplam (Y1)", "Toplam (Y2)", "Toplam (Y3)"]);
    gelirlerSheet.push(["Devlet Teşvikleri", govt1, govt2, govt3]);
    gelirlerSheet.push(["TOPLAM", govt1, govt2, govt3]);
    gelirlerSheet.push([]);

    // Summary from calculated results (more reliable: includes discount caps, etc.)
    const y1 = years?.y1 || {};
    const y2 = years?.y2 || {};
    const y3 = years?.y3 || {};

    gelirlerSheet.push(["ÖZET"]);
    gelirlerSheet.push(["", "Y1", "Y2", "Y3"]);
    gelirlerSheet.push(["FAALİYET GELİRLERİ (Brüt)", money(y1?.income?.activityGross), money(y2?.income?.activityGross), money(y3?.income?.activityGross)]);
    gelirlerSheet.push(["BURS VE İNDİRİMLER", money(y1?.income?.totalDiscounts), money(y2?.income?.totalDiscounts), money(y3?.income?.totalDiscounts)]);
    gelirlerSheet.push(["NET FAALİYET GELİRLERİ", money(y1?.income?.netActivityIncome), money(y2?.income?.netActivityIncome), money(y3?.income?.netActivityIncome)]);
    gelirlerSheet.push(["NET KİŞİ BAŞI CİRO", money(y1?.kpis?.netCiroPerStudent), money(y2?.kpis?.netCiroPerStudent), money(y3?.kpis?.netCiroPerStudent)]);
    gelirlerSheet.push(["DİĞER GELİRLER (Brüt + Devlet Teşvikleri)", money(y1?.income?.otherIncomeTotal), money(y2?.income?.otherIncomeTotal), money(y3?.income?.otherIncomeTotal)]);
    gelirlerSheet.push(["DİĞER GELİRLER %", n(y1?.income?.otherIncomeRatio), n(y2?.income?.otherIncomeRatio), n(y3?.income?.otherIncomeRatio)]);
    gelirlerSheet.push(["NET TOPLAM GELİR", money(y1?.income?.netIncome), money(y2?.income?.netIncome), money(y3?.income?.netIncome)]);

    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(withCurrencyLabels(gelirlerSheet)), "gelirler");

    // GİDERLER (3Y)
    const gider = inputs.giderler || {};
    const isletme = gider.isletme && gider.isletme.items ? gider.isletme.items : {};
    const ogrenimDisi = gider.ogrenimDisi && gider.ogrenimDisi.items ? gider.ogrenimDisi.items : {};
    const yurt = gider.yurt && gider.yurt.items ? gider.yurt.items : {};

    const operatingItems = [
      ["ulkeTemsilciligi", 1, 632, "Ülke Temsilciliği Giderleri (Temsilcilik Per. Gid. HARİÇ)"],
      ["genelYonetim", 2, 632, "Genel Yönetim Giderleri (Ofis Giderleri, Kırtasiye, Aidatlar,Sosyal Yardımlar, Araç Kiralama, Sigorta vb.)"],
      ["kira", 3, 622, "İşletme Giderleri (Kira)"],
      ["emsalKira", 4, 622, "İşletme Giderleri (Emsal Kira, Bina Tahsis veya Vakıf'a ait ise Emsal Kira Bedeli Yazılacak)"],
      ["enerjiKantin", 5, 622, "İşletme Giderleri (Elektrik, Su, Isıtma, Soğutma, Veri/Ses İletişim vb. Kantin)"],
      ["turkPersonelMaas", 6, 622, "Yurt dışı TÜRK Personel Maaş Giderleri (Müdür, Müdür Yardımcısı,Yönetici, Eğitimci, Öğretmen, Belletmen vb.)"],
      ["turkDestekPersonelMaas", 7, 622, "Yurt dışı TÜRK DESTEK Personel Maaş Giderleri (Eğitim faaliyetinde bulunmayan diğer çalışanlar. Ülke Temsilcisi, Temsilcilik destek vb.)"],
      ["yerelPersonelMaas", 8, 622, "Yurt dışı YEREL Personel Maaş Giderleri (Yönetici, Eğitimci, Öğretmen, Belletmen vb.)"],
      ["yerelDestekPersonelMaas", 9, 622, "Yurt dışı YEREL DESTEK ve Ülke Temsilciği DESTEK Personel Maaş Giderleri (Eğitim faaliyetinde bulunmayan diğer çalışanlar)"],
      ["internationalPersonelMaas", 10, 622, "Yurt dışı INTERNATIONAL Personel Maaş Giderleri (Yönetici, Eğitimci, Öğretmen, Belletmen vb.)"],
      ["disaridanHizmet", 11, 632, "Dışarıdan Sağlanan Mal ve Hizmet Alımları (Güvenlik,Temizlik,Avukatlık, Danışmanlık, İş Sağlığı ve Güvenliği, Mali Müşavir vb.)"],
      ["egitimAracGerec", 12, 622, "Eğitim Araç ve Gereçleri (Okul ve Sınıflar için Kırtasiye Malzemeleri, Kitaplar, vb.) - (Öğrencilere dönem başı verilen)"],
      ["finansalGiderler", 13, 632, "Finansal Giderler (Prim ödemeleri, Komisyon ve Kredi Giderleri, Teminat Mektupları)"],
      ["egitimAmacliHizmet", 14, 622, "Eğitim Amaçlı Hizmet Alımları (İzinler ve lisanslama, Cambridge Lisanslamaları vb.)"],
      ["temsilAgirlama", 16, 632, "Temsil ve Ağırlama - Kampüs bazında (Öğlen Yemeği Giderleri Hariç) mutfak giderleri vs.)"],
      ["ulkeIciUlasim", 17, 622, "Ülke İçi Ulaşım ve Konaklama / Uçak Bileti Dahil / PERSONEL ULAŞIM"],
      ["ulkeDisiUlasim", 18, 632, "Ülke Dışı Ulaşım ve Konaklama / Uçak Bileti Dahil / (TMV Merkez Misafir Ağırlama, Türk Personel)"],
      ["vergilerResmiIslemler", 21, 632, "Vergiler Resmi İşlemler (Mahkeme,Dava ve İcra, Resmi İzinler,Tescil ve Kuruluş İşlemleri, Noter vb.)"],
      ["vergiler", 22, 632, "Vergiler (Kira Stopaj dahil)"],
      ["demirbasYatirim", 23, 622, "Demirbaş, Arsa, Bina, Taşıt ve Diğer Yatırım Alımları (Lisanslama, Yazılım ve program, Telif hakları vb. dahil)"],
      ["rutinBakim", 24, 622, "Rutin Bakım, Onarım Giderleri (Boya, Tamirat, Tadilat, Makine Teçhizat, Araç, Ofis Malzeme Tamiri vb.)"],
      ["pazarlamaOrganizasyon", 25, 631, "Pazarlama, Tanıtım Organizasyon, Etkinlikler (Öğrenci Faaliyetleri Dahil)"],
      ["reklamTanitim", 26, 631, "Reklam, Tanıtım, Basım, İlan"],
      ["tahsilEdilemeyenGelirler", 29, 622, "Tahsil Edilemeyen Gelirler"],
    ];

    const salaryKeys = new Set([
      "turkPersonelMaas",
      "turkDestekPersonelMaas",
      "yerelPersonelMaas",
      "yerelDestekPersonelMaas",
      "internationalPersonelMaas",
    ]);

    const getSalaryForYear = (key, yearKey) => {
      const base = n(salaryByYear?.y1?.[key]) > 0 ? n(salaryByYear.y1[key]) : n(isletme?.[key]);
      const fromIk = n(salaryByYear?.[yearKey]?.[key]);
      if (fromIk > 0) return fromIk;
      if (yearKey === "y1") return base;
      if (yearKey === "y2") return base * n(factors.y2);
      return base * n(factors.y3);
    };

    const opAmount = (key, yearKey) => {
      if (salaryKeys.has(key)) return getSalaryForYear(key, yearKey);
      const base = n(isletme?.[key]);
      if (yearKey === "y1") return base;
      if (yearKey === "y2") return base * n(factors.y2);
      return base * n(factors.y3);
    };

    const giderlerSheet = [
      ["GİDERLER (İŞLETME) / YIL (USD)"],
      ["Sıra", "Hesap", "Gider Kalemi", "Toplam (Y1)", "Toplam (Y2)", "Toplam (Y3)"],
    ];

    let op1 = 0, op2 = 0, op3 = 0;
    operatingItems.forEach(([key, no, code, label]) => {
      const a1 = opAmount(key, "y1");
      const a2 = opAmount(key, "y2");
      const a3 = opAmount(key, "y3");
      op1 += a1; op2 += a2; op3 += a3;
      giderlerSheet.push([no, code, label, a1, a2, a3]);
    });
    giderlerSheet.push(["TOPLAM", "", "", op1, op2, op3]);
    giderlerSheet.push([]);

    // Öğrenim dışı hizmetlere yönelik maliyetler
    giderlerSheet.push(["GİDERLER (ÖĞRENİM DIŞI HİZMETLERE YÖNELİK SATILAN MAL VE HİZMETLER) / YIL"]);
    giderlerSheet.push([
      "Sıra", "Hesap", "Gider Kalemi",
      "Öğrenci (Y1)", "Birim (Y1)", "Toplam (Y1)",
      "Öğrenci (Y2)", "Birim (Y2)", "Toplam (Y2)",
      "Öğrenci (Y3)", "Birim (Y3)", "Toplam (Y3)",
    ]);

    const serviceItems = [
      ["yemek", 27, 622, "Yemek (Öğrenci ve Personel öğlen yemeği için yapılan harcamalar (Enerji, gıda,yakıt,elektrik,gaz vs. ve org. gideri))"],
      ["uniforma", 28, 621, "Üniforma (Öğrenci Üniforma maliyeti (Liste fiyatı değil, maliyet fiyatı))"],
      ["kitapKirtasiye", 29, 621, "Kitap-Kırtasiye (Öğrencilere dönem başı verdiğimiz materyallerin maliyeti)"],
      ["ulasimServis", 30, 622, "Ulaşım (Okul Servisi) Öğrencilerimiz için kullanılan servis maliyeti"],
    ];

    let sv1=0, sv2=0, sv3=0;
    let svStudents=0;
    serviceItems.forEach(([key, no, code, label]) => {
      const row = ogrenimDisi[key] || {};
      const sc1 = n(row.studentCount);
      const uc1 = n(row.unitCost);
      const sc2 = sc1, sc3 = sc1;
      const uc2 = uc1 * n(factors.y2);
      const uc3 = uc1 * n(factors.y3);
      const t1 = sc1*uc1, t2 = sc2*uc2, t3 = sc3*uc3;
      sv1 += t1; sv2 += t2; sv3 += t3;
      svStudents += sc1;
      giderlerSheet.push([no, code, label, sc1, uc1, t1, sc2, uc2, t2, sc3, uc3, t3]);
    });
    giderlerSheet.push(["TOPLAM", "", "", svStudents, "", sv1, svStudents, "", sv2, svStudents, "", sv3]);
    giderlerSheet.push([]);

    // Yurt/Konaklama
    giderlerSheet.push(["GİDERLER (YURT, KONAKLAMA) / YIL"]);
    giderlerSheet.push([
      "Sıra", "Hesap", "Gider Kalemi",
      "Öğrenci (Y1)", "Birim (Y1)", "Toplam (Y1)",
      "Öğrenci (Y2)", "Birim (Y2)", "Toplam (Y2)",
      "Öğrenci (Y3)", "Birim (Y3)", "Toplam (Y3)",
    ]);

    const dormItems = [
      ["yurtGiderleri", 31, 622, "Yurt Giderleri (Kampüs giderleri içinde gösterilmeyecek; yurt için yapılan giderler)"],
      ["digerYurt", 32, 622, "Diğer (Yaz Okulu Giderleri vs)"],
    ];

    let dm1=0, dm2=0, dm3=0;
    let dmStudents=0;
    dormItems.forEach(([key, no, code, label]) => {
      const row = yurt[key] || {};
      const sc1 = n(row.studentCount);
      const uc1 = n(row.unitCost);
      const sc2 = sc1, sc3 = sc1;
      const uc2 = uc1 * n(factors.y2);
      const uc3 = uc1 * n(factors.y3);
      const t1 = sc1*uc1, t2 = sc2*uc2, t3 = sc3*uc3;
      dm1 += t1; dm2 += t2; dm3 += t3;
      dmStudents += sc1;
      giderlerSheet.push([no, code, label, sc1, uc1, t1, sc2, uc2, t2, sc3, uc3, t3]);
    });
    giderlerSheet.push(["TOPLAM", "", "", dmStudents, "", dm1, dmStudents, "", dm2, dmStudents, "", dm3]);
    giderlerSheet.push([]);

    // Burs/İndirimler (use calculated details if available)
    const bursNames = [
      "MAGİS BAŞARI BURSU",
      "MAARİF YETENEK BURSU",
      "İHTİYAÇ BURSU",
      "OKUL BAŞARI BURSU",
      "TAM EĞİTİM BURSU",
      "BARINMA BURSU",
      "TÜRKÇE BAŞARI BURSU",
      "VAKFIN ULUSLARARASI YÜKÜMLÜLÜKLERİNDEN KAYNAKLI İNDİRİM",
      "VAAKIF ÇALIŞANI İNDİRİMİ",
      "KARDEŞ İNDİRİMİ",
      "ERKEN KAYIT İNDİRİMİ",
      "PEŞİN ÖDEME İNDİRİMİ",
      "KADEME GEÇİŞ İNDİRİMİ",
      "TEMSİL İNDİRİMİ",
      "KURUM İNDİRİMİ",
      "İSTİSNAİ İNDİRİM",
      "YEREL MEVZUATIN ŞART KOŞTUĞU İNDİRİM",
    ];

    const discList = Array.isArray(inputs.discounts) ? inputs.discounts : [];
    const discByName = new Map(discList.map((d) => [String(d && d.name ? d.name : ""), d]));
    const tuitionStudents = n(y1?.income?.tuitionStudents || y1?.students?.totalStudents || 0);

    const yDiscDetail = (yr) => new Map(((yr?.income?.discountsDetail) || []).map((d) => [String(d?.name || d?.label || d?.key || ""), d]));
    const d1 = yDiscDetail(y1);
    const d2 = yDiscDetail(y2);
    const d3 = yDiscDetail(y3);

    let bursStudents = 0;
    let a1=0,a2=0,a3=0;
    let weightedPctSum = 0;

    giderlerSheet.push(["BURS VE İNDİRİMLER / YIL"]);
    giderlerSheet.push(["Burs / İndirim", "Burslu Öğrenci", "Ort. %", "Tutar (Y1)", "Tutar (Y2)", "Tutar (Y3)"]);

    bursNames.forEach((name) => {
      const dIn = discByName.get(name) || { mode: "percent", value: 0, ratio: 0 };
      const ratio = Math.max(0, Math.min(n(dIn.ratio || 0), 1));
      const pct = Math.max(0, Math.min(n(dIn.value || 0), 1));
      const count = tuitionStudents > 0 ? Math.round(tuitionStudents * ratio) : 0;

      const amt1 = money(d1.get(name)?.amount);
      const amt2 = money(d2.get(name)?.amount);
      const amt3 = money(d3.get(name)?.amount);

      bursStudents += count;
      weightedPctSum += count * pct;
      a1 += amt1; a2 += amt2; a3 += amt3;

      giderlerSheet.push([name, count, pct, amt1, amt2, amt3]);
    });

    const weightedPct = bursStudents > 0 ? weightedPctSum / bursStudents : 0;

    giderlerSheet.push(["TOPLAM", bursStudents, weightedPct, a1, a2, a3]);
    giderlerSheet.push([]);

    // Expenses summary
    giderlerSheet.push(["ÖZET"]);
    giderlerSheet.push(["", "Y1", "Y2", "Y3"]);
    giderlerSheet.push(["TOPLAM GİDER", money(y1?.expenses?.totalExpenses), money(y2?.expenses?.totalExpenses), money(y3?.expenses?.totalExpenses)]);
    giderlerSheet.push(["NET SONUÇ", money(y1?.result?.netResult), money(y2?.result?.netResult), money(y3?.result?.netResult)]);
    giderlerSheet.push(["KÂR MARJI", n(y1?.kpis?.profitMargin), n(y2?.kpis?.profitMargin), n(y3?.kpis?.profitMargin)]);

    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(withCurrencyLabels(giderlerSheet)), "Giderler");

    // n.kadro (norm insights) - year-1
    const nk = [["Grade", "Branches", "Weekly Teaching Hours"]];
    (y1?.norm?.breakdownByGrade || []).forEach((r) => nk.push([r.grade, r.branchCount, r.weeklyTeachingHours]));
    nk.push(["TOTAL", "", "", y1?.norm?.totalTeachingHours]);
    nk.push(["Required Teachers", "", "", y1?.norm?.requiredTeachers]);
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(nk), "n.kadro");

    // rapor (3Y)
    const rapor = [
      ["Metric", "Y1", "Y2", "Y3"],
      ["Total Students", n(y1?.students?.totalStudents), n(y2?.students?.totalStudents), n(y3?.students?.totalStudents)],
      ["Utilization", n(y1?.students?.utilizationRate), n(y2?.students?.utilizationRate), n(y3?.students?.utilizationRate)],
      ["Net Income", money(y1?.income?.netIncome), money(y2?.income?.netIncome), money(y3?.income?.netIncome)],
      ["Total Expenses", money(y1?.expenses?.totalExpenses), money(y2?.expenses?.totalExpenses), money(y3?.expenses?.totalExpenses)],
      ["Net Result", money(y1?.result?.netResult), money(y2?.result?.netResult), money(y3?.result?.netResult)],
      ["Revenue/Student", money(y1?.kpis?.revenuePerStudent), money(y2?.kpis?.revenuePerStudent), money(y3?.kpis?.revenuePerStudent)],
      ["Cost/Student", money(y1?.kpis?.costPerStudent), money(y2?.kpis?.costPerStudent), money(y3?.kpis?.costPerStudent)],
      ["Profit Margin", n(y1?.kpis?.profitMargin), n(y2?.kpis?.profitMargin), n(y3?.kpis?.profitMargin)],
    ];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rapor), "rapor");

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const baseName = showLocal
      ? `${school.name}-${scenario.academic_year}-${localCode}.xlsx`
      : `${school.name}-${scenario.academic_year}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename=\"${baseName}\"`);
    return res.send(buf);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

module.exports = router;
