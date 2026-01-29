//backend/src/routes/scenarios.js

const express = require("express");
const { getPool } = require("../db");
const {
  requireAuth,
  requireAssignedCountry,
  requireSchoolContextAccess,
  requireSchoolPermission,
  requireAnySchoolRead,
  requireRole,
  requirePermission,
} = require('../middleware/auth');
const { calculateSchoolFeasibility } = require("../engine/feasibilityEngine");
const { computeScenarioProgress } = require("../utils/scenarioProgress");
const { computeScenarioWorkflowStatus, getRequiredWorkIdsForScenario } = require("../utils/scenarioWorkflow");
const { getProgressConfig } = require("../utils/progressConfig");
const { normalizeProgramType } = require("../utils/programType");
const { getPrevScenario } = require("../utils/report/getPrevScenario");
const { buildDetailedReportModel } = require("../utils/report/buildDetailedReportModel");
const { buildTemelBilgilerModel } = require("../utils/report/buildTemelBilgilerModel");
const { buildKapasiteModel } = require("../utils/report/buildKapasiteModel");
const { buildHrModel } = require("../utils/report/buildHrModel");
const { buildGelirlerModel } = require("../utils/report/buildGelirlerModel");
const { buildGiderlerModel } = require("../utils/report/buildGiderlerModel");
const { buildNormModel } = require("../utils/report/buildNormModel");
const { buildMaliTablolarModel } = require("../utils/report/buildMaliTablolarModel");
const {
  applyDistributionOverlay,
  getLatestDistributionForScenario,
  getDistributionAllocationsForTarget,
} = require("../utils/expenseDistributions");
const { buildRaporAoa } = require("../utils/excel/raporAoa");
const { buildTemelBilgilerAoa } = require("../utils/excel/temelBilgilerAoa");
const { buildKapasiteAoa } = require("../utils/excel/kapasiteAoa");
const { buildHrAoa } = require("../utils/excel/hrAoa");
const { buildGelirlerAoa } = require("../utils/excel/gelirlerAoa");
const { buildGiderlerAoa } = require("../utils/excel/giderlerAoa");
const { buildNormAoa } = require("../utils/excel/normAoa");
const { buildMaliTablolarAoa } = require("../utils/excel/maliTablolarAoa");
const { parseListParams } = require("../utils/listParams");
const {
  DEFAULT_NORM_MAX_HOURS,
  buildEmptyNormYears,
  normalizeNormConfigRow,
  getNormConfigRowForScenario,
} = require("../utils/normConfig");
const { getScenarioProgressSnapshot, invalidateScenarioProgress } = require("../utils/scenarioProgressCache");
const { getUserPermissions, hasPermission } = require("../utils/permissionService");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const crypto = require("crypto");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const router = express.Router();
router.use(requireAuth);
router.use(requireAssignedCountry);

// Ensure principal users are assigned to the school for all school‑specific scenario routes.
// This middleware runs for any route beginning with /schools/:schoolId and will
// verify that the school exists in the user's country and that principals are
// assigned to the school. Admins bypass the check.
router.use('/schools/:schoolId', requireSchoolContextAccess('schoolId'));

const execFileAsync = promisify(execFile);

async function convertXlsxBufferToPdf(buffer, baseName = "rapor") {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "rapor-"));
  const safeBase = baseName.replace(/[^a-zA-Z0-9_-]+/g, "_") || "rapor";
  const xlsxPath = path.join(tmpDir, `${safeBase}.xlsx`);
  const pdfPath = path.join(tmpDir, `${safeBase}.pdf`);
  const candidates = [process.env.SOFFICE_PATH, "soffice", "libreoffice"].filter(Boolean);
  let lastError = null;

  try {
    await fs.promises.writeFile(xlsxPath, buffer);
    for (const cmd of candidates) {
      try {
        await execFileAsync(cmd, ["--headless", "--convert-to", "pdf", "--outdir", tmpDir, xlsxPath], {
          timeout: 60000,
        });
        const pdfBuf = await fs.promises.readFile(pdfPath);
        return pdfBuf;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("PDF conversion failed");
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

function formatAttachmentHeader(filename) {
  const ascii = (filename || "download")
    .replace(/[^ -~]/g, "_")
    .replace(/"/g, "'")
    .trim();
  const safeAscii = ascii || "download";
  const encoded = encodeURIComponent(filename || safeAscii);
  return `attachment; filename="${safeAscii}"${encoded !== safeAscii ? `; filename*=UTF-8''${encoded}` : ""}`;
}

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

const KPI_YEAR_KEYS = ["y1", "y2", "y3"];

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeStr(value) {
  if (value == null) return "";
  return String(value);
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

function academicYearWithOffset(academicYear, offset) {
  const raw = String(academicYear || "").trim();
  const off = Number(offset) || 0;
  const range = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (Number.isFinite(start) && Number.isFinite(end)) return `${start + off}-${end + off}`;
  }
  const single = raw.match(/^(\d{4})$/);
  if (single) {
    const start = Number(single[1]);
    if (Number.isFinite(start)) return `${start + off}-${start + off + 1}`;
  }
  return raw || `Y${off + 1}`;
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
    Object.values(items).forEach((row) => {
      convert(row, "unitCost");
      convert(row, "unitCostY2");
      convert(row, "unitCostY3");
    });
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
    `SELECT s.id, s.name, s.status,
            c.name AS country_name, c.code AS country_code
     FROM schools s
     JOIN countries c ON c.id = s.country_id
     WHERE s.id = :id AND s.country_id = :country_id`,
    { id: schoolId, country_id: countryId }
  );
  return s || null;
}

async function assertScenarioInSchool(pool, scenarioId, schoolId) {
  const [[s]] = await pool.query(
    `SELECT id, name, academic_year, status,
            submitted_at, submitted_by,
            reviewed_at, reviewed_by,
            review_note,
            sent_at, sent_by,
            checked_at, checked_by,
            input_currency, local_currency_code, fx_usd_to_local, program_type
     FROM school_scenarios
     WHERE id=:id AND school_id=:school_id`,
    { id: scenarioId, school_id: schoolId }
  );
  return s || null;
}

function isScenarioLocked(scenario) {
  const status = String(scenario?.status || "draft");
  const submittedAt = scenario?.submitted_at != null;
  const sentAt = scenario?.sent_at != null;
  return (
    status === "sent_for_approval" ||
    status === "submitted" ||
    (status === "approved" && sentAt) ||
    (status === "in_review" && submittedAt)
  );
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

    let listParams;
    try {
      listParams = parseListParams(req.query, {
        defaultLimit: 50,
        maxLimit: 200,
        defaultOffset: 0,
        allowedOrderColumns: {
          created_at: "created_at",
          id: "id",
          academic_year: "academic_year",
          status: "status",
        },
        defaultOrder: { column: "created_at", direction: "desc" },
        applyDefaultLimit: false,
      });
    } catch (err) {
      if (err?.status === 400) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    const { limit, offset, fields, order, orderBy, isPagedOrSelective, hasOffsetParam } = listParams;
    // Include checked_at and checked_by in both brief and default column sets so
    // clients can distinguish between manager-level approval and admin-level
    // approval.  The brief set is used when a compact payload is requested.
    const briefColumns = [
      "id",
      "name",
      "academic_year",
      "status",
      "created_at",
      "submitted_at",
      "sent_at",
      "checked_at",
      "checked_by",
      "input_currency",
      "local_currency_code",
      "fx_usd_to_local",
      "program_type",
    ];
    const defaultColumns = [
      "id",
      "name",
      "academic_year",
      "status",
      "submitted_at",
      "sent_at",
      "checked_at",
      "checked_by",
      "reviewed_at",
      "review_note",
      "created_by",
      "created_at",
      "input_currency",
      "local_currency_code",
      "fx_usd_to_local",
      "program_type",
    ];
    const columns = fields === "brief" ? briefColumns : defaultColumns;

    const queryParams = { school_id: schoolId };
    const limitClause = limit != null ? ` LIMIT :limit` : "";
    if (limit != null) queryParams.limit = limit;
    const useOffset = hasOffsetParam || (limit != null && offset != null);
    const offsetClause = useOffset ? ` OFFSET :offset` : "";
    if (useOffset) queryParams.offset = offset;

    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM school_scenarios WHERE school_id=:school_id",
      { school_id: schoolId }
    );
    const total = Number(countRows?.[0]?.total ?? 0);

    const sql = `
      SELECT ${columns.join(", ")}
      FROM school_scenarios
      WHERE school_id=:school_id
      ORDER BY ${orderBy || "created_at DESC"}${limitClause}${offsetClause}
    `;
    const [rows] = await pool.query(sql, queryParams);

    res.setHeader("X-Total-Scenarios", total);
    if (!isPagedOrSelective && fields === "all") {
      return res.json(rows);
    }

    return res.json({
      scenarios: rows,
      total,
      limit: limit ?? null,
      offset: offset ?? 0,
      fields,
      order: order ? `${order.column}:${order.direction}` : null,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /schools/:schoolId/scenarios
 * Body: { name, academicYear }
 */
router.post(
  "/schools/:schoolId/scenarios",
  requirePermission("scenario.create", "write", { schoolIdParam: "schoolId" }),
  async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const {
      name,
      academicYear,
      kademeConfig,
      inputCurrency,
      localCurrencyCode,
      fxUsdToLocal,
      programType: requestProgramType,
    } = req.body || {};
    if (!name || !academicYear) return res.status(400).json({ error: "name and academicYear required" });
    const academicYearNorm = normalizeAcademicYear(academicYear);
    const inputCurrencyValue = String(inputCurrency || "USD").trim().toUpperCase();
    if (!["USD", "LOCAL"].includes(inputCurrencyValue)) {
      return res.status(400).json({ error: "Invalid inputCurrency" });
    }
    const normalizedProgramType = normalizeProgramType(requestProgramType);

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
          (school_id, name, academic_year, input_currency, local_currency_code, fx_usd_to_local, program_type, created_by)
         VALUES
          (:school_id,:name,:year,:input_currency,:local_currency_code,:fx_usd_to_local,:program_type,:created_by)`,
        {
          school_id: schoolId,
          name,
          year: academicYearNorm,
          input_currency: inputCurrencyValue,
          local_currency_code: localCode,
          fx_usd_to_local: fxValue,
          program_type: normalizedProgramType,
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
        programType: normalizedProgramType,

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
              karZarar: 0,
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
        { name: "VAKIF ÇALIŞANI İNDİRİMİ", mode: "percent", value: 0, ratio: 0 },
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

    const emptyNormYears = buildEmptyNormYears(DEFAULT_NORM_MAX_HOURS);
    await pool.query(
      "INSERT INTO scenario_norm_configs (scenario_id, teacher_weekly_max_hours, curriculum_weekly_hours_json, updated_by) VALUES (:scenario_id, :hours, :json, :updated_by)",
      {
        scenario_id: r.insertId,
        hours: DEFAULT_NORM_MAX_HOURS,
        json: JSON.stringify({ years: emptyNormYears }),
        updated_by: req.user.id,
      }
    );

    return res.json({
      id: r.insertId,
      name,
      academic_year: academicYear,
      input_currency: inputCurrencyValue,
      local_currency_code: localCode,
      fx_usd_to_local: fxValue,
      program_type: normalizedProgramType,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
  }
);

/**
 * PATCH /schools/:schoolId/scenarios/:scenarioId
 * Body: { name?, academicYear?, kademeConfig? }
 */
router.patch(
  "/schools/:schoolId/scenarios/:scenarioId",
  requirePermission("scenario.plan_edit", "write", { schoolIdParam: "schoolId" }),
  async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);
    const name = req.body?.name;
    const academicYear = req.body?.academicYear;
    const kademeConfig = req.body?.kademeConfig;
    const hasLocalCurrencyCode = req.body?.localCurrencyCode != null;
    const hasFxUsdToLocal = req.body?.fxUsdToLocal != null;

    const programTypeRequest = req.body?.programType;
    const hasProgramType = programTypeRequest != null;
    const normalizedProgramType = hasProgramType ? normalizeProgramType(programTypeRequest) : null;
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

    // Load previous academic year scenario (same school) for performance comparisons.
    // (No Excel output yet; values are wired for later steps.)
    const prevData = await getPrevScenario({
      pool,
      schoolId,
      academicYear: scenario.academic_year,
    });

    let prevReport = null;
    let prevScenarioMeta = null;
    let prevInputsJson = null;

    if (prevData?.scenarioRow) {
      prevInputsJson = prevData.inputsJson;
      prevScenarioMeta = {
        input_currency: prevData.scenarioRow.input_currency,
        fx_usd_to_local: prevData.scenarioRow.fx_usd_to_local,
        local_currency_code: prevData.scenarioRow.local_currency_code,
        program_type: prevData.scenarioRow.program_type,
      };
    }

    // Prevent modifications once a scenario has been sent for final approval
    // or has been approved by an admin.  Manager‑approved scenarios (status
    // 'approved' but sent_at is NULL) remain editable until they are sent
    // onward via the send‑for‑approval endpoint.
    const isLocked = isScenarioLocked(scenario);
    if (isLocked) {
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
    if (hasProgramType) {
      updates.push("program_type=:program_type");
      params.program_type = normalizedProgramType;
    }
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
      "SELECT id, name, academic_year, input_currency, local_currency_code, fx_usd_to_local, program_type FROM school_scenarios WHERE id=:id",
      { id: scenarioId }
    );

    return res.json({ scenario: updated || null });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
  }
);

/**
 * DELETE /schools/:schoolId/scenarios/:scenarioId
 */
router.delete(
  "/schools/:schoolId/scenarios/:scenarioId",
  requirePermission("scenario.delete", "write", { schoolIdParam: "schoolId" }),
  async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    const locked = isScenarioLocked(scenario);
    if (locked) {
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
  }
);

/**
 * GET /schools/:schoolId/scenarios/:scenarioId/inputs
 */
router.get(
  "/schools/:schoolId/scenarios/:scenarioId/inputs",
  // Require that the user has at least one read or write permission within this
  // school.  Using requireAnySchoolRead avoids forcing a dependency on the
  // page.dashboard permission and allows users with module-specific access
  // to fetch scenario inputs.
  requireAnySchoolRead('schoolId'),
  async (req, res) => {
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
 * GET /schools/:schoolId/scenarios/:scenarioId/context
 *
 * Returns scenario inputs and (if permitted) norm config in a single call.
 */
router.get(
  "/schools/:schoolId/scenarios/:scenarioId/context",
  requireAnySchoolRead("schoolId"),
  async (req, res) => {
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

      let norm = null;
      let normUpdatedAt = null;
      let canReadNorm = String(req.user.role) === "admin";
      if (!canReadNorm) {
        if (!req._permissions) {
          req._permissions = await getUserPermissions(pool, req.user.id);
        }
        canReadNorm = hasPermission(req._permissions, {
          resource: "page.norm",
          action: "read",
          countryId: req.user.country_id,
          schoolId,
        });
      }
      if (canReadNorm) {
        const normRow = await getNormConfigRowForScenario(pool, schoolId, scenarioId);
        if (normRow) {
          norm = normalizeNormConfigRow(normRow);
          normUpdatedAt = normRow.updated_at ?? null;
        }
      }

      return res.json({
        scenario,
        inputs,
        inputsUpdatedAt: row.updated_at,
        norm,
        normUpdatedAt,
      });
    } catch (e) {
      if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    }
  }
);

/**
 * GET /schools/:schoolId/scenarios/:scenarioId/progress
 */
router.get(
  "/schools/:schoolId/scenarios/:scenarioId/progress",
  requireAnySchoolRead("schoolId"),
  async (req, res) => {
    try {
      const schoolId = Number(req.params.schoolId);
      const scenarioId = Number(req.params.scenarioId);

      const pool = getPool();
      const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
      if (!school) return res.status(404).json({ error: "School not found" });

      const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      const snapshot = await getScenarioProgressSnapshot(pool, {
        schoolId,
        scenarioId,
        countryId: req.user.country_id,
      });

      const inputsMs = snapshot.inputsUpdatedAt ? new Date(snapshot.inputsUpdatedAt).getTime() : 0;
      const normMs = snapshot.normUpdatedAt ? new Date(snapshot.normUpdatedAt).getTime() : 0;
      const configMs = snapshot.configUpdatedAt ? new Date(snapshot.configUpdatedAt).getTime() : 0;
      const calcMs = snapshot.calculatedAt ? new Date(snapshot.calculatedAt).getTime() : 0;
      const lastModifiedMs = Math.max(inputsMs, normMs, configMs, calcMs, 0);
      const lastModified = new Date(lastModifiedMs || Date.now()).toUTCString();
      const pct = snapshot.progress ? snapshot.progress.pct : "";
      const etagValue = crypto
        .createHash("sha1")
        .update(`${scenarioId}:${schoolId}:${inputsMs}:${normMs}:${configMs}:${calcMs}:${pct}`)
        .digest("hex");
      const etag = `"${etagValue}"`;

      // Progress should update immediately after inputs are saved.
      // `no-cache` forces revalidation on each request, while ETag/Last-Modified
      // still make it fast via 304 responses when nothing changed.
      res.setHeader("Cache-Control", "private, no-cache, must-revalidate");
      // Ensure any shared/proxy caches treat the response as user-specific.
      res.setHeader("Vary", "Authorization");
      res.setHeader("Vary", "Authorization");
      res.setHeader("Last-Modified", lastModified);
      res.setHeader("ETag", etag);

      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }

      return res.json({
        scenarioId,
        schoolId,
        progress: snapshot.progress,
        cached: snapshot.cached,
        calculatedAt: snapshot.calculatedAt,
      });
    } catch (e) {
      if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    }
  }
);

/**
 * PUT /schools/:schoolId/scenarios/:scenarioId/inputs
 *
 * Body: { inputs, modifiedPaths }
 *
 * This route saves the provided scenario inputs. For non‑admin users it enforces
 * two constraints:
 *   1. The user must be allowed to access the school (see requireSchoolContextAccess).
 *   2. The user must have appropriate write permissions for each modified input
 *      path.  The client is required to send an array of modifiedPaths when
 *      updating a scenario.  Each path is mapped to one or more resource keys
 *      (page‑level and/or section‑level); the user must have write permission
 *      for at least one of those resources within the scope of their country
 *      and school.  Admins bypass these checks.
 */
router.put(
  "/schools/:schoolId/scenarios/:scenarioId/inputs",
  requireSchoolContextAccess("schoolId"),
  async (req, res) => {
    try {
      const schoolId = Number(req.params.schoolId);
      const scenarioId = Number(req.params.scenarioId);
      // The request body may contain either `modifiedResources` (preferred) or
      // `modifiedPaths` (legacy).  When modifiedResources are provided the
      // backend will validate permissions directly on those resource keys.
      const { inputs, modifiedResources, modifiedPaths } = req.body || {};
      if (!inputs || typeof inputs !== "object") {
        return res.status(400).json({ error: "inputs object is required" });
      }
      // For non-admins, ensure a list of modified resources or paths is provided
      const isAdmin = String(req.user.role) === 'admin';
      // Determine which list of modifications to use.  modifiedResources takes
      // precedence.  If both are empty, non-admins are not allowed to save.
      const resourcesList = Array.isArray(modifiedResources) && modifiedResources.length > 0 ? modifiedResources : null;
      const pathsList = !resourcesList && Array.isArray(modifiedPaths) && modifiedPaths.length > 0 ? modifiedPaths : null;
      if (!isAdmin) {
        if (!resourcesList && !pathsList) {
          return res.status(400).json({ error: "modifiedResources (or legacy modifiedPaths) array is required for non-admin users" });
        }
      }

      const pool = getPool();
      // Validate that the school exists in user's country
      const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
      if (!school) return res.status(404).json({ error: 'School not found' });
      const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      const scenarioLocked = isScenarioLocked(scenario);
      if (scenarioLocked) {
        return res.status(409).json({ error: 'Scenario locked. Awaiting admin review.' });
      }

      // Permission enforcement for non‑admin users
      if (!isAdmin) {
        // Load permissions if not already on request
        if (!req._permissions) {
          req._permissions = await getUserPermissions(pool, req.user.id);
        }
        const countryId = req.user.country_id;
        const schoolIdScoped = schoolId;
        // If modifiedResources are provided, validate them directly
        if (resourcesList) {
          for (const rawResource of resourcesList) {
            const resKey = String(rawResource || '').trim();
            if (!resKey) continue;
            // Support wildcard suffix '.*' by stripping it for checking
            let baseKey = resKey;
            if (resKey.endsWith('.*')) {
              baseKey = resKey.slice(0, -2);
            }
            // Build candidate resource keys: the baseKey and its page-level key if it is a section
            const candidates = [];
            candidates.push(baseKey);
            if (baseKey.startsWith('section.')) {
              const parts = baseKey.split('.');
              if (parts.length >= 3) {
                const page = parts[1];
                candidates.push(`page.${page}`);
              }
            }
            let authorized = false;
            for (const candidate of candidates) {
              if (
                hasPermission(req._permissions, {
                  resource: candidate,
                  action: 'write',
                  countryId,
                  schoolId: schoolIdScoped,
                })
              ) {
                authorized = true;
                break;
              }
            }
            if (!authorized) {
              return res.status(403).json({ error: `Missing write permission for resource: ${resKey}` });
            }
          }
        } else if (pathsList) {
          // Fallback: infer permissions from modifiedPaths for backward compatibility
          const toSnakeCase = (str) => {
            return String(str || '')
              .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
              .replace(/\./g, '.')
              .toLowerCase();
          };
          for (const rawPath of pathsList) {
            const path = String(rawPath || '').trim();
            if (!path) continue;
            const tokens = path.split('.');
            let pageKey = null;
            let sectionKey = null;
            if (tokens.length >= 2) {
              if (tokens[0] === 'inputs') {
                pageKey = toSnakeCase(tokens[1]);
                if (tokens.length >= 3) {
                  sectionKey = toSnakeCase(tokens[2]);
                }
              } else {
                pageKey = toSnakeCase(tokens[0]);
                sectionKey = tokens[1] ? toSnakeCase(tokens[1]) : null;
              }
            }
            if (pageKey) {
              const pageAliases = {
                grades_years: 'grades_plan',
                grades_current: 'grades_plan',
                grades: 'grades_plan',
              };
              if (Object.prototype.hasOwnProperty.call(pageAliases, pageKey)) {
                pageKey = pageAliases[pageKey];
              }
              if (pageKey === 'grades_plan') {
                sectionKey = 'plan';
              } else if (pageKey === 'kapasite') {
                sectionKey = 'caps';
              }
            }
            const candidates = [];
            if (pageKey) candidates.push(`page.${pageKey}`);
            if (pageKey && sectionKey) candidates.push(`section.${pageKey}.${sectionKey}`);
            let authorized = false;
            for (const resource of candidates) {
              if (
                hasPermission(req._permissions, {
                  resource,
                  action: 'write',
                  countryId,
                  schoolId: schoolIdScoped,
                })
              ) {
                authorized = true;
                break;
              }
            }
            if (!authorized) {
              return res.status(403).json({ error: `Missing write permission for modified path: ${path}` });
            }
          }
        }
      }

      // Save inputs
      await pool.query(
        'UPDATE scenario_inputs SET inputs_json=:json, updated_by=:u WHERE scenario_id=:id',
        { json: JSON.stringify(inputs), u: req.user.id, id: scenarioId }
      );

      // Automatically revert work items to in_progress when principals or HR
      // modify their inputs.  Only consider non-admin users and when a list
      // of modified resources or paths is provided.
      if (!isAdmin) {
        const workEntries = [];
        // Helper to record a revert entry for a given resource key
        const addEntry = (resKey) => {
          if (!resKey) return;
          // Normalize: strip wildcard
          const base = resKey.endsWith('.*') ? resKey.slice(0, -2) : resKey;
          if (base.startsWith('page.')) {
            const parts = base.split('.');
            if (parts.length >= 2) {
              const page = parts[1];
              if (page === 'temel_bilgiler' || page === 'kapasite') {
                workEntries.push({ resource: base, workId: page });
              }
            }
            return;
          }
          if (!base.startsWith('section.')) return;
          const parts = base.split('.');
          if (parts.length < 2) return;
          const page = parts[1];
          let workId = null;
          if (page === 'temel_bilgiler') {
            workId = 'temel_bilgiler';
          } else if (page === 'kapasite') {
            workId = 'kapasite';
          } else if (page === 'discounts') {
            // Discounts live under the Giderler module in the workflow
            workId = 'giderler.isletme';
          } else if (parts.length >= 3) {
            workId = `${page}.${parts.slice(2).join('.')}`;
          } else {
            workId = page;
          }
          if (!workId) return;
          workEntries.push({ resource: base, workId });
        };
        if (resourcesList) {
          for (const rawRes of resourcesList) {
            const rk = String(rawRes || '').trim();
            if (!rk) continue;
            addEntry(rk);
          }
        } else if (pathsList) {
          // Derive resources from modified paths (legacy support)
          const toSnakeCase = (str) => {
            return String(str || '')
              .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
              .replace(/\./g, '.')
              .toLowerCase();
          };
          for (const rawPath of pathsList) {
            const pth = String(rawPath || '').trim();
            if (!pth) continue;
            const tokens = pth.split('.');
            let pageKey = null;
            let sectionKey = null;
            if (tokens.length >= 2) {
              if (tokens[0] === 'inputs') {
                pageKey = toSnakeCase(tokens[1]);
                if (tokens.length >= 3) {
                  sectionKey = toSnakeCase(tokens[2]);
                }
              } else {
                pageKey = toSnakeCase(tokens[0]);
                sectionKey = tokens[1] ? toSnakeCase(tokens[1]) : null;
              }
            }
            if (pageKey && sectionKey) {
              addEntry(`section.${pageKey}.${sectionKey}`);
            }
          }
        }
        if (workEntries.length > 0) {
          // Perform the updates in a loop.  We cannot batch because of
          // ON DUPLICATE KEY constraints referencing variables.
          for (const { resource: resKey, workId: wid } of workEntries) {
            await pool.query(
              `INSERT INTO scenario_work_items
                (scenario_id, work_id, resource, state, updated_by, updated_at, submitted_at, reviewed_at, manager_comment)
               VALUES
                (:sid, :wid, :res, 'in_progress', :uid, CURRENT_TIMESTAMP, NULL, NULL, NULL)
               ON DUPLICATE KEY UPDATE
                resource=VALUES(resource),
                state='in_progress',
                updated_by=VALUES(updated_by),
                updated_at=CURRENT_TIMESTAMP,
                -- Do not reset submitted_at; leave it so managers know when the prior submission occurred
                manager_comment=NULL`,
              {
                sid: scenarioId,
                wid: wid,
                res: resKey.endsWith('.*') ? resKey.slice(0, -2) : resKey,
                uid: req.user.id,
              }
            );
          }

          // After reverting one or more work items to in_progress, recompute
          // the overall scenario workflow status.  This ensures that the
          // scenario status transitions back to 'in_review' if needed.  Any
          // errors during status computation are ignored so that input
          // saving still succeeds.
          try {
            await computeScenarioWorkflowStatus(pool, scenarioId);
          } catch (_) {
            // ignore errors
          }
        }
      }

      try {
        await invalidateScenarioProgress(pool, scenarioId);
      } catch (_) {
        // ignore cache invalidation failures
      }

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Server error', details: String(e?.message || e) });
    }
  }
);

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

    const normRow = await getNormConfigRowForScenario(pool, schoolId, scenarioId);
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
 * This legacy endpoint submits a scenario to the manager.  It now
 * functions identically to the new /send-to-manager route and sets
 * the scenario status to 'in_review'.  The name and action are
 * retained for backward compatibility.
 */
async function submitScenarioToManager(req, res) {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    const status = scenario.status || 'draft';
    // Only draft or revision_requested scenarios may be sent to the manager
    if (!['draft', 'revision_requested'].includes(status)) {
      return res.status(409).json({ error: 'Scenario already submitted.' });
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
    const normRow = await getNormConfigRowForScenario(pool, schoolId, scenarioId);
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
       SET status='in_review',
           submitted_at=CURRENT_TIMESTAMP,
           submitted_by=:u,
           reviewed_at=NULL,
           reviewed_by=NULL,
           review_note=NULL,
           -- Clear sent_at/sent_by to indicate this is a new submission
           sent_at=NULL,
           sent_by=NULL,
           -- Clear checked_at/checked_by when resubmitting to start a new review cycle
           checked_at=NULL,
           checked_by=NULL,
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
      `SELECT id, name, academic_year, status, submitted_at, submitted_by,
              reviewed_at, reviewed_by, review_note,
              sent_at, sent_by,
              checked_at, checked_by,
              input_currency, local_currency_code, fx_usd_to_local, program_type
       FROM school_scenarios WHERE id=:id`,
      { id: scenarioId }
    );

    return res.json({ scenario: updated || null });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message || 'Invalid inputs' });
    return res.status(500).json({ error: 'Server error', details: String(e?.message || e) });
  }
}

// Legacy submit endpoint – forwards to submitScenarioToManager
router.post(
  '/schools/:schoolId/scenarios/:scenarioId/submit',
  requirePermission("scenario.submit", "write", { schoolIdParam: "schoolId" }),
  submitScenarioToManager
);

// New route name for sending a scenario to the manager
router.post(
  '/schools/:schoolId/scenarios/:scenarioId/send-to-manager',
  requirePermission("scenario.submit", "write", { schoolIdParam: "schoolId" }),
  submitScenarioToManager
);

/**
 * GET /schools/:schoolId/scenarios/:scenarioId/work-items
 *
 * Returns a list of work items for the given scenario.  Each work item
 * represents a page or section that can be individually submitted for
 * manager review.  The caller must have access to the school context.
 */
router.get(
  '/schools/:schoolId/scenarios/:scenarioId/work-items',
  requireSchoolContextAccess('schoolId'),
  async (req, res) => {
    try {
      const schoolId = Number(req.params.schoolId);
      const scenarioId = Number(req.params.scenarioId);
      const pool = getPool();
      const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
      if (!school) return res.status(404).json({ error: 'School not found' });
      const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      const [rows] = await pool.query(
        `SELECT work_id, resource, state, updated_by, updated_at, submitted_at, reviewed_at, manager_comment
         FROM scenario_work_items
         WHERE scenario_id=:sid
         ORDER BY work_id ASC`,
        { sid: scenarioId }
      );
      const requiredWorkIds = await getRequiredWorkIdsForScenario(pool, scenarioId);
      return res.json({ workItems: rows, requiredWorkIds });
    } catch (e) {
      return res.status(500).json({ error: 'Server error', details: String(e?.message || e) });
    }
  }
);

/**
 * POST /schools/:schoolId/scenarios/:scenarioId/work-items/:workId/submit
 *
 * Marks a specific work item (module) as submitted by principals or HR.
 * The caller must have write permission on the corresponding section
 * resource.  If the work item does not exist it will be created.  The
 * state will be set to 'submitted', submitted_at will be set, and
 * reviewed_at/manager_comment will be cleared.  The scenario itself is
 * not transitioned; that occurs when the manager sends the scenario for
 * approval.
 */
router.post(
  '/schools/:schoolId/scenarios/:scenarioId/work-items/:workId/submit',
  requireSchoolContextAccess('schoolId'),
  async (req, res) => {
    try {
      const schoolId = Number(req.params.schoolId);
      const scenarioId = Number(req.params.scenarioId);
      const workIdRaw = String(req.params.workId || '').trim();
      if (!workIdRaw) {
        return res.status(400).json({ error: 'Invalid workId' });
      }
      const pool = getPool();
      const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
      if (!school) return res.status(404).json({ error: 'School not found' });
      const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      // Disallow submission once scenario is locked for admin review
      const locked = isScenarioLocked(scenario);
      if (locked) {
        return res.status(409).json({ error: 'Scenario locked. Awaiting admin review.' });
      }
      // Determine the resource string and workId.  Allow clients to specify
      // resource in the body; fall back to section.<workId>.
      let resource = null;
      if (req.body && typeof req.body.resource === 'string' && req.body.resource.trim()) {
        resource = String(req.body.resource).trim();
      } else {
        resource = `section.${workIdRaw}`;
      }
      // Normalize the resource by removing a trailing wildcard
      let baseResource = resource.endsWith('.*') ? resource.slice(0, -2) : resource;
      // Extract workId from baseResource if possible
      let workId = workIdRaw;
      if (baseResource.startsWith('section.')) {
        const parts = baseResource.split('.');
        // parts[0] = 'section', parts[1] = page, parts[2] = section
        if (parts.length >= 3) {
          workId = `${parts[1]}.${parts.slice(2).join('.')}`;
        } else if (parts.length === 2) {
          workId = parts[1];
        }
      }
      // Permission check: user must have write permission on either the
      // specific section resource or its page-level parent.  Admins
      // bypass the check via hasPermission logic.
      const isAdmin = String(req.user.role) === 'admin';
      if (!isAdmin) {
        // Load permissions if not already present
        if (!req._permissions) {
          req._permissions = await getUserPermissions(pool, req.user.id);
        }
        const countryId = req.user.country_id;
        const schoolIdScoped = schoolId;
        const candidates = [];
        candidates.push(baseResource);
        if (baseResource.startsWith('section.')) {
          const parts = baseResource.split('.');
          if (parts.length >= 2) {
            const page = parts[1];
            candidates.push(`page.${page}`);
          }
        }
        let ok = false;
        for (const cand of candidates) {
          if (
            hasPermission(req._permissions, {
              resource: cand,
              action: 'write',
              countryId,
              schoolId: schoolIdScoped,
            })
          ) {
            ok = true;
            break;
          }
        }
        if (!ok) {
          return res.status(403).json({ error: `Missing write permission for resource: ${baseResource}` });
        }
      }
      // Upsert the work item
      await pool.query(
        `INSERT INTO scenario_work_items
          (scenario_id, work_id, resource, state, updated_by, updated_at, submitted_at, reviewed_at, manager_comment)
         VALUES
          (:sid, :work_id, :resource, 'submitted', :uid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL)
         ON DUPLICATE KEY UPDATE
          resource=VALUES(resource),
          state='submitted',
          updated_by=VALUES(updated_by),
          updated_at=CURRENT_TIMESTAMP,
          submitted_at=CURRENT_TIMESTAMP,
          reviewed_at=NULL,
          manager_comment=NULL`,
        {
          sid: scenarioId,
          work_id: workId,
          resource: baseResource,
          uid: req.user.id,
        }
      );
      const [[updated]] = await pool.query(
        `SELECT work_id, resource, state, updated_by, updated_at, submitted_at, reviewed_at, manager_comment
         FROM scenario_work_items
         WHERE scenario_id=:sid AND work_id=:wid`,
        { sid: scenarioId, wid: workId }
      );

      // Recompute the scenario workflow status based on required work items.  The helper
      // updates the scenario record when necessary.  Errors are ignored here so that
      // submission can still proceed even if the status update fails.
      try {
        await computeScenarioWorkflowStatus(pool, scenarioId);
      } catch (_) {
        // ignore
      }
      return res.json({ workItem: updated || null });
    } catch (e) {
      return res.status(500).json({ error: 'Server error', details: String(e?.message || e) });
    }
  }
);

/**
 * POST /schools/:schoolId/scenarios/:scenarioId/work-items/:workId/review
 *
 * Managers or accountants use this endpoint to approve or request
 * revisions on individual work items.  Passing action='approve' sets
 * the work item state to 'approved'; action='revise' sets it to
 * 'needs_revision' and updates the scenario status to 'revision_requested'.
 * When approving an item, if all work items for the scenario are
 * approved, the scenario status is set to 'approved' to indicate the
 * manager has finished their review.  The optional comment is stored
 * on the work item for audit purposes.
 */
router.post(
  '/schools/:schoolId/scenarios/:scenarioId/work-items/:workId/review',
  requireSchoolContextAccess('schoolId'),
  async (req, res) => {
    try {
      const schoolId = Number(req.params.schoolId);
      const scenarioId = Number(req.params.scenarioId);
      const workId = String(req.params.workId || '').trim();
      const { action, comment } = req.body || {};
      const act = String(action || '').trim().toLowerCase();
      if (!['approve', 'revise'].includes(act)) {
        return res.status(400).json({ error: 'Invalid action' });
      }
      const pool = getPool();
      const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
      if (!school) return res.status(404).json({ error: 'School not found' });
      const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      // Reviewer access check: allow managers, accountants, admins, or users with
      // page.manage_permissions read/write permission.  Admin users bypass checks.
      try {
        const role = String(req.user?.role || '');
        let canReview = false;
        if (['admin', 'manager', 'accountant'].includes(role)) {
          canReview = true;
        } else {
          // Non-standard roles: load permissions and check for manage_permissions
          if (!req._permissions) {
            req._permissions = await getUserPermissions(pool, req.user.id);
          }
          const perms = Array.isArray(req._permissions) ? req._permissions : [];
          for (const perm of perms) {
            if (
              String(perm.resource) === 'page.manage_permissions' &&
              (String(perm.action) === 'read' || String(perm.action) === 'write')
            ) {
              // Scope checks: manager permission may be scoped to a country or school.
              const countryId = req.user?.country_id ?? null;
              const permCountry = perm.scope_country_id != null ? Number(perm.scope_country_id) : null;
              if (permCountry != null && countryId != null && Number(permCountry) !== Number(countryId)) {
                continue;
              }
              // Only consider global or same-country permission
              canReview = true;
              break;
            }
          }
        }
        if (!canReview) {
          return res.status(403).json({ error: 'Review access denied' });
        }
      } catch (permErr) {
        return res.status(500).json({ error: 'Server error', details: String(permErr?.message || permErr) });
      }

      // Disallow reviewing once scenario is forwarded to admins
      const locked =
        scenario.status === 'sent_for_approval' ||
        (scenario.status === 'approved' && scenario.sent_at != null);
      if (locked) {
        return res.status(409).json({ error: 'Scenario locked. Awaiting admin review.' });
      }
      // Ensure work item exists
      const [[row]] = await pool.query(
        `SELECT work_id, resource, state FROM scenario_work_items WHERE scenario_id=:sid AND work_id=:wid`,
        { sid: scenarioId, wid: workId }
      );
      if (!row) {
        return res.status(404).json({ error: 'Work item not found' });
      }
      // Determine next state.  Approve sets the state to 'approved'; revise sets it to 'needs_revision'.
      let nextState = row.state;
      if (act === 'approve') {
        nextState = 'approved';
      } else {
        nextState = 'needs_revision';
      }
      // Update the work item
      await pool.query(
        `UPDATE scenario_work_items
         SET state=:state,
             updated_by=:uid,
             updated_at=CURRENT_TIMESTAMP,
             reviewed_at=CURRENT_TIMESTAMP,
             manager_comment=:comment
         WHERE scenario_id=:sid AND work_id=:wid`,
        {
          state: nextState,
          uid: req.user.id,
          comment: comment && String(comment).trim() ? String(comment).trim() : null,
          sid: scenarioId,
          wid: workId,
        }
      );
      // Recompute the scenario workflow status.  This helper examines only
      // required work items and updates the scenario status accordingly.
      try {
        await computeScenarioWorkflowStatus(pool, scenarioId);
      } catch (_) {
        // ignore compute errors
      }

      // After recomputing the workflow status, check if the scenario has
      // transitioned to a manager-approved state.  A scenario is considered
      // manager-approved ("Kontrol edildi") when its status is 'approved',
      // it has not yet been forwarded to administrators (sent_at is NULL),
      // and it has not already been marked as checked.  If these conditions
      // are met, record the current timestamp and reviewer as the check.
      try {
        const [[sc2]] = await pool.query(
          `SELECT status, sent_at, checked_at FROM school_scenarios WHERE id=:sid`,
          { sid: scenarioId }
        );
        if (sc2 && sc2.status === 'approved' && sc2.sent_at == null && sc2.checked_at == null) {
          await pool.query(
            `UPDATE school_scenarios
               SET checked_at=CURRENT_TIMESTAMP,
                   checked_by=:uid
             WHERE id=:sid`,
            { uid: req.user.id, sid: scenarioId }
          );
        }
      } catch (_) {
        // ignore errors while setting checked_at/checked_by
      }
      const [[updatedItem]] = await pool.query(
        `SELECT work_id, resource, state, updated_by, updated_at, submitted_at, reviewed_at, manager_comment
         FROM scenario_work_items WHERE scenario_id=:sid AND work_id=:wid`,
        { sid: scenarioId, wid: workId }
      );
      // Also return the updated scenario status
      const [[updatedScenario]] = await pool.query(
        `SELECT id, status, sent_at, sent_by, checked_at, checked_by, reviewed_at, reviewed_by, submitted_at, submitted_by
         FROM school_scenarios WHERE id=:sid`,
        { sid: scenarioId }
      );
      return res.json({ workItem: updatedItem || null, scenario: updatedScenario || null });
    } catch (e) {
      return res.status(500).json({ error: 'Server error', details: String(e?.message || e) });
    }
  }
);

/**
 * POST /schools/:schoolId/scenarios/:scenarioId/send-for-approval
 *
 * Managers use this endpoint to forward a manager‑approved scenario to
 * administrators for final approval.  The scenario must currently be
 * marked as 'approved' with all work items approved.  The call
 * transitions the status to 'sent_for_approval', records the sent
 * timestamp and actor, and locks further editing until an admin
 * reviews the scenario.  If the scenario is not manager‑approved or
 * if any work items remain unapproved, a 409 error is returned.
 */
router.post(
  '/schools/:schoolId/scenarios/:scenarioId/send-for-approval',
  requireSchoolContextAccess('schoolId'),
  requireRole(['manager', 'accountant']),
  async (req, res) => {
    try {
      const schoolId = Number(req.params.schoolId);
      const scenarioId = Number(req.params.scenarioId);
      const pool = getPool();
      const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
      if (!school) return res.status(404).json({ error: 'School not found' });
      const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      // Scenario must be manager‑approved and not yet sent
      if (scenario.sent_at != null) {
        return res.status(409).json({ error: 'Scenario is not ready to send for approval' });
      }
      // Recompute the scenario workflow status prior to sending.  This ensures
      // the scenario.status field reflects the latest required work item states.
      try {
        await computeScenarioWorkflowStatus(pool, scenarioId);
      } catch (_) {
        // ignore
      }
      // Reload scenario after recompute
      const [[reloaded]] = await pool.query(
        `SELECT id, status, sent_at FROM school_scenarios WHERE id=:sid`,
        { sid: scenarioId }
      );
      if (!reloaded || reloaded.status !== 'approved') {
        return res.status(409).json({ error: 'Not all required work items are approved' });
      }
      // Update scenario.  Use COALESCE to ensure checked_at/checked_by are set
      // if they were not already recorded.  This preserves existing
      // checked_at timestamps when resending scenarios that were
      // previously approved but not forwarded.
      await pool.query(
        `UPDATE school_scenarios
           SET status='sent_for_approval',
               sent_at=CURRENT_TIMESTAMP,
               sent_by=:uid,
               checked_at=COALESCE(checked_at, CURRENT_TIMESTAMP),
               checked_by=COALESCE(checked_by, :uid)
         WHERE id=:sid`,
        { uid: req.user.id, sid: scenarioId }
      );
      // Log a review event
      await pool.query(
        `INSERT INTO scenario_review_events (scenario_id, action, note, actor_user_id)
         VALUES (:sid, 'submit', NULL, :uid)`,
        { sid: scenarioId, uid: req.user.id }
      );
      const [[updated]] = await pool.query(
        `SELECT id, status, sent_at, sent_by, checked_at, checked_by, reviewed_at, reviewed_by, submitted_at, submitted_by
         FROM school_scenarios WHERE id=:sid`,
        { sid: scenarioId }
      );
      return res.json({ scenario: updated || null });
    } catch (e) {
      return res.status(500).json({ error: 'Server error', details: String(e?.message || e) });
    }
  }
);

/**
 * GET /schools/:schoolId/scenarios/:scenarioId/report
 * Returns cached results if present, else calculates on the fly.
 */
router.get("/schools/:schoolId/scenarios/:scenarioId/report", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioId = Number(req.params.scenarioId);
    const mode = String(req.query?.mode || "original").toLowerCase();
    if (!["original", "distributed"].includes(mode)) {
      return res.status(400).json({ error: "Invalid mode. Use original or distributed." });
    }

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    let resultsPayload = null;
    let resultsString = null;
    let calculatedAt = null;
    let servedFromCache = false;
    let distributionMeta = null;

    if (mode === "distributed") {
      const [[inputsRow]] = await pool.query(
        "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=:id",
        { id: scenarioId }
      );
      if (!inputsRow) return res.status(404).json({ error: "Inputs not found" });

      const normRow = await getNormConfigRowForScenario(pool, schoolId, scenarioId);
      if (!normRow) return res.status(400).json({ error: "Norm config missing for school" });

      const normConfig = normalizeNormConfigRow(normRow);
      const rawInputs = parseInputsJson(inputsRow.inputs_json);

      const latest = await getLatestDistributionForScenario(pool, scenarioId, scenario.academic_year);
      let inputsForOverlay = rawInputs;
      if (latest?.id) {
        const allocRows = await getDistributionAllocationsForTarget(pool, latest.id, scenarioId);
        inputsForOverlay = applyDistributionOverlay(rawInputs, allocRows);
        distributionMeta = {
          distributionId: latest.id,
          basis: latest.basis,
          basisYearKey: latest.basis_year_key,
          createdAt: latest.created_at,
        };
      }

      const inputsForCalc = normalizeInputsToUsd(inputsForOverlay, scenario);
      const results = calculateSchoolFeasibility(inputsForCalc, normConfig);
      const serialized = JSON.stringify(results);
      resultsPayload = results;
      resultsString = serialized;
    } else {
      const [[cache]] = await pool.query(
        "SELECT results_json, calculated_at FROM scenario_results WHERE scenario_id=:id",
        { id: scenarioId }
      );

      calculatedAt = cache?.calculated_at ?? null;

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

        const normRow = await getNormConfigRowForScenario(pool, schoolId, scenarioId);
        if (!normRow) return res.status(400).json({ error: "Norm config missing for school" });

        const normConfig = normalizeNormConfigRow(normRow);
        const inputsForCalc = normalizeInputsToUsd(inputsRow.inputs_json, scenario);
        const results = calculateSchoolFeasibility(inputsForCalc, normConfig);
        const serialized = JSON.stringify(results);
        resultsPayload = results;
        resultsString = serialized;
        calculatedAt = null;
      }
    }

    const etagSource =
      typeof resultsString === "string"
        ? resultsString
        : JSON.stringify(resultsString ?? resultsPayload ?? {});
    const etag = crypto.createHash("sha1").update(etagSource).digest("hex");
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=60");
    const payload = {
      results: resultsPayload,
      cached: servedFromCache,
      calculatedAt,
    };
    if (mode === "distributed" && distributionMeta) {
      payload.distributionMeta = distributionMeta;
    }
    return res.json(payload);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /schools/:schoolId/scenarios/:scenarioId/export-xlsx
 * Excel export (reference format). Add ?format=pdf for PDF output of the RAPOR sheet.
 */
/**
 * GET /schools/:schoolId/scenarios/:scenarioId/export-xlsx
 * Excel export (reference format, now 1/2/3-year columns for Gelirler & Giderler).
 * 2. ve 3. yŽñl, TEMEL BŽøLGŽøLER tabŽñndaki tahmini enflasyon oranlarŽñna gAre tA¬retilir.
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

    // --- previous academic year scenario (same school) ---
    const academicYear = String(scenario.academic_year || "").trim();
    const prevScenarioBundle = await getPrevScenario({ pool, schoolId, academicYear });
    const prevCurrencyMeta = prevScenarioBundle?.scenarioRow
      ? {
        input_currency: prevScenarioBundle.scenarioRow.input_currency,
        fx_usd_to_local: prevScenarioBundle.scenarioRow.fx_usd_to_local,
        local_currency_code: prevScenarioBundle.scenarioRow.local_currency_code,
        program_type: prevScenarioBundle.scenarioRow.program_type,
      }
      : null;

    const reportCurrency = String(req.query?.reportCurrency || "usd").toLowerCase();
    if (!["usd", "local"].includes(reportCurrency)) {
      return res.status(400).json({ error: "Invalid reportCurrency" });
    }

    const mode = String(req.query?.mode || "original").toLowerCase();
    if (!["original", "distributed"].includes(mode)) {
      return res.status(400).json({ error: "Invalid mode. Use original or distributed." });
    }

    const exportFormat = String(req.query?.format || "xlsx").toLowerCase();
    if (!["xlsx", "pdf"].includes(exportFormat)) {
      return res.status(400).json({ error: "Invalid format. Use xlsx or pdf." });
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
    const normRow = await getNormConfigRowForScenario(pool, schoolId, scenarioId);
    if (!normRow) return res.status(400).json({ error: "Norm config missing for school" });

    let inputs = parseInputsJson(inputsRow?.inputs_json);
    const programType = normalizeProgramType(scenario.program_type || inputs?.temelBilgiler?.programType);

    if (mode === "distributed") {
      const latest = await getLatestDistributionForScenario(pool, scenarioId, scenario.academic_year);
      if (latest?.id) {
        const allocRows = await getDistributionAllocationsForTarget(pool, latest.id, scenarioId);
        inputs = applyDistributionOverlay(inputs, allocRows);
      }
    }

    const normConfig = normalizeNormConfigRow(normRow);
    let prevNormConfig = normConfig;
    if (prevScenarioBundle?.scenarioRow?.id) {
      const prevNormRow = await getNormConfigRowForScenario(pool, schoolId, prevScenarioBundle.scenarioRow.id);
      if (prevNormRow) {
        prevNormConfig = normalizeNormConfigRow(prevNormRow);
      }
    }
    const inputsForCalc = normalizeInputsToUsd(inputs, scenario);
    const results = calculateSchoolFeasibility(inputsForCalc, normConfig);

    // --- prevReport (previous year feasibility) ---
    let prevReport = null;
    if (prevScenarioBundle?.scenarioRow && prevScenarioBundle?.inputsJson) {
      try {
        const prevInputsForCalc = normalizeInputsToUsd(prevScenarioBundle.inputsJson, prevScenarioBundle.scenarioRow);
        prevReport = calculateSchoolFeasibility(prevInputsForCalc, prevNormConfig);
      } catch (err) {
        console.warn("[export-xlsx] prevReport compute failed", err);
      }
    }
    if (!prevReport && prevScenarioBundle?.resultsJson) {
      try {
        prevReport =
          typeof prevScenarioBundle.resultsJson === "string"
            ? JSON.parse(prevScenarioBundle.resultsJson)
            : prevScenarioBundle.resultsJson;
      } catch (err) {
        console.warn("[export-xlsx] prevReport parse failed", err);
      }
    }

    // --- Detaylı Rapor model builder (Sheet #1: "Rapor") ---
    const currencyMeta = {
      input_currency: scenario?.input_currency,
      fx_usd_to_local: scenario?.fx_usd_to_local,
      local_currency_code: scenario?.local_currency_code,
      program_type: scenario?.program_type,
    };

    let model = null;
    try {
      model = buildDetailedReportModel({
        school,
        scenario,
        inputs,
        report: results,
        prevReport,
        prevCurrencyMeta,
        reportCurrency,
        currencyMeta,
        programType,
        mode: "detailed",
      });
    } catch (err) {
      console.error("[RaporModel] buildDetailedReportModel failed", err);
    }




    const years = results?.years || { y1: results, y2: null, y3: null };

    const y1 = years?.y1 || null;
    const y2 = years?.y2 || null;
    const y3 = years?.y3 || null;

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
        const levelKeys = Object.keys(hc || {});
        for (const lvl of levelKeys) totalCount += n(hc?.[lvl]?.[role]);
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



    // --- Sheet #1: "RAPOR" ---
    const resolveMediaPath = (filename) => {
      const candidates = [
        path.join(__dirname, "..", "media", filename),
        path.join(__dirname, "..", "..", "media", filename),
        path.join(process.cwd(), "src", "media", filename),
        path.join(process.cwd(), "backend", "src", "media", filename),
      ];
      return candidates.find((p) => fs.existsSync(p)) || null;
    };
    const excelLogoPath = resolveMediaPath("excelLogo.png");
    const maarifLogoPath = resolveMediaPath("maarifLogo.png");
    const excelLogoBase64 = excelLogoPath ? fs.readFileSync(excelLogoPath).toString("base64") : null;
    const maarifLogoBase64 = maarifLogoPath ? fs.readFileSync(maarifLogoPath).toString("base64") : null;
    const wb = new ExcelJS.Workbook();

    const addAoaSheet = (workbook, name, aoa) => {
      const ws = workbook.addWorksheet(name);
      if (!Array.isArray(aoa)) return ws;
      aoa.forEach((row) => ws.addRow(Array.isArray(row) ? row : [row]));
      return ws;
    };
    const raporAoa = buildRaporAoa({ model, reportCurrency, currencyMeta, prevCurrencyMeta });
    const raporWs = addAoaSheet(wb, "RAPOR", raporAoa);
    // ✅ Set column widths (A and B for example)
    raporWs.getColumn(1).width = 16.15; // A
    raporWs.getColumn(2).width = 3.55;  // B
    raporWs.getColumn(3).width = 1.43; // C
    raporWs.getColumn(4).width = 1.86;  // D
    raporWs.getColumn(5).width = 1.86; // E
    raporWs.getColumn(6).width = 2.14;  // F
    raporWs.getColumn(7).width = 2.14; // G
    raporWs.getColumn(8).width = 2.14;  // H
    raporWs.getColumn(9).width = 7.29; // I
    raporWs.getColumn(10).width = 4.86; // J
    raporWs.getColumn(11).width = 5.43; // K
    raporWs.getColumn(12).width = 5.43; // L
    raporWs.getColumn(13).width = 6.29; // M
    raporWs.getColumn(14).width = 3.86; // N
    raporWs.getColumn(15).width = 3.71; // O
    raporWs.getColumn(16).width = 5.86; // P
    raporWs.getColumn(17).width = 2.29; // Q
    raporWs.getColumn(18).width = 8.14; // R
    raporWs.getColumn(19).width = 4.86; // S
    raporWs.getColumn(20).width = 4.14; // T
    raporWs.getColumn(21).width = 4.86; // U
    raporWs.getColumn(22).width = 10.71; // V
    raporWs.getColumn(23).width = 2.43; // W
    raporWs.getColumn(24).width = 2.43; // X
    raporWs.getColumn(25).width = 2.43; // Y
    raporWs.getColumn(26).width = 2.43; // Z
    raporWs.getColumn(27).width = 20.29; // AA

    // Disable grid lines

    raporWs.views = [{ showGridLines: false }];
    if (excelLogoBase64) {
      const imageId = wb.addImage({
        base64: `data:image/png;base64,${excelLogoBase64}`,
        extension: "png",
      });
      raporWs.addImage(imageId, {
        tl: { col: 1, row: 0.2 },
        ext: { width: 566, height: 374 },
      });
    }
    if (maarifLogoBase64) {
      const imageId2 = wb.addImage({
        base64: `data:image/png;base64,${maarifLogoBase64}`,
        extension: "png",
      });
      raporWs.addImage(imageId2, {
        tl: { col: 12, row: 4 },
        ext: { width: 185, height: 191 },
      });
    }

    raporWs.mergeCells("J21:P23");
    const raporTitleCell = raporWs.getCell("J21");
    raporTitleCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    raporTitleCell.font = {
      ...(raporTitleCell.font || {}),
      bold: true,
      size: 20,
      name: "Times New Roman",
    };

    const existing = raporTitleCell.value
      ? String(raporTitleCell.value).toUpperCase()
      : "";
    const countryName = school?.country_name ? String(school.country_name).toUpperCase() : "";
    const countrySuffix = countryName ? `${countryName} OKUL ÜCRETİ` : "OKUL ÜCRETİ";
    raporTitleCell.value = `${existing} ${countrySuffix}`.trim();

    raporWs.getCell("V27").value = "KAMPÜS/OKUL";
    raporWs.getCell("V27").alignment = { vertical: "bottom", horizontal: "right" };
    raporWs.getCell("V27").font = {
      ...(raporWs.getCell("V27").font || {}),
      bold: true,
      size: 14,
      name: "Times New Roman",
    };
    raporWs.getCell("V28").alignment = { vertical: "bottom", horizontal: "right" };
    raporWs.getCell("V28").font = {
      ...(raporWs.getCell("V28").font || {}),
      bold: true,
      size: 14,
      name: "Times New Roman",
    };

    raporWs.getCell("V31").value = "MÜDÜR";
    raporWs.getCell("V31").alignment = { vertical: "bottom", horizontal: "right" };
    raporWs.getCell("V31").font = {
      ...(raporWs.getCell("V31").font || {}),
      bold: true,
      size: 14,
      name: "Times New Roman",
    };
    raporWs.getCell("V32").alignment = { vertical: "bottom", horizontal: "right" };
    raporWs.getCell("V32").font = {
      ...(raporWs.getCell("V32").font || {}),
      bold: true,
      size: 14,
      name: "Times New Roman",
    };

    raporWs.getCell("V35").value = "ÜLKE TEMSİLCİSİ";
    raporWs.getCell("V35").alignment = { vertical: "bottom", horizontal: "right" };
    raporWs.getCell("V35").font = {
      ...(raporWs.getCell("V35").font || {}),
      bold: true,
      size: 14,
      name: "Times New Roman",
    };
    raporWs.getCell("V36").alignment = { vertical: "bottom", horizontal: "right" };
    raporWs.getCell("V36").font = {
      ...(raporWs.getCell("V36").font || {}),
      bold: true,
      size: 14,
      name: "Times New Roman",
    };

    raporWs.getCell("V39").value = "HAZIRLAYAN";
    raporWs.getCell("V39").alignment = { vertical: "bottom", horizontal: "right" };
    raporWs.getCell("V39").font = {
      ...(raporWs.getCell("V39").font || {}),
      bold: true,
      size: 14,
      name: "Times New Roman",
    };
    raporWs.getCell("V40").alignment = { vertical: "bottom", horizontal: "right" };
    raporWs.getCell("V40").font = {
      ...(raporWs.getCell("V40").font || {}),
      bold: true,
      size: 14,
      name: "Times New Roman",
    };

    const dateRow = 58;
    raporWs.mergeCells(`K${dateRow}:P${dateRow}`);

    const exportDate = new Date();
    const cell = raporWs.getCell(`K${dateRow}`);
    cell.value = exportDate.toLocaleDateString("tr-TR");
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.font = { ...(cell.font || {}), bold: true };

    // TABLE A.OKUL EĞTİİM BİLGİLERİ
    raporWs.mergeCells("B59:V60");
    const cellB59 = raporWs.getCell("B59");
    cellB59.alignment = { vertical: "middle", horizontal: "center" };
    cellB59.font = { ...(cellB59.font || {}), bold: true, size: 12, name: "Times New Roman", color: { argb: "FFFFFFFF" } };
    cellB59.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };

    const borderAll = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    for (let row = 59; row <= 60; row += 1) {
      for (let col = 2; col <= 22; col += 1) { // B=2, V=22
        raporWs.getCell(row, col).border = borderAll;
      }
    }

    const GREY = "FFD9D9D9";
    const LIGHT_BLUE = "FFD9E1F2"; // Accent 3, lighter 80%
    const TEXT_BLUE = "FF1F4E79";
    const currencyLabel = showLocal ? localCode : "USD";
    const currencyNumFmt = `#,##0 "${currencyLabel}"`;
    const prevFxRate = Number(prevCurrencyMeta?.fx_usd_to_local || 0);
    const prevLocalCode = prevCurrencyMeta?.local_currency_code;
    const showPerfLocal = reportCurrency === "local" && prevFxRate > 0 && prevLocalCode;
    const perfCurrencyLabel = showPerfLocal ? prevLocalCode : "USD";
    const perfCurrencyNumFmt = `#,##0 "${perfCurrencyLabel}"`;
    const percentNumFmt = "0.00%";
    const countNumFmt = "#,##0";

    const borderThin = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    for (let row = 62; row <= 73; row += 1) {
      // Merge B:O and P:V on each row before styling
      raporWs.mergeCells(row, 2, row, 15);
      raporWs.mergeCells(row, 16, row, 22);

      const fillColor = (row - 62) % 2 === 0 ? GREY : LIGHT_BLUE;
      const ranges = [
        [2, 15],  // B:O
        [16, 22], // P:V
      ];

      for (const [startCol, endCol] of ranges) {
        for (let col = startCol; col <= endCol; col += 1) {
          const cell = raporWs.getCell(row, col);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
          cell.font = { ...(cell.font || {}), color: { argb: TEXT_BLUE }, bold: true };
          cell.alignment = {
            vertical: "middle",
            horizontal: startCol === 16 ? "center" : "left",

          };
          cell.border = borderThin;
        }
      }
    }
    for (let row = 62; row <= 73; row += 1) {
      raporWs.getRow(row).height = 30; // ~40px target
    }

    // TABLE B. OKUL ÜCRETLERİ TABLOSU (YENİ EĞİTİM DÖNEMİ)
    raporWs.mergeCells("B77:V78");
    const cellB77 = raporWs.getCell("B77");
    cellB77.alignment = { vertical: "middle", horizontal: "center" };
    cellB77.font = { ...(cellB77.font || {}), bold: true, size: 12, name: "Times New Roman", color: { argb: "FFFFFFFF" } };
    cellB77.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };

    const borderAllb = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    for (let row = 77; row <= 78; row += 1) {
      for (let col = 2; col <= 22; col += 1) { // B=2, V=22
        raporWs.getCell(row, col).border = borderAllb;
      }
    }


    // Tuition detail rows merged and styled (dynamic row count)
    const mergeBlocks = [
      [2, 8],   // B:H
      [9, 10],  // I:J
      [11, 12], // K:L
      [13, 14], // M:N
      [15, 16], // O:P
      [17, 18], // Q:R
      [19, 20], // S:T
      [21, 22], // U:V
    ];
    const borderBlue = {
      top: { style: "thin", color: { argb: TEXT_BLUE } },
      left: { style: "thin", color: { argb: TEXT_BLUE } },
      bottom: { style: "thin", color: { argb: TEXT_BLUE } },
      right: { style: "thin", color: { argb: TEXT_BLUE } },
    };

    const tuitionHeaderRowIndex = raporAoa.findIndex((row) => Array.isArray(row) && row[1] === "Kademe");
    const tuitionStartRow = tuitionHeaderRowIndex >= 0 ? tuitionHeaderRowIndex + 1 : 80;
    const tuitionDataRowCount = Array.isArray(model.tuitionTable) ? model.tuitionTable.length : 0;
    const tuitionEndRow = tuitionStartRow + Math.max(0, tuitionDataRowCount);
    const tuitionLastRowFill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
    const applyTableBFormats = (rowNum) => {
      const applyFmt = (startCol, endCol, fmt) => {
        for (let col = startCol; col <= endCol; col += 1) {
          raporWs.getCell(rowNum, col).numFmt = fmt;
        }
      };
      applyFmt(9, 10, currencyNumFmt);
      applyFmt(11, 12, currencyNumFmt);
      applyFmt(13, 14, currencyNumFmt);
      applyFmt(15, 16, currencyNumFmt);
      applyFmt(17, 18, currencyNumFmt);
      applyFmt(19, 20, percentNumFmt);
      applyFmt(21, 22, currencyNumFmt);
    };

    for (let row = tuitionStartRow; row <= tuitionEndRow; row += 1) {
      const isHeaderRow = row === tuitionStartRow;
      const isLastRow = row === tuitionEndRow;
      for (const [startCol, endCol] of mergeBlocks) {
        raporWs.mergeCells(row, startCol, row, endCol);
        const anchor = raporWs.getCell(row, startCol);
        anchor.font = { ...(anchor.font || {}), bold: true };
        anchor.alignment = {
          vertical: "middle",
          horizontal: startCol === 2 ? "left" : "center",
          wrapText: isHeaderRow,
        };
        if (isLastRow) {
          anchor.fill = tuitionLastRowFill;
          anchor.font = { ...(anchor.font || {}), color: { argb: TEXT_BLUE }, bold: true };
        }
        for (let col = startCol; col <= endCol; col += 1) {
          const cell = raporWs.getCell(row, col);
          cell.border = borderBlue;
          if (isHeaderRow) {
            cell.alignment = { ...(cell.alignment || {}), wrapText: true, vertical: "middle", horizontal: startCol === 2 ? "left" : "center" };
          }
          if (isLastRow) {
            cell.fill = tuitionLastRowFill;
            cell.font = { ...(cell.font || {}), color: { argb: TEXT_BLUE } };
          }
        }
      }
      if (!isHeaderRow) {
        applyTableBFormats(row);
      }
    }
    for (let row = tuitionStartRow; row <= tuitionEndRow; row += 1) {
      raporWs.getRow(row).height = 30; // ~40px target for Table B header rows
    }

    let raporRowOffset = 0;
    const pdfPageBreaks = {
      tableA: 59,
      capacity: null,
      uncollectable: null,
      localRegulation: null,
      currentFee: null,
    };

    // TABLE C. OKUL UCRETI HESAPLAMA PARAMETRELERI (styled, dynamic rows)
    const paramTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C. OKUL")
    );
    if (paramTitleIndex >= 0) {
      const paramTitleRow = paramTitleIndex + 1; // 1-based
      const paramHeaderRow = paramTitleRow + 1;
      const paramBlankRow = paramHeaderRow + 1; // intentional blank line after header
      const parameters = Array.isArray(model.parameters) ? model.parameters : [];
      const inflationYearsRaw = Array.isArray(model.parametersMeta?.inflationYears)
        ? model.parametersMeta.inflationYears
        : [];
      const inflationBaseYear = Number(model.parametersMeta?.inflationBaseYear);
      const defaultInflYears = Number.isFinite(inflationBaseYear)
        ? [inflationBaseYear - 3, inflationBaseYear - 2, inflationBaseYear - 1]
        : [null, null, null];
      const inflationYears = [0, 1, 2].map((idx) => {
        const item = inflationYearsRaw[idx] || {};
        return {
          year: item?.year ?? defaultInflYears[idx],
          value: item?.value ?? null,
        };
      });

      const toNumberOrNull = (v) => {
        const nVal = Number(v);
        return Number.isFinite(nVal) ? nVal : null;
      };
      const formatParamValue = (row) => {
        const valueType = String(row?.valueType || "").toLowerCase();
        const raw = row?.value;
        if (valueType === "currency") return money(raw);
        if (valueType === "percent") return toNumberOrNull(raw) ?? raw ?? null;
        const num = toNumberOrNull(raw);
        return num ?? (raw ?? null);
      };
      const normalizeParamLabel = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
      const paramCurrencyLabels = new Set([
        "gelir planlamasi",
        "gider planlamasi",
        "gelir - gider farki",
        "burs ve indirim giderleri (fizibilite-g71)",
        "ogrenci basina maliyet (tum giderler (parametre 4 / planlanan ogrenci sayisi))",
        "mevcut egitim sezonu ucreti (ortalama)",
        "nihai ucret",
      ]);
      const paramPercentLabels = new Set([
        "planlanan donem kapasite kullanim orani (%)",
        "tahsil edilemeyecek gelirler (onceki donemin tahsil edilemeyen yuzdelik rakami)",
        "giderlerin sapma yuzdeligi (%... olarak hesaplanabilir)",
      ]);
      const resolveParamNumFmt = (param) => {
        const valueType = String(param?.valueType || "").toLowerCase();
        const label = normalizeParamLabel(param?.desc);
        if (paramPercentLabels.has(label) || valueType === "percent") return percentNumFmt;
        if (paramCurrencyLabels.has(label) || valueType === "currency") return currencyNumFmt;
        if (valueType === "number") return countNumFmt;
        return null;
      };

      const findInflationIndex = parameters.findIndex((p) =>
        String(p?.desc || "").toLowerCase().includes("yerel mevzuatta uygunluk")
      );

      // Insert rows to keep the blank header spacer and inflation block from overlapping later sections.
      raporWs.spliceRows(paramHeaderRow + 1, 0, []);
      raporRowOffset += 1;
      if (findInflationIndex >= 0) {
        const inflationInsertRow = paramHeaderRow + 2 + findInflationIndex + 1;
        raporWs.spliceRows(inflationInsertRow, 0, [], []);
        raporRowOffset += 2;
      }

      // clear old header+rows (columns A-V) before redrawing
      const inflationExtraRows = findInflationIndex >= 0 ? 2 : 0;
      const paramTotalRows = parameters.length + inflationExtraRows;
      const clearThroughRow = paramHeaderRow + 1 + Math.max(0, paramTotalRows);
      for (let row = paramHeaderRow; row <= clearThroughRow; row += 1) {
        for (let col = 1; col <= 22; col += 1) {
          const cell = raporWs.getCell(row, col);
          cell.value = null;
          cell.border = undefined;
          cell.fill = undefined;
        }
      }

      // Section header merged B:V
      const existingParamTitle = raporWs.getCell(paramTitleRow, 1).value;
      raporWs.mergeCells(paramTitleRow, 2, paramTitleRow, 22);
      const paramTitleCell = raporWs.getCell(paramTitleRow, 2);
      paramTitleCell.value = existingParamTitle || paramTitleCell.value || "C. OKUL UCRETI HESAPLAMA PARAMETRELERI";
      raporWs.getCell(paramTitleRow, 1).value = null;
      paramTitleCell.alignment = { vertical: "middle", horizontal: "center" };
      paramTitleCell.font = {
        ...(paramTitleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      paramTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(paramTitleRow, col).border = borderAllb;
      }

      // Column headers: Parametre (B:T) and Veri (U:V)
      raporWs.mergeCells(paramHeaderRow, 2, paramHeaderRow, 20);
      raporWs.mergeCells(paramHeaderRow, 21, paramHeaderRow, 22);
      const paramHeaderCell = raporWs.getCell(paramHeaderRow, 2);
      paramHeaderCell.value = "Parametre";
      paramHeaderCell.font = { ...(paramHeaderCell.font || {}), bold: true, color: { argb: TEXT_BLUE } };
      paramHeaderCell.alignment = { vertical: "middle", horizontal: "left" };
      const veriHeaderCell = raporWs.getCell(paramHeaderRow, 21);
      veriHeaderCell.value = "Veri";
      veriHeaderCell.font = { ...(veriHeaderCell.font || {}), bold: true, color: { argb: TEXT_BLUE } };
      veriHeaderCell.alignment = { vertical: "middle", horizontal: "center" };
      for (let col = 2; col <= 22; col += 1) {
        const cell = raporWs.getCell(paramHeaderRow, col);
        cell.border = borderBlue;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
      }

      // Blank row after headers
      for (let col = 2; col <= 22; col += 1) {
        const cell = raporWs.getCell(paramBlankRow, col);
        cell.value = null;
        cell.border = undefined;
        cell.fill = undefined;
      }

      const renderBorders = (rowNum, startCol, endCol) => {
        for (let col = startCol; col <= endCol; col += 1) {
          raporWs.getCell(rowNum, col).border = borderBlue;
        }
      };

      const renderParamRow = (rowNum, param, opts = {}) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 3);
        raporWs.mergeCells(rowNum, 4, rowNum, 20);
        raporWs.mergeCells(rowNum, 21, rowNum, 22);

        const noCell = raporWs.getCell(rowNum, 2);
        const descCell = raporWs.getCell(rowNum, 4);
        const dataCell = raporWs.getCell(rowNum, 21);

        noCell.value = param?.no || "";
        descCell.value = param?.desc || "";
        dataCell.value = opts.valueOverride !== undefined ? opts.valueOverride : formatParamValue(param);

        const isFinal = String(param?.desc || "").toLowerCase().includes("nihai ucret");

        noCell.alignment = { vertical: "middle", horizontal: "center" };
        descCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
        dataCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

        if (isFinal) {
          descCell.font = { ...(descCell.font || {}), bold: true, italic: true };
          dataCell.font = { ...(dataCell.font || {}), bold: true, italic: true };
        }
        const numFmt = resolveParamNumFmt(param);
        if (numFmt) {
          for (let col = 21; col <= 22; col += 1) {
            raporWs.getCell(rowNum, col).numFmt = numFmt;
          }
        }

        renderBorders(rowNum, 2, 3);
        renderBorders(rowNum, 4, 20);
        renderBorders(rowNum, 21, 22);
      };

      const renderInflationRows = (startRow) => {
        const labelRow = startRow;
        const valueRow = startRow + 1;

        // Header row
        raporWs.mergeCells(labelRow, 2, labelRow, 16);
        const labelCell = raporWs.getCell(labelRow, 2);
        labelCell.value = "Son 3 Yilin Resmi Enflasyon Oranlari";
        labelCell.alignment = { vertical: "middle", horizontal: "center" };
        labelCell.font = { ...(labelCell.font || {}), bold: true, italic: true, color: { argb: TEXT_BLUE } };

        const yearBlocks = [
          { range: [17, 18], label: inflationYears[0]?.year },
          { range: [19, 20], label: inflationYears[1]?.year },
          { range: [21, 22], label: inflationYears[2]?.year },
        ];

        yearBlocks.forEach(({ range, label }) => {
          raporWs.mergeCells(labelRow, range[0], labelRow, range[1]);
          const cell = raporWs.getCell(labelRow, range[0]);
          cell.value = label ?? "";
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.font = { ...(cell.font || {}), bold: true, color: { argb: TEXT_BLUE } };
        });

        // Value row
        raporWs.mergeCells(valueRow, 2, valueRow, 16);
        yearBlocks.forEach(({ range }, idx) => {
          raporWs.mergeCells(valueRow, range[0], valueRow, range[1]);
          const cell = raporWs.getCell(valueRow, range[0]);
          const val = inflationYears[idx]?.value;
          cell.value = val == null ? null : val;
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.numFmt = percentNumFmt;
        });

        // Borders for both rows
        [labelRow, valueRow].forEach((rowNum) => {
          renderBorders(rowNum, 2, 22);
        });

        return valueRow;
      };

      let writeRow = paramBlankRow + 1;
      parameters.forEach((param, idx) => {
        if (idx === findInflationIndex) {
          renderParamRow(writeRow, param, { valueOverride: null });
          writeRow += 1;
          writeRow = renderInflationRows(writeRow) + 1;
          return;
        }
        renderParamRow(writeRow, param);
        writeRow += 1;
      });

      for (let row = paramTitleRow; row < writeRow; row += 1) {
        raporWs.getRow(row).height = 24;
      }
    }

    // TABLE C.1 KAPASITE KULLANIMI (styled, 2 blocks side-by-side)
    const capTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C.1")
    );
    if (capTitleIndex >= 0) {
      const capTitleRow = capTitleIndex + 1 + raporRowOffset;
      pdfPageBreaks.capacity = capTitleRow;
      const capTitleValue = raporWs.getCell(capTitleRow, 1).value ?? raporAoa[capTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(capTitleRow, 2, capTitleRow, 22);
      const capTitleCell = raporWs.getCell(capTitleRow, 2);
      capTitleCell.value = capTitleValue;
      raporWs.getCell(capTitleRow, 1).value = null;
      capTitleCell.alignment = { vertical: "middle", horizontal: "center" };
      capTitleCell.font = {
        ...(capTitleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      capTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(capTitleRow, col).border = borderAllb;
      }
      raporWs.getRow(capTitleRow).height = 24;

      const capGroupRow = capTitleRow + 2;
      raporWs.mergeCells(capGroupRow, 2, capGroupRow, 14);
      raporWs.mergeCells(capGroupRow, 15, capGroupRow, 22);
      const leftGroupCell = raporWs.getCell(capGroupRow, 2);
      const rightGroupCell = raporWs.getCell(capGroupRow, 15);
      leftGroupCell.value = "Öğrenci Kapasite Bilgileri";
      rightGroupCell.value = "Sınıf Kapasite Bilgileri";
      leftGroupCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      rightGroupCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      leftGroupCell.font = { ...(leftGroupCell.font || {}), bold: true, color: { argb: TEXT_BLUE } };
      rightGroupCell.font = { ...(rightGroupCell.font || {}), bold: true, color: { argb: TEXT_BLUE } };
      for (let col = 2; col <= 22; col += 1) {
        const cell = raporWs.getCell(capGroupRow, col);
        cell.border = borderBlue;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
      }
      raporWs.getRow(capGroupRow).height = 22;

      const cap = model.capacity || {};
      const capDataStart = capGroupRow + 1;
      const labelAlignment = { vertical: "middle", horizontal: "left", wrapText: true };
      const valueAlignment = { vertical: "middle", horizontal: "center", wrapText: true };
      const toCellValue = (v) => {
        if (v == null || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : v ?? null;
      };
      const percentFormat = (v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0 && n <= 1) return "0.00%";
        return "#,##0.00";
      };
      const leftRows = [
        { label: "Bina Kapasitesi", value: cap.buildingCapacity, format: "#,##0" },
        { label: "Mevcut Öğrenci Sayısı", value: cap.currentStudents, format: "#,##0" },
        { label: "Planlanan Öğrenci Sayısı", value: cap.plannedStudents, format: "#,##0" },
        { label: "Kapasite Kullanım Yüzdeliği", value: cap.plannedUtilization, format: percentFormat(cap.plannedUtilization) },
      ];
      const rightRows = [
        { label: "Kapasiteye Uygun Derslik Sayısı", value: cap.plannedBranches, format: "#,##0" },
        { label: "Mevcut Derslik Sayısı", value: cap.totalBranches, format: "#,##0" },
        { label: "Kullanılan Derslik Sayısı", value: cap.usedBranches, format: "#,##0" },
        { label: "Sınıf Doluluk Oranı (Planlanan)", value: cap.avgStudentsPerClassPlanned, format: "#,##0.00" },
      ];

      const applyRange = (rowNum, startCol, endCol, { alignment, border, numFmt } = {}) => {
        for (let col = startCol; col <= endCol; col += 1) {
          const cell = raporWs.getCell(rowNum, col);
          if (border) cell.border = border;
          if (alignment) cell.alignment = alignment;
          if (numFmt) cell.numFmt = numFmt;
        }
      };
      const applyValueFormat = (rowNum, startCol, endCol, value, format) => {
        if (!format) return;
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        applyRange(rowNum, startCol, endCol, { numFmt: format });
      };

      const rowCount = Math.max(leftRows.length, rightRows.length);
      for (let i = 0; i < rowCount; i += 1) {
        const rowNum = capDataStart + i;
        const left = leftRows[i] || { label: "", value: null, format: null };
        const right = rightRows[i] || { label: "", value: null, format: null };

        raporWs.mergeCells(rowNum, 2, rowNum, 9);
        raporWs.mergeCells(rowNum, 10, rowNum, 14);
        raporWs.mergeCells(rowNum, 15, rowNum, 19);
        raporWs.mergeCells(rowNum, 20, rowNum, 22);

        raporWs.getCell(rowNum, 2).value = left.label || null;
        raporWs.getCell(rowNum, 10).value = toCellValue(left.value);
        raporWs.getCell(rowNum, 15).value = right.label || null;
        raporWs.getCell(rowNum, 20).value = toCellValue(right.value);

        if (i === rowCount - 1) {
          const leftLabelCell = raporWs.getCell(rowNum, 2);
          const rightLabelCell = raporWs.getCell(rowNum, 15);
          leftLabelCell.font = { ...(leftLabelCell.font || {}), size: 9 };
          rightLabelCell.font = { ...(rightLabelCell.font || {}), size: 9 };
        }
        if (i === 0) {
          const rightLabelCell = raporWs.getCell(rowNum, 15);
          rightLabelCell.font = { ...(rightLabelCell.font || {}), size: 8 };
        }

        applyRange(rowNum, 2, 9, { alignment: labelAlignment, border: borderBlue });
        applyRange(rowNum, 10, 14, { alignment: valueAlignment, border: borderBlue });
        applyRange(rowNum, 15, 19, { alignment: labelAlignment, border: borderBlue });
        applyRange(rowNum, 20, 22, { alignment: valueAlignment, border: borderBlue });

        applyValueFormat(rowNum, 10, 14, left.value, left.format);
        applyValueFormat(rowNum, 20, 22, right.value, right.format);

        raporWs.getRow(rowNum).height = 20;
      }
    }

    // TABLE C.2 INSAN KAYNAKLARI (Planlama Tablosu verileri)
    const hrTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C.2")
    );
    if (hrTitleIndex >= 0) {
      const hrTitleRow = hrTitleIndex + 1 + raporRowOffset;
      const hrHeaderRow = hrTitleRow + 1;
      const hrDataCount = Array.isArray(model.hr) ? model.hr.length : 0;
      const hrNoteRow = hrHeaderRow + hrDataCount + 1;

      const hrTitleValue = raporWs.getCell(hrTitleRow, 1).value ?? raporAoa[hrTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(hrTitleRow, 2, hrTitleRow, 22);
      const hrTitleCell = raporWs.getCell(hrTitleRow, 2);
      hrTitleCell.value = hrTitleValue;
      raporWs.getCell(hrTitleRow, 1).value = null;
      hrTitleCell.alignment = { vertical: "middle", horizontal: "center" };
      hrTitleCell.font = {
        ...(hrTitleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      hrTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(hrTitleRow, col).border = borderAllb;
      }
      raporWs.getRow(hrTitleRow).height = 24;

      const labelAlignment = { vertical: "middle", horizontal: "left", wrapText: true };
      const valueAlignment = { vertical: "middle", horizontal: "center", wrapText: true };
      const applyBorders = (rowNum) => {
        for (let col = 2; col <= 22; col += 1) {
          raporWs.getCell(rowNum, col).border = borderAllb;
        }
      };

      raporWs.mergeCells(hrHeaderRow, 2, hrHeaderRow, 14);
      raporWs.mergeCells(hrHeaderRow, 15, hrHeaderRow, 18);
      raporWs.mergeCells(hrHeaderRow, 19, hrHeaderRow, 22);
      raporWs.getCell(hrHeaderRow, 2).alignment = labelAlignment;
      const mevcutHeaderCell = raporWs.getCell(hrHeaderRow, 15);
      const planHeaderCell = raporWs.getCell(hrHeaderRow, 19);
      mevcutHeaderCell.alignment = valueAlignment;
      planHeaderCell.alignment = valueAlignment;
      mevcutHeaderCell.font = { ...(mevcutHeaderCell.font || {}), bold: true };
      planHeaderCell.font = { ...(planHeaderCell.font || {}), bold: true };
      applyBorders(hrHeaderRow);
      raporWs.getRow(hrHeaderRow).height = 20;

      for (let i = 0; i < hrDataCount; i += 1) {
        const rowNum = hrHeaderRow + 1 + i;
        raporWs.mergeCells(rowNum, 2, rowNum, 14);
        raporWs.mergeCells(rowNum, 15, rowNum, 18);
        raporWs.mergeCells(rowNum, 19, rowNum, 22);
        raporWs.getCell(rowNum, 2).alignment = labelAlignment;
        const currentCell = raporWs.getCell(rowNum, 15);
        const plannedCell = raporWs.getCell(rowNum, 19);
        currentCell.alignment = valueAlignment;
        plannedCell.alignment = valueAlignment;
        currentCell.font = { ...(currentCell.font || {}), bold: true };
        plannedCell.font = { ...(plannedCell.font || {}), bold: true };
        applyBorders(rowNum);
        raporWs.getRow(rowNum).height = 20;
      }

      raporWs.mergeCells(hrNoteRow, 2, hrNoteRow, 22);
      const noteCell = raporWs.getCell(hrNoteRow, 2);
      noteCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      noteCell.font = { ...(noteCell.font || {}), italic: true, color: { argb: "FFFF0000" } };
      applyBorders(hrNoteRow);
      raporWs.getRow(hrNoteRow).height = 18;
    }

    // TABLE C.3 GELIRLER (Planlama Excel Tablosu verileri)
    const revenueTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C.3")
    );
    if (revenueTitleIndex >= 0) {
      const revenueTitleRow = revenueTitleIndex + 1 + raporRowOffset;
      const revenueHeaderRow = revenueTitleRow + 1;
      const revenueDataCount = Array.isArray(model.revenues) ? model.revenues.length : 0;
      const revenueTotalRow = revenueHeaderRow + revenueDataCount + 1;
      const revenueNoteRow = revenueTotalRow + 1;

      const revenueTitleValue = raporWs.getCell(revenueTitleRow, 1).value ?? raporAoa[revenueTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(revenueTitleRow, 2, revenueTitleRow, 22);
      const revenueTitleCell = raporWs.getCell(revenueTitleRow, 2);
      revenueTitleCell.value = revenueTitleValue;
      raporWs.getCell(revenueTitleRow, 1).value = null;
      revenueTitleCell.alignment = { vertical: "middle", horizontal: "center" };
      revenueTitleCell.font = {
        ...(revenueTitleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      revenueTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(revenueTitleRow, col).border = borderAllb;
      }
      raporWs.getRow(revenueTitleRow).height = 24;

      const labelAlignment = { vertical: "middle", horizontal: "left", wrapText: true };
      const valueAlignment = { vertical: "middle", horizontal: "center", wrapText: true };
      const amountFormat = perfCurrencyNumFmt;
      const ratioFormat = percentNumFmt;

      const applyRange = (rowNum, startCol, endCol, { alignment, border, numFmt, bold } = {}) => {
        for (let col = startCol; col <= endCol; col += 1) {
          const cell = raporWs.getCell(rowNum, col);
          if (border) cell.border = border;
          if (alignment) cell.alignment = alignment;
          if (numFmt) cell.numFmt = numFmt;
          if (bold) cell.font = { ...(cell.font || {}), bold: true };
        }
      };

      const styleRevenueRow = (rowNum, opts = {}) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 14);
        raporWs.mergeCells(rowNum, 15, rowNum, 20);
        raporWs.mergeCells(rowNum, 21, rowNum, 22);

        applyRange(rowNum, 2, 14, { alignment: labelAlignment, border: borderAllb, bold: opts.bold });
        applyRange(rowNum, 15, 20, {
          alignment: valueAlignment,
          border: borderAllb,
          numFmt: opts.withFormats ? amountFormat : undefined,
          bold: opts.bold,
        });
        applyRange(rowNum, 21, 22, {
          alignment: valueAlignment,
          border: borderAllb,
          numFmt: opts.withFormats ? ratioFormat : undefined,
          bold: opts.bold,
        });
        raporWs.getRow(rowNum).height = 20;
      };

      styleRevenueRow(revenueHeaderRow, { bold: true, withFormats: false });

      for (let i = 0; i < revenueDataCount; i += 1) {
        styleRevenueRow(revenueHeaderRow + 1 + i, { bold: false, withFormats: true });
      }

      styleRevenueRow(revenueTotalRow, { bold: true, withFormats: true });

      raporWs.mergeCells(revenueNoteRow, 2, revenueNoteRow, 22);
      const revenueNoteCell = raporWs.getCell(revenueNoteRow, 2);
      revenueNoteCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      revenueNoteCell.font = { ...(revenueNoteCell.font || {}), size: 9, italic: true, color: { argb: "FFFF0000" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(revenueNoteRow, col).border = borderAllb;
      }
      raporWs.getRow(revenueNoteRow).height = 18;
    }

    // TABLE C.4 GIDERLER (Planlama Excel Tablosu verileri)
    const expenseTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C.4")
    );
    if (expenseTitleIndex >= 0) {
      const expenseTitleRow = expenseTitleIndex + 1 + raporRowOffset;
      const expenseHeaderRow = expenseTitleRow + 1;
      const detailedExpenseRows = Array.isArray(model?.parametersMeta?.detailedExpenses)
        ? model.parametersMeta.detailedExpenses
        : null;
      const expenseRows = detailedExpenseRows
        ? detailedExpenseRows
        : Array.isArray(model.expenses)
          ? model.expenses
          : [];
      const expenseDataCount = expenseRows.length;
      const expenseTotalRow = expenseHeaderRow + expenseDataCount + 1;

      const expenseTitleValue =
        raporWs.getCell(expenseTitleRow, 1).value ?? raporAoa[expenseTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(expenseTitleRow, 2, expenseTitleRow, 22);
      const expenseTitleCell = raporWs.getCell(expenseTitleRow, 2);
      expenseTitleCell.value = expenseTitleValue;
      raporWs.getCell(expenseTitleRow, 1).value = null;
      expenseTitleCell.alignment = { vertical: "middle", horizontal: "center" };
      expenseTitleCell.font = {
        ...(expenseTitleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      expenseTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(expenseTitleRow, col).border = borderAllb;
      }
      raporWs.getRow(expenseTitleRow).height = 24;

      const labelAlignment = { vertical: "middle", horizontal: "left", wrapText: true };
      const valueAlignment = { vertical: "middle", horizontal: "center", wrapText: true };
      const amountFormat = currencyNumFmt;
      const ratioFormat = percentNumFmt;
      const ratioAlertFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };

      const applyRange = (rowNum, startCol, endCol, { alignment, border, numFmt, bold } = {}) => {
        for (let col = startCol; col <= endCol; col += 1) {
          const cell = raporWs.getCell(rowNum, col);
          if (border) cell.border = border;
          if (alignment) cell.alignment = alignment;
          if (numFmt) cell.numFmt = numFmt;
          if (bold) cell.font = { ...(cell.font || {}), bold: true };
        }
      };

      const styleExpenseRow = (rowNum, opts = {}) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 14);
        raporWs.mergeCells(rowNum, 15, rowNum, 20);
        raporWs.mergeCells(rowNum, 21, rowNum, 22);

        applyRange(rowNum, 2, 14, { alignment: labelAlignment, border: borderAllb, bold: opts.bold });
        applyRange(rowNum, 15, 20, {
          alignment: valueAlignment,
          border: borderAllb,
          numFmt: opts.withFormats ? amountFormat : undefined,
          bold: opts.bold,
        });
        applyRange(rowNum, 21, 22, {
          alignment: valueAlignment,
          border: borderAllb,
          numFmt: opts.withFormats ? ratioFormat : undefined,
          bold: opts.bold,
        });
        raporWs.getRow(rowNum).height = 20;
      };

      const toRatioValue = (value) => {
        if (value == null) return null;
        let raw = value;
        if (typeof raw === "object" && raw !== null && "result" in raw) raw = raw.result;
        if (typeof raw === "string") {
          const trimmed = raw.trim();
          if (trimmed.endsWith("%")) {
            const n = Number(trimmed.slice(0, -1));
            return Number.isFinite(n) ? n / 100 : null;
          }
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) return null;
        if (n > 1) return n / 100;
        return n;
      };

      const applyRatioAlert = (rowNum, threshold) => {
        const ratio = toRatioValue(raporWs.getCell(rowNum, 21).value);
        if (ratio != null && ratio > threshold) {
          for (let col = 21; col <= 22; col += 1) {
            raporWs.getCell(rowNum, col).fill = ratioAlertFill;
          }
        }
      };

      styleExpenseRow(expenseHeaderRow, { bold: true, withFormats: false });

      for (let i = 0; i < expenseDataCount; i += 1) {
        styleExpenseRow(expenseHeaderRow + 1 + i, { bold: false, withFormats: true });
      }

      styleExpenseRow(expenseTotalRow, { bold: true, withFormats: true });

      if (expenseDataCount >= 1) {
        applyRatioAlert(expenseHeaderRow + 1, 0.15);
      }
      if (expenseDataCount >= 2) {
        applyRatioAlert(expenseHeaderRow + 2, 0.45);
      }
      if (expenseDataCount >= 10) {
        applyRatioAlert(expenseHeaderRow + 10, 0.08);
      }
      if (expenseDataCount >= 11) {
        applyRatioAlert(expenseHeaderRow + 11, 0.05);
      }
      if (expenseDataCount >= 12) {
        applyRatioAlert(expenseHeaderRow + 12, 0.02);
      }
    }

    // TABLE C.5 TAHSIL EDILEMEYECEK GELIRLER (text block)
    const uncollectableTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C.5")
    );
    if (uncollectableTitleIndex >= 0) {
      const titleRow = uncollectableTitleIndex + 1 + raporRowOffset;
      pdfPageBreaks.uncollectable = titleRow;
      const bodyRow = titleRow + 1;

      const titleValue = raporWs.getCell(titleRow, 1).value ?? raporAoa[uncollectableTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(titleRow, 2, titleRow, 22);
      const titleCell = raporWs.getCell(titleRow, 2);
      titleCell.value = titleValue;
      raporWs.getCell(titleRow, 1).value = null;
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.font = {
        ...(titleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(titleRow, col).border = borderAllb;
      }
      raporWs.getRow(titleRow).height = 24;

      const bodyValue = raporWs.getCell(bodyRow, 1).value ?? "";
      raporWs.mergeCells(bodyRow, 2, bodyRow, 22);
      const bodyCell = raporWs.getCell(bodyRow, 2);
      bodyCell.value = bodyValue;
      raporWs.getCell(bodyRow, 1).value = null;
      bodyCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(bodyRow, col).border = borderAllb;
      }
      raporWs.getRow(bodyRow).height = 36;
    }

    // TABLE C.6 GIDERLERIN SAPMA YUZDELIGI (text block)
    const deviationTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C.6")
    );
    if (deviationTitleIndex >= 0) {
      const titleRow = deviationTitleIndex + 1 + raporRowOffset;
      const bodyRow = titleRow + 1;

      const titleValue = raporWs.getCell(titleRow, 1).value ?? raporAoa[deviationTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(titleRow, 2, titleRow, 22);
      const titleCell = raporWs.getCell(titleRow, 2);
      titleCell.value = titleValue;
      raporWs.getCell(titleRow, 1).value = null;
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.font = {
        ...(titleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(titleRow, col).border = borderAllb;
      }
      raporWs.getRow(titleRow).height = 24;

      const bodyValue = raporWs.getCell(bodyRow, 1).value ?? "";
      raporWs.mergeCells(bodyRow, 2, bodyRow, 22);
      const bodyCell = raporWs.getCell(bodyRow, 2);
      bodyCell.value = bodyValue;
      raporWs.getCell(bodyRow, 1).value = null;
      bodyCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(bodyRow, col).border = borderAllb;
      }
      raporWs.getRow(bodyRow).height = 44;
    }

    // TABLE C.7 BURS VE INDIRIM ORANLARI (Burs ve Indirimler Genelgesi)
    const bursTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C.7")
    );
    if (bursTitleIndex >= 0) {
      const titleRow = bursTitleIndex + 1 + raporRowOffset;
      const bursCount = Array.isArray(model.scholarships) ? model.scholarships.length : 0;
      const indirimCount = Array.isArray(model.discounts) ? model.discounts.length : 0;
      const analysisRows = 4;

      const bursGroupRow = titleRow + 1;
      const bursSubRow = bursGroupRow + 1;
      const bursDataStart = bursSubRow + 1;
      const bursDataEnd = bursDataStart + Math.max(0, bursCount) - 1;
      const bursTotalRow = bursDataEnd + 1;
      const bursSpacerRow = bursTotalRow + 1;
      const bursAnalysisStart = bursSpacerRow + 1;
      const bursAnalysisEnd = bursAnalysisStart + analysisRows - 1;
      const indirimBlockSpacerRow = bursAnalysisEnd + 1;
      const indirimGroupRow = indirimBlockSpacerRow + 1;
      const indirimSubRow = indirimGroupRow + 1;
      const indirimDataStart = indirimSubRow + 1;
      const indirimDataEnd = indirimDataStart + Math.max(0, indirimCount) - 1;
      const indirimTotalRow = indirimDataEnd + 1;
      const indirimAnalysisSpacerRow = indirimTotalRow + 1;
      const indirimAnalysisStart = indirimAnalysisSpacerRow + 1;
      const indirimAnalysisEnd = indirimAnalysisStart + analysisRows - 1;

      const titleValue = raporWs.getCell(titleRow, 1).value ?? raporAoa[bursTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(titleRow, 2, titleRow, 22);
      const titleCell = raporWs.getCell(titleRow, 2);
      titleCell.value = titleValue;
      raporWs.getCell(titleRow, 1).value = null;
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.font = {
        ...(titleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(titleRow, col).border = borderAllb;
      }
      raporWs.getRow(titleRow).height = 24;

      const labelAlignment = { vertical: "middle", horizontal: "left", wrapText: true };
      const centerAlignment = { vertical: "middle", horizontal: "center", wrapText: true };
      const rightAlignment = { vertical: "middle", horizontal: "right", wrapText: true };
      const countFormat = countNumFmt;
      const amountFormat = currencyNumFmt;
      const ratioFormat = percentNumFmt;

      const applyRange = (rowNum, startCol, endCol, { alignment, border, numFmt, bold, fontSize } = {}) => {
        for (let col = startCol; col <= endCol; col += 1) {
          const cell = raporWs.getCell(rowNum, col);
          if (border) cell.border = border;
          if (alignment) cell.alignment = alignment;
          if (numFmt) cell.numFmt = numFmt;
          const fontUpdates = {};
          if (bold) fontUpdates.bold = true;
          if (fontSize) fontUpdates.size = fontSize;
          if (Object.keys(fontUpdates).length) {
            cell.font = { ...(cell.font || {}), ...fontUpdates };
          }
        }
      };

      const styleGroupHeaderRow = (rowNum) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 12);
        raporWs.mergeCells(rowNum, 13, rowNum, 17);
        raporWs.mergeCells(rowNum, 18, rowNum, 22);
        applyRange(rowNum, 2, 12, { alignment: labelAlignment, border: borderAllb, bold: true });
        applyRange(rowNum, 13, 17, {
          alignment: centerAlignment,
          border: borderAllb,
          bold: true,
          fontSize: 9,
        });
        applyRange(rowNum, 18, 22, { alignment: centerAlignment, border: borderAllb, bold: true });
        raporWs.getRow(rowNum).height = 20;
      };

      const styleSubHeaderRow = (rowNum) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 12);
        raporWs.mergeCells(rowNum, 13, rowNum, 17);
        raporWs.mergeCells(rowNum, 18, rowNum, 19);
        raporWs.mergeCells(rowNum, 20, rowNum, 22);
        applyRange(rowNum, 2, 12, { alignment: labelAlignment, border: borderAllb, bold: true });
        applyRange(rowNum, 13, 17, {
          alignment: centerAlignment,
          border: borderAllb,
          bold: true,
          fontSize: 9,
        });
        applyRange(rowNum, 18, 19, { alignment: centerAlignment, border: borderAllb, bold: true });
        applyRange(rowNum, 20, 22, { alignment: centerAlignment, border: borderAllb, bold: true });
        raporWs.getRow(rowNum).height = 20;
      };

      const styleDataRow = (rowNum, { bold } = {}) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 12);
        raporWs.mergeCells(rowNum, 13, rowNum, 17);
        raporWs.mergeCells(rowNum, 18, rowNum, 19);
        raporWs.mergeCells(rowNum, 20, rowNum, 22);
        applyRange(rowNum, 2, 12, { alignment: labelAlignment, border: borderAllb, bold:true, fontSize:9 });
        applyRange(rowNum, 13, 17, {
          alignment: centerAlignment,
          border: borderAllb,
          numFmt: countFormat,
          bold,
          fontSize: 11,
        });
        applyRange(rowNum, 18, 19, {
          alignment: centerAlignment,
          border: borderAllb,
          numFmt: countFormat,
          bold,
        });
        applyRange(rowNum, 20, 22, {
          alignment: centerAlignment,
          border: borderAllb,
          numFmt: amountFormat,
          bold,
        });
        raporWs.getRow(rowNum).height = 20;
      };

      const styleAnalysisRow = (rowNum, { numFmt } = {}) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 20);
        raporWs.mergeCells(rowNum, 21, rowNum, 22);
        applyRange(rowNum, 2, 20, { alignment: centerAlignment, border: borderAllb, bold: true });
        applyRange(rowNum, 21, 22, {
          alignment: rightAlignment,
          border: borderAllb,
          numFmt,
          bold: true,
        });
        raporWs.getRow(rowNum).height = 20;
      };

      styleGroupHeaderRow(bursGroupRow);
      raporWs.getRow(bursGroupRow).height = 26;
      styleSubHeaderRow(bursSubRow);
      if (bursCount > 0) {
        for (let row = bursDataStart; row <= bursDataEnd; row += 1) {
          styleDataRow(row);
        }
      }
      styleDataRow(bursTotalRow, { bold: true });

      const bursAnalysisFormats = [amountFormat, ratioFormat, ratioFormat, ratioFormat];
      for (let i = 0; i < analysisRows; i += 1) {
        styleAnalysisRow(bursAnalysisStart + i, { numFmt: bursAnalysisFormats[i] });
      }

      styleGroupHeaderRow(indirimGroupRow);
      raporWs.getRow(indirimGroupRow).height = 26;
      styleSubHeaderRow(indirimSubRow);
      if (indirimCount > 0) {
        for (let row = indirimDataStart; row <= indirimDataEnd; row += 1) {
          styleDataRow(row);
        }
      }
      styleDataRow(indirimTotalRow, { bold: true });

      const indirimAnalysisFormats = [amountFormat, ratioFormat, ratioFormat, ratioFormat];
      for (let i = 0; i < analysisRows; i += 1) {
        styleAnalysisRow(indirimAnalysisStart + i, { numFmt: indirimAnalysisFormats[i] });
      }
    }

    // TABLE C.8 RAKIP KURUMLARIN ANALIZI (Planlama Excell tablosu verileri)
    const competitorTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C.8")
    );
    if (competitorTitleIndex >= 0) {
      const titleRow = competitorTitleIndex + 1 + raporRowOffset;
      const descriptionRow = titleRow + 1;
      const spacerRow = descriptionRow + 1;
      const headerRow = spacerRow + 1;
      const competitorCount = Array.isArray(model.competitors) ? model.competitors.length : 0;
      const dataStart = headerRow + 1;
      const dataEnd = dataStart + Math.max(0, competitorCount) - 1;

      const titleValue = raporWs.getCell(titleRow, 1).value ?? raporAoa[competitorTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(titleRow, 2, titleRow, 22);
      const titleCell = raporWs.getCell(titleRow, 2);
      titleCell.value = titleValue;
      raporWs.getCell(titleRow, 1).value = null;
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.font = {
        ...(titleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(titleRow, col).border = borderAllb;
      }
      raporWs.getRow(titleRow).height = 24;

      const descriptionValue = raporWs.getCell(descriptionRow, 1).value ?? "";
      raporWs.mergeCells(descriptionRow, 2, descriptionRow, 22);
      const descriptionCell = raporWs.getCell(descriptionRow, 2);
      descriptionCell.value = descriptionValue;
      raporWs.getCell(descriptionRow, 1).value = null;
      descriptionCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      raporWs.getRow(descriptionRow).height = 40;

      const labelAlignment = { vertical: "middle", horizontal: "left", wrapText: true };
      const valueAlignment = { vertical: "middle", horizontal: "center", wrapText: true };
      const amountFormat = currencyNumFmt;

      const applyRange = (rowNum, startCol, endCol, { alignment, border, numFmt, bold } = {}) => {
        for (let col = startCol; col <= endCol; col += 1) {
          const cell = raporWs.getCell(rowNum, col);
          if (border) cell.border = border;
          if (alignment) cell.alignment = alignment;
          if (numFmt) cell.numFmt = numFmt;
          if (bold) cell.font = { ...(cell.font || {}), bold: true };
        }
      };

      const styleHeaderRow = (rowNum) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 8);
        raporWs.mergeCells(rowNum, 9, rowNum, 13);
        raporWs.mergeCells(rowNum, 14, rowNum, 18);
        raporWs.mergeCells(rowNum, 19, rowNum, 22);
        applyRange(rowNum, 2, 8, { alignment: labelAlignment, border: borderAllb, bold: true });
        applyRange(rowNum, 9, 13, { alignment: valueAlignment, border: borderAllb, bold: true });
        applyRange(rowNum, 14, 18, { alignment: valueAlignment, border: borderAllb, bold: true });
        applyRange(rowNum, 19, 22, { alignment: valueAlignment, border: borderAllb, bold: true });
        raporWs.getRow(rowNum).height = 20;
      };

      const styleDataRow = (rowNum) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 8);
        raporWs.mergeCells(rowNum, 9, rowNum, 13);
        raporWs.mergeCells(rowNum, 14, rowNum, 18);
        raporWs.mergeCells(rowNum, 19, rowNum, 22);
        applyRange(rowNum, 2, 8, { alignment: labelAlignment, border: borderAllb });
        applyRange(rowNum, 9, 13, { alignment: valueAlignment, border: borderAllb, numFmt: amountFormat });
        applyRange(rowNum, 14, 18, { alignment: valueAlignment, border: borderAllb, numFmt: amountFormat });
        applyRange(rowNum, 19, 22, { alignment: valueAlignment, border: borderAllb, numFmt: amountFormat });
        raporWs.getRow(rowNum).height = 20;
      };

      styleHeaderRow(headerRow);
      if (competitorCount > 0) {
        for (let row = dataStart; row <= dataEnd; row += 1) {
          styleDataRow(row);
        }
      }
    }

    // TABLE C.9 YEREL MEVZUATTA UYGUNLUK (yasal azami artis)
    const mevzuatTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C.9")
    );
    if (mevzuatTitleIndex >= 0) {
      const titleRow = mevzuatTitleIndex + 1 + raporRowOffset;
      pdfPageBreaks.localRegulation = titleRow;
      const bodyRow = titleRow + 1;

      const titleValue = raporWs.getCell(titleRow, 1).value ?? raporAoa[mevzuatTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(titleRow, 2, titleRow, 22);
      const titleCell = raporWs.getCell(titleRow, 2);
      titleCell.value = titleValue;
      raporWs.getCell(titleRow, 1).value = null;
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.font = {
        ...(titleCell.font || {}),
        bold: true,
        size: 16,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(titleRow, col).border = borderAllb;
      }
      raporWs.getRow(titleRow).height = 24;

      const bodyValue = raporWs.getCell(bodyRow, 1).value ?? "";
      raporWs.mergeCells(bodyRow, 2, bodyRow, 22);
      const bodyCell = raporWs.getCell(bodyRow, 2);
      bodyCell.value = bodyValue;
      raporWs.getCell(bodyRow, 1).value = null;
      bodyCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(bodyRow, col).border = borderAllb;
      }
      raporWs.getRow(bodyRow).height = 44;
    }

    // TABLE C.10 MEVCUT EGITIM SEZONU UCRETI
    const currentFeeTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("C.10")
    );
    if (currentFeeTitleIndex >= 0) {
      const titleRow = currentFeeTitleIndex + 1 + raporRowOffset;
      pdfPageBreaks.currentFee = titleRow;
      const bodyRow = titleRow + 1;
      const noteRow = bodyRow + 1;

      const titleValue = raporWs.getCell(titleRow, 1).value ?? raporAoa[currentFeeTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(titleRow, 2, titleRow, 22);
      const titleCell = raporWs.getCell(titleRow, 2);
      titleCell.value = titleValue;
      raporWs.getCell(titleRow, 1).value = null;
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.font = {
        ...(titleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(titleRow, col).border = borderAllb;
      }
      raporWs.getRow(titleRow).height = 24;

      const bodyValue = raporWs.getCell(bodyRow, 1).value ?? "";
      raporWs.mergeCells(bodyRow, 2, bodyRow, 22);
      const bodyCell = raporWs.getCell(bodyRow, 2);
      bodyCell.value = bodyValue;
      raporWs.getCell(bodyRow, 1).value = null;
      bodyCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(bodyRow, col).border = borderAllb;
      }
      raporWs.getRow(bodyRow).height = 40;

      const noteValue = raporWs.getCell(noteRow, 1).value ?? "";
      raporWs.mergeCells(noteRow, 2, noteRow, 22);
      const noteCell = raporWs.getCell(noteRow, 2);
      noteCell.value = noteValue;
      raporWs.getCell(noteRow, 1).value = null;
      noteCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      noteCell.font = { ...(noteCell.font || {}), color: { argb: "FFFF0000" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(noteRow, col).border = borderAllb;
      }
      raporWs.getRow(noteRow).height = 22;
    }

    // TABLE D. PERFORMANS (Gerceklesen ve Gerceklesmesi Planlanan)
    const perfTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("D.")
    );
    if (perfTitleIndex >= 0) {
      const titleRow = perfTitleIndex + 1 + raporRowOffset;
      const headerRow = titleRow + 1;
      const perfCount = Array.isArray(model.performance) ? model.performance.length : 0;
      const dataStart = headerRow + 1;
      const dataEnd = dataStart + Math.max(0, perfCount) - 1;

      const titleValue = raporWs.getCell(titleRow, 1).value ?? raporAoa[perfTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(titleRow, 2, titleRow, 22);
      const titleCell = raporWs.getCell(titleRow, 2);
      titleCell.value = titleValue;
      raporWs.getCell(titleRow, 1).value = null;
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.font = {
        ...(titleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(titleRow, col).border = borderAllb;
      }
      raporWs.getRow(titleRow).height = 24;

      const labelAlignment = { vertical: "middle", horizontal: "left", wrapText: true };
      const valueAlignment = { vertical: "middle", horizontal: "center", wrapText: true };
      const countFormat = countNumFmt;
      const amountFormat = currencyNumFmt;
      const prevLocalCodeLabel =
        safeStr(prevCurrencyMeta?.local_currency_code) || localCode || "LOCAL";
      const currentLocalCodeLabel =
        localCode || safeStr(prevCurrencyMeta?.local_currency_code) || "LOCAL";
      const perfPlannedNumFmt = `#,##0 "${prevLocalCodeLabel}"`;
      const perfActualNumFmt = `#,##0 "${currentLocalCodeLabel}"`;
      const ratioFormat = percentNumFmt;

      const applyRange = (rowNum, startCol, endCol, { alignment, border, numFmt, bold, fontSize } = {}) => {
        for (let col = startCol; col <= endCol; col += 1) {
          const cell = raporWs.getCell(rowNum, col);
          if (border) cell.border = border;
          if (alignment) cell.alignment = alignment;
          if (numFmt) cell.numFmt = numFmt;
          const fontUpdates = {};
          if (bold) fontUpdates.bold = true;
          if (fontSize) fontUpdates.size = fontSize;
          if (Object.keys(fontUpdates).length) {
            cell.font = { ...(cell.font || {}), ...fontUpdates };
          }
        }
      };

      const styleHeaderRow = (rowNum) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 8);
        raporWs.mergeCells(rowNum, 9, rowNum, 13);
        raporWs.mergeCells(rowNum, 14, rowNum, 19);
        raporWs.mergeCells(rowNum, 20, rowNum, 22);
        applyRange(rowNum, 2, 8, {
          alignment: labelAlignment,
          border: borderAllb,
          bold: true,
          fontSize: 9,
        });
        applyRange(rowNum, 9, 13, {
          alignment: valueAlignment,
          border: borderAllb,
          bold: true,
          fontSize: 9,
        });
        applyRange(rowNum, 14, 19, {
          alignment: valueAlignment,
          border: borderAllb,
          bold: true,
          fontSize: 9,
        });
        applyRange(rowNum, 20, 22, {
          alignment: valueAlignment,
          border: borderAllb,
          bold: true,
          fontSize: 9,
        });
        raporWs.getRow(rowNum).height = 20;
      };

      const styleDataRow = (rowNum) => {
        raporWs.mergeCells(rowNum, 2, rowNum, 8);
        raporWs.mergeCells(rowNum, 9, rowNum, 13);
        raporWs.mergeCells(rowNum, 14, rowNum, 19);
        raporWs.mergeCells(rowNum, 20, rowNum, 22);

        const label = String(raporWs.getCell(rowNum, 2).value || "").toLowerCase();
        const plannedFormat = label.includes("ogrenci")
          ? countFormat
          : showLocal
            ? perfPlannedNumFmt
            : amountFormat;
        const actualFormat = label.includes("ogrenci")
          ? countFormat
          : showLocal
            ? perfActualNumFmt
            : amountFormat;

        applyRange(rowNum, 2, 8, {
          alignment: labelAlignment,
          border: borderAllb,
          bold: true,
          fontSize: 9,
        });
        applyRange(rowNum, 9, 13, { alignment: valueAlignment, border: borderAllb, numFmt: plannedFormat });
        applyRange(rowNum, 14, 19, { alignment: valueAlignment, border: borderAllb, numFmt: actualFormat });
        applyRange(rowNum, 20, 22, { alignment: valueAlignment, border: borderAllb, numFmt: ratioFormat });
        raporWs.getRow(rowNum).height = 20;
      };

      styleHeaderRow(headerRow);
      if (perfCount > 0) {
        for (let row = dataStart; row <= dataEnd; row += 1) {
          styleDataRow(row);
        }
      }
    }

    // TABLE E. DEGERLENDIRME
    const evalTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("E.")
    );
    if (evalTitleIndex >= 0) {
      const titleRow = evalTitleIndex + 1 + raporRowOffset;
      const bodyRow = titleRow + 1;

      const titleValue = raporWs.getCell(titleRow, 1).value ?? raporAoa[evalTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(titleRow, 2, titleRow, 22);
      const titleCell = raporWs.getCell(titleRow, 2);
      titleCell.value = titleValue;
      raporWs.getCell(titleRow, 1).value = null;
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.font = {
        ...(titleCell.font || {}),
        bold: true,
        size: 13,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(titleRow, col).border = borderAllb;
      }
      raporWs.getRow(titleRow).height = 24;

      const bodyValue = raporWs.getCell(bodyRow, 1).value ?? "";
      raporWs.mergeCells(bodyRow, 2, bodyRow, 22);
      const bodyCell = raporWs.getCell(bodyRow, 2);
      bodyCell.value = bodyValue;
      raporWs.getCell(bodyRow, 1).value = null;
      bodyCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      bodyCell.font = { ...(bodyCell.font || {}), color: { argb: "FFFF0000" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(bodyRow, col).border = borderAllb;
      }
      raporWs.getRow(bodyRow).height = 60;
    }

    // TABLE F. KOMISYON GORUS VE ONERILERI
    const commissionTitleIndex = raporAoa.findIndex(
      (row) => Array.isArray(row) && typeof row[0] === "string" && row[0].startsWith("F.")
    );
    if (commissionTitleIndex >= 0) {
      const titleRow = commissionTitleIndex + 1 + raporRowOffset;
      const titleValue = raporWs.getCell(titleRow, 1).value ?? raporAoa[commissionTitleIndex]?.[0] ?? "";
      raporWs.mergeCells(titleRow, 2, titleRow, 22);
      const titleCell = raporWs.getCell(titleRow, 2);
      titleCell.value = titleValue;
      raporWs.getCell(titleRow, 1).value = null;
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.font = {
        ...(titleCell.font || {}),
        bold: true,
        size: 12,
        name: "Times New Roman",
        color: { argb: "FFFFFFFF" },
      };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      for (let col = 2; col <= 22; col += 1) {
        raporWs.getCell(titleRow, col).border = borderAllb;
      }
      raporWs.getRow(titleRow).height = 24;
    }





    // Sheet #2: TEMEL BİLGİLER (AOA only)
    const model2 = buildTemelBilgilerModel({
      school,
      scenario,
      inputs,
      report: results,
      prevReport,
      currencyMeta,
      prevCurrencyMeta,
      reportCurrency,
      programType: normalizeProgramType(programType),
    });

    addAoaSheet(wb, "TEMEL BİLGİLER", buildTemelBilgilerAoa({ model: model2 }));

    // Sheet #3: Kapasite (AOA only)
    const model3 = buildKapasiteModel({
      scenario,
      inputs,
      programType,
      currencyMeta,
    });
    addAoaSheet(wb, "Kapasite", buildKapasiteAoa({ model: model3 }));

    // Sheet #4: HR ( IK ) (AOA only)
    const model4 = buildHrModel({
      scenario,
      inputs,
      report: results,
      programType,
      currencyMeta,
      reportCurrency,
    });
    addAoaSheet(wb, "HR ( IK )", buildHrAoa({ model: model4 }));

    // Sheet #5: Gelirler ( Incomes ) (AOA only)
    const model5 = buildGelirlerModel({
      scenario,
      inputs,
      report: results,
      programType,
      currencyMeta,
      reportCurrency,
    });
    addAoaSheet(wb, "Gelirler ( Incomes )", buildGelirlerAoa({ model: model5 }));

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

    // SHEET #6: Giderler ( Expenses ) (AOA ONLY)
    // ---------------------------------
    const model6 = buildGiderlerModel({
      scenario,
      inputs,
      report: results,
      programType,
      currencyMeta,
      reportCurrency,
    });

    addAoaSheet(wb, "Giderler ( Expenses )", buildGiderlerAoa({ model: model6 }));

    // SHEET #7-#9: N.Kadro ( Norm ) (AOA ONLY)
    // ---------------------------------
    const baseAcademicYear = String(scenario.academic_year || "").trim();
    for (let yearIndex = 0; yearIndex < 3; yearIndex += 1) {
      const yearLabel = academicYearWithOffset(baseAcademicYear, yearIndex);
      const sheetName = `N.Kadro ( ${yearLabel} )`;

      const model7 = buildNormModel({
        yearIndex,
        scenario,
        inputs,
        report: results,
        normConfig,
      });

      addAoaSheet(wb, sheetName, buildNormAoa({ model: model7, sheetTitle: sheetName }));
    }

    // SHEET #10: Mali Tablolar (AOA only)
    // ---------------------------------
    const model10 = buildMaliTablolarModel({
      scenario,
      inputs,
      report: results,
      currencyMeta,
      reportCurrency,
    });
    addAoaSheet(wb, "Mali Tablolar", buildMaliTablolarAoa({ model: model10 }));

    if (exportFormat === "pdf") {
      const parsePositiveInt = (value) => {
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const requestedStartRow = parsePositiveInt(req.query?.pdfStartRow);
      const requestedEndRow = parsePositiveInt(req.query?.pdfEndRow);
      const pageBreakColumns = { left: 2, right: 22 };
      const tableABreakRow = pdfPageBreaks.tableA ? Math.max(1, pdfPageBreaks.tableA - 1) : null;
      const finalSectionRow = pdfPageBreaks.localRegulation ?? pdfPageBreaks.currentFee;
      const pageBreakRows = [
        tableABreakRow,
        pdfPageBreaks.uncollectable,
        finalSectionRow,
      ].filter((row) => Number.isFinite(row) && row > 1);
      pageBreakRows.forEach((row) => {
        raporWs.getRow(row).addPageBreak(pageBreakColumns.left, pageBreakColumns.right);
      });

      for (let col = 1; col <= 27; col += 1) {
        if (col < 2 || col > 22) {
          const targetCol = raporWs.getColumn(col);
          targetCol.hidden = true;
          targetCol.width = 0.1;
        }
      }
      const targetWidth = 115;
      let currentWidth = 0;
      for (let col = 2; col <= 22; col += 1) {
        const colRef = raporWs.getColumn(col);
        const width = Number(colRef.width) || 8.43;
        currentWidth += width;
      }
      const scaleFactor = currentWidth > 0 ? Math.max(1, targetWidth / currentWidth) : 1;
      if (scaleFactor > 1.001) {
        for (let col = 2; col <= 22; col += 1) {
          const colRef = raporWs.getColumn(col);
          const width = Number(colRef.width) || 8.43;
          colRef.width = width * scaleFactor;
        }
      }
      const printEndRow = raporWs.rowCount || 1;
      const startRow = Math.min(printEndRow, Math.max(1, requestedStartRow || 1));
      const endRow = Math.min(printEndRow, requestedEndRow || printEndRow);
      if (endRow < startRow) {
        return res.status(400).json({ error: "Invalid pdfStartRow/pdfEndRow range." });
      }
      raporWs.pageSetup.printArea = `B${startRow}:V${endRow}`;
      raporWs.pageSetup.paperSize = 9; // A4
      raporWs.pageSetup.margins = {
        left: 0.7,
        right: 0.7,
        top: 0.2,
        bottom: 0,
        header: 0,
        footer: 0,
      };
      raporWs.pageSetup.horizontalCentered = false;
      raporWs.pageSetup.fitToPage = true;
      raporWs.pageSetup.fitToWidth = 1;
      raporWs.pageSetup.fitToHeight = 0;

      const nonRaporSheetIds = wb.worksheets
        .filter((ws) => ws.name !== "RAPOR")
        .map((ws) => ws.id);
      nonRaporSheetIds.forEach((id) => wb.removeWorksheet(id));
    }

    const rawBuf = await wb.xlsx.writeBuffer();
    const buf = Buffer.isBuffer(rawBuf) ? rawBuf : Buffer.from(rawBuf);

    const baseName = showLocal
      ? `${school.name}-${scenario.academic_year}-${localCode}.xlsx`
      : `${school.name}-${scenario.academic_year}.xlsx`;
    if (exportFormat === "pdf") {
      let pdfBuf;
      try {
        const pdfBase = path.basename(baseName, path.extname(baseName));
        pdfBuf = await convertXlsxBufferToPdf(buf, pdfBase);
      } catch (err) {
        return res.status(500).json({
          error: "PDF conversion failed",
          details: "LibreOffice (soffice) is required and must be available in PATH or SOFFICE_PATH.",
        });
      }
      res.setHeader("Content-Type", "application/pdf");
      const pdfName = baseName.replace(/\\.xlsx$/i, ".pdf");
      res.setHeader("Content-Disposition", formatAttachmentHeader(pdfName));
      return res.send(pdfBuf);
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", formatAttachmentHeader(baseName));
    return res.send(buf);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid inputs" });
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

module.exports = router;
