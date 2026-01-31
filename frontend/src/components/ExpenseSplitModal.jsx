// frontend/src/components/ExpenseSplitModal.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { toast } from "react-toastify";
import { api } from "../api";

const OPERATING_ITEMS = [
  { key: "ulkeTemsilciligi", label: "Ülke Temsilciligi Giderleri" },
  { key: "genelYonetim", label: "Genel Yönetim Giderleri" },
  { key: "kira", label: "Isletme Giderleri (Kira)" },
  { key: "emsalKira", label: "Isletme Giderleri (Emsal Kira)" },
  { key: "enerjiKantin", label: "Isletme Giderleri (Elektrik, Su, vb.)" },
  { key: "turkPersonelMaas", label: "Yurt disi TÜRK Personel Maas Giderleri" },
  { key: "turkDestekPersonelMaas", label: "Yurt disi TÜRK DESTEK Personel Maas Giderleri" },
  { key: "yerelPersonelMaas", label: "Yurt disi YEREL Personel Maas Giderleri" },
  { key: "yerelDestekPersonelMaas", label: "Yurt disi YEREL DESTEK Personel Maas Giderleri" },
  { key: "internationalPersonelMaas", label: "Yurt disi INTERNATIONAL Personel Maas Giderleri" },
  { key: "disaridanHizmet", label: "Disaridan Saglanan Mal ve Hizmet Alimlari" },
  { key: "egitimAracGerec", label: "Egitim Araç ve Gereçleri" },
  { key: "finansalGiderler", label: "Finansal Giderler" },
  { key: "egitimAmacliHizmet", label: "Egitim Amaçli Hizmet Alimlari" },
  { key: "temsilAgirlama", label: "Temsil ve Agirlama" },
  { key: "ulkeIciUlasim", label: "Ülke Içi Ulasim ve Konaklama" },
  { key: "ulkeDisiUlasim", label: "Ülke Disi Ulasim ve Konaklama" },
  { key: "vergilerResmiIslemler", label: "Vergiler Resmi Islemler" },
  { key: "vergiler", label: "Vergiler" },
  { key: "demirbasYatirim", label: "Demirbas ve Yatirimlar" },
  { key: "rutinBakim", label: "Rutin Bakim ve Onarim" },
  { key: "pazarlamaOrganizasyon", label: "Pazarlama Organizasyon" },
  { key: "reklamTanitim", label: "Reklam ve Tanitim" },
  { key: "tahsilEdilemeyenGelirler", label: "Tahsil Edilemeyen Gelirler" },
];

const SERVICE_ITEMS = [
  { key: "yemek", label: "Yemek" },
  { key: "uniforma", label: "Üniforma" },
  { key: "kitapKirtasiye", label: "Kitap-Kırtasiye" },
  { key: "ulasimServis", label: "Servis / Ulaşım" },
];

const DORM_ITEMS = [
  { key: "yurtGiderleri", label: "Yurt Giderleri (Kampus giderleri içinde gösterilmeyecek)" },
  { key: "digerYurt", label: "Diğer (Yaz okulu giderleri vb.)" },
];

const DISCOUNT_ITEMS = [
  { key: "discountsTotal", label: "Burs ve İndirimler (Toplam)" },
];

const EXPENSE_ITEMS = [...OPERATING_ITEMS, ...SERVICE_ITEMS, ...DORM_ITEMS, ...DISCOUNT_ITEMS];
const EXPENSE_KEYS = EXPENSE_ITEMS.map((it) => it.key);
const EXPENSE_ITEM_MAP = new Map(EXPENSE_ITEMS.map((it) => [it.key, it]));
const EXPENSE_LABELS = new Map(EXPENSE_ITEMS.map((it) => [it.key, it.label]));

const EXPENSE_SECTIONS = [
  {
    id: "isletme",
    label: "İşletme Giderleri",
    groups: [
      {
        label: "İşletme Giderleri",
        keys: [
          "ulkeTemsilciligi",
          "genelYonetim",
          "temsilAgirlama",
          "ulkeIciUlasim",
          "ulkeDisiUlasim",
          "vergilerResmiIslemler",
          "vergiler",
          "demirbasYatirim",
          "rutinBakim",
          "pazarlamaOrganizasyon",
          "reklamTanitim",
          "tahsilEdilemeyenGelirler",
        ],
      },
      {
        label: "Eğitim Maliyetleri",
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
    ],
  },
  {
    id: "ogrenimDisi",
    label: "Öğrenim Dışı Hizmetler",
    keys: ["yemek", "uniforma", "kitapKirtasiye", "ulasimServis"],
  },
  {
    id: "yurtKonaklama",
    label: "Yurt / Konaklama",
    keys: ["yurtGiderleri", "digerYurt"],
  },
  {
    id: "bursIndirim",
    label: "Burs ve İndirimler",
    keys: ["discountsTotal"],
  },
].map((section) => {
  if (Array.isArray(section.groups)) {
    const groups = section.groups.filter((group) => group.keys.length);
    const keys = groups.flatMap((group) => group.keys);
    return { ...section, groups, keys };
  }
  return {
    ...section,
    keys: section.keys,
  };
}).filter((section) => section.keys.length);

const fmtNum = (v, fractionDigits = 2) =>
  Number.isFinite(Number(v))
    ? Number(v).toLocaleString(undefined, { maximumFractionDigits: fractionDigits })
    : "-";

const fmtPct = (v) =>
  Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(2)}%` : "-";

function parseAcademicYearParts(value) {
  const raw = String(value || "").trim();
  const range = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    const startYear = Number(range[1]);
    const endYear = Number(range[2]);
    if (Number.isFinite(startYear) && Number.isFinite(endYear)) {
      return { startYear: String(startYear), endYear: String(endYear) };
    }
  }
  const single = raw.match(/^(\d{4})$/);
  if (single) {
    const year = Number(single[1]);
    if (Number.isFinite(year)) return { startYear: String(year), endYear: String(year) };
  }
  return { startYear: null, endYear: null };
}

function resolveTargetYear(academicYear, yearBasis) {
  if (!academicYear) return null;
  if (yearBasis === "start" || yearBasis === "end") {
    const { startYear, endYear } = parseAcademicYearParts(academicYear);
    return yearBasis === "start" ? startYear : endYear;
  }
  return academicYear;
}

export default function ExpenseSplitModal({
  open,
  onClose,
  onApplied,
  sourceScenario,
  sourceSchoolId,
  sourceSchoolName,
}) {
  const [targets, setTargets] = useState([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedTargets, setSelectedTargets] = useState(new Set());
  const [basis, setBasis] = useState("students");
  const [basisYearKey, setBasisYearKey] = useState("y1");
  const [yearBasis, setYearBasis] = useState("academic");
  const [selectedExpenseKeys, setSelectedExpenseKeys] = useState(new Set());
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [revertLoading, setRevertLoading] = useState(false);
  const [showPools, setShowPools] = useState(false);
  const [expandedTargets, setExpandedTargets] = useState(new Set());
  const [showTargets, setShowTargets] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [prefillScope, setPrefillScope] = useState(null);
  const prefillAppliedRef = useRef(false);
  const compactControlStyle = {
    fontSize: 12,
    height: 30,
    padding: "4px 8px",
    lineHeight: "20px",
    boxSizing: "border-box",
  };

  const selectedTargetsKey = useMemo(
    () => Array.from(selectedTargets).sort().join(","),
    [selectedTargets]
  );
  const selectedExpenseKeyStr = useMemo(
    () => Array.from(selectedExpenseKeys).sort().join(","),
    [selectedExpenseKeys]
  );

  useEffect(() => {
    if (!open) return;
    setTargetSearch("");
    setSelectedTargets(new Set());
    setSelectedExpenseKeys(new Set());
    setBasis("students");
    setBasisYearKey("y1");
    setYearBasis("academic");
    setPreview(null);
    setRevertLoading(false);
    setPrefillScope(null);
    prefillAppliedRef.current = false;
  }, [open, sourceScenario?.id]);

  useEffect(() => {
    setPreview(null);
    setShowPools(false);
    setExpandedTargets(new Set());
    setShowTargets(true);
    setShowExpenses(true);
  }, [basis, basisYearKey, yearBasis, selectedTargetsKey, selectedExpenseKeyStr]);

  useEffect(() => {
    let active = true;
    async function loadTargets() {
      if (!open || !sourceScenario?.academic_year) return;
      const targetYear = resolveTargetYear(sourceScenario.academic_year, yearBasis);
      if (!targetYear) return;
      setLoadingTargets(true);
      try {
        const data = await api.expenseSplitTargets(targetYear, yearBasis);
        if (!active) return;
        const list = Array.isArray(data) ? data : [];
        const filtered = list.filter(
          (row) => String(row.scenarioId) !== String(sourceScenario?.id)
        );
        setTargets(filtered);
      } catch (e) {
        if (active) {
          toast.error(e.message || "Hedef senaryolar alinamadi");
        }
      } finally {
        if (active) setLoadingTargets(false);
      }
    }
    loadTargets();
    return () => {
      active = false;
    };
  }, [open, sourceScenario?.academic_year, sourceScenario?.id, yearBasis]);

  useEffect(() => {
    let active = true;
    async function loadPrefill() {
      if (!open || !sourceScenario?.id || !sourceSchoolId) return;
      try {
        const data = await api.getExpenseSplitLastScope(sourceSchoolId, sourceScenario.id);
        if (!active) return;
        setPrefillScope(data?.scope || null);
      } catch (_) {
        if (active) setPrefillScope(null);
      }
    }
    loadPrefill();
    return () => {
      active = false;
    };
  }, [open, sourceScenario?.id, sourceSchoolId]);

  useEffect(() => {
    if (!open || prefillAppliedRef.current) return;
    if (loadingTargets) return;
    if (!prefillScope || typeof prefillScope !== "object") return;

    const nextBasis = String(prefillScope.basis || "").toLowerCase();
    const nextYear = String(prefillScope.basisYearKey || "").toLowerCase();
    if (nextBasis === "students" || nextBasis === "revenue") {
      setBasis(nextBasis);
    }
    if (["y1", "y2", "y3"].includes(nextYear)) {
      setBasisYearKey(nextYear);
    }

    const allowedExpenseKeys = new Set(EXPENSE_KEYS);
    const expenseKeys = Array.isArray(prefillScope.expenseKeys)
      ? prefillScope.expenseKeys.filter((key) => allowedExpenseKeys.has(key))
      : [];
    setSelectedExpenseKeys(new Set(expenseKeys));

    const targetIdSet = new Set(targets.map((row) => String(row.scenarioId)));
    const targetScenarioIds = Array.isArray(prefillScope.targetScenarioIds)
      ? prefillScope.targetScenarioIds.map((id) => String(id))
      : [];
    const filteredTargets = targetScenarioIds.filter((id) => targetIdSet.has(id));
    setSelectedTargets(new Set(filteredTargets));

    prefillAppliedRef.current = true;
  }, [open, loadingTargets, prefillScope, targets]);

  const filteredTargets = useMemo(() => {
    const term = targetSearch.trim().toLowerCase();
    if (!term) return targets;
    return targets.filter((row) => {
      const schoolName = String(row?.schoolName || "").toLowerCase();
      const scenarioName = String(row?.scenarioName || "").toLowerCase();
      return schoolName.includes(term) || scenarioName.includes(term);
    });
  }, [targets, targetSearch]);

  useEffect(() => {
    if (!targets.length) {
      setSelectedTargets((prev) => (prev.size ? new Set() : prev));
      return;
    }
    const idSet = new Set(targets.map((row) => String(row.scenarioId)));
    setSelectedTargets((prev) => {
      if (!prev || prev.size === 0) return prev;
      const next = new Set(Array.from(prev).filter((id) => idSet.has(String(id))));
      return next.size === prev.size ? prev : next;
    });
  }, [targets]);

  const toggleTarget = (id) => {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleExpenseKey = (key) => {
    setSelectedExpenseKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setExpenseKeys = (keys, checked) => {
    if (!Array.isArray(keys) || !keys.length) return;
    setSelectedExpenseKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => {
        if (checked) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  };

  const handlePreview = async () => {
    if (!sourceScenario?.id || !sourceSchoolId) return;
    const payload = {
      targetScenarioIds: Array.from(selectedTargets).map((id) => Number(id)),
      basis,
      basisYearKey,
      expenseKeys: Array.from(selectedExpenseKeys),
    };
    setShowTargets(false);
    setShowExpenses(false);
    setPreviewLoading(true);
    try {
      const data = await api.previewExpenseSplit(sourceSchoolId, sourceScenario.id, payload);
      setPreview(data || null);
    } catch (e) {
      toast.error(e.message || "Önizleme alinamadi");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    if (!sourceScenario?.id || !sourceSchoolId) return;
    const payload = {
      targetScenarioIds: Array.from(selectedTargets).map((id) => Number(id)),
      basis,
      basisYearKey,
      expenseKeys: Array.from(selectedExpenseKeys),
    };
    setApplyLoading(true);
    try {
      await api.applyExpenseSplit(sourceSchoolId, sourceScenario.id, payload);
      toast.success("Gider dagitimi kaydedildi.");
      onApplied?.({
        sourceScenarioId: sourceScenario.id,
        targetScenarioIds: payload.targetScenarioIds,
      });
      onClose?.();
    } catch (e) {
      toast.error(e.message || "Dagitim uygulanamadi");
    } finally {
      setApplyLoading(false);
    }
  };

  const handleRevert = async () => {
    if (!sourceScenario?.id || !sourceSchoolId) return;
    if (!selectedTargets.size || revertLoading || applyLoading) return;
    const ok = window.confirm("Secili hedefler icin gider dagitimi geri alinsin mi?");
    if (!ok) return;
    setRevertLoading(true);
    try {
      const targetScenarioIds = Array.from(selectedTargets).map((id) => Number(id));
      const data = await api.revertExpenseSplit(sourceSchoolId, sourceScenario.id, { targetScenarioIds });
      const removed = Array.isArray(data?.removedTargetScenarioIds) ? data.removedTargetScenarioIds : [];
      if (removed.length) {
        setSelectedTargets((prev) => {
          const next = new Set(prev);
          removed.forEach((id) => next.delete(String(id)));
          return next;
        });
      }
      if (data?.deletedSet) {
        setPrefillScope(null);
        setSelectedExpenseKeys(new Set());
      }
      toast.success("Gider dagitimi geri alindi.");
    } catch (e) {
      toast.error(e.message || "Geri alma basarisiz");
    } finally {
      setRevertLoading(false);
    }
  };

  const previewTargets = useMemo(
    () => (Array.isArray(preview?.targets) ? preview.targets : []),
    [preview]
  );
  const previewPools = useMemo(
    () => (Array.isArray(preview?.pools) ? preview.pools : []),
    [preview]
  );
  const previewAllocations = useMemo(
    () => (Array.isArray(preview?.allocations) ? preview.allocations : []),
    [preview]
  );
  const previewWarnings = useMemo(
    () => (Array.isArray(preview?.warnings) ? preview.warnings : []),
    [preview]
  );

  const sourceLabel =
    sourceSchoolName ||
    sourceScenario?.schoolName ||
    sourceScenario?.school?.name ||
    "";

  const allocationsByTarget = useMemo(() => {
    const map = new Map();
    previewAllocations.forEach((row) => {
      const key = String(row.targetScenarioId);
      const list = map.get(key) || [];
      list.push({
        expenseLabel: EXPENSE_LABELS.get(row.expenseKey) || row.expenseKey,
        amount: row.allocatedAmount,
      });
      map.set(key, list);
    });
    return map;
  }, [previewAllocations]);

  const totalExpenseCount = EXPENSE_KEYS.length;
  const selectedExpenseCount = selectedExpenseKeys.size;
  const allExpensesSelected = totalExpenseCount > 0 && selectedExpenseCount === totalExpenseCount;
  const someExpensesSelected = selectedExpenseCount > 0 && !allExpensesSelected;

  const previewDisabled =
    !selectedTargets.size || !selectedExpenseKeys.size || previewLoading || applyLoading || revertLoading;

  const isletmeSection = EXPENSE_SECTIONS.find((s) => s.id === "isletme") || null;
  const otherSections = EXPENSE_SECTIONS.filter((s) => s.id !== "isletme");

  const renderSectionCard = (section) => {
    if (!section) return null;
    const total = section.keys.length;
    const selected = section.keys.reduce(
      (sum, key) => sum + (selectedExpenseKeys.has(key) ? 1 : 0),
      0
    );
    const allSelected = total > 0 && selected === total;
    const someSelected = selected > 0 && !allSelected;

    return (
      <div
        key={section.id}
        className="card"
        style={{ padding: "10px 12px", background: "#f8fafc" }}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <label className="row small" style={{ gap: 6, alignItems: "center", fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={(e) => setExpenseKeys(section.keys, e.target.checked)}
            />
            <span>{section.label}</span>
          </label>
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn"
              type="button"
              style={{ padding: "4px 10px" }}
              onClick={() => setExpenseKeys(section.keys, true)}
              disabled={!total}
            >
              Sec
            </button>
            <button
              className="btn"
              type="button"
              style={{ padding: "4px 10px" }}
              onClick={() => setExpenseKeys(section.keys, false)}
              disabled={!selected}
            >
              Temizle
            </button>
          </div>
        </div>
        <div className="small muted" style={{ marginTop: 4 }}>
          Secili: {selected}/{total}
        </div>
        {Array.isArray(section.groups) ? (
          <div style={{ marginTop: 8 }}>
            {section.groups.map((group) => (
              <div key={group.label} style={{ marginTop: 8 }}>
                <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
                  {group.label}
                </div>
                <div className="grid2" style={{ gap: 8 }}>
                  {group.keys.map((key) => {
                    const item = EXPENSE_ITEM_MAP.get(key);
                    const label = item?.label || key;
                    return (
                      <label key={key} className="row" style={{ gap: 6, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedExpenseKeys.has(key)}
                          onChange={() => toggleExpenseKey(key)}
                        />
                        <span className="small">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid2" style={{ gap: 8, marginTop: 8 }}>
            {section.keys.map((key) => {
              const item = EXPENSE_ITEM_MAP.get(key);
              const label = item?.label || key;
              return (
                <label key={key} className="row" style={{ gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={selectedExpenseKeys.has(key)}
                    onChange={() => toggleExpenseKey(key)}
                  />
                  <span className="small">{label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const toggleTargetAllocations = (scenarioId) => {
    setExpandedTargets((prev) => {
      const next = new Set(prev);
      const key = String(scenarioId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal"
        style={{ width: "min(980px, 96vw)", maxHeight: "86vh", overflowY: "auto", position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <button
            className="btn"
            onClick={onClose}
            disabled={applyLoading || previewLoading || revertLoading}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "#111827",
              borderColor: "#111827",
              color: "#fff",
            }}
          >
            Kapat
          </button>
        </div>

        {!sourceScenario ? (
          <div className="small" style={{ marginTop: 10 }}>
            Kaynak senaryo seçilmedi.
          </div>
        ) : (
          <>
            <div style={{ marginTop: 2 }}>
              <div className="row" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ minWidth: 170 }}>
                  <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Basis</div>
                  <select className="input sm" style={compactControlStyle} value={basis} onChange={(e) => setBasis(e.target.value)}>
                    <option value="students">Students</option>
                    <option value="revenue">Revenue</option>
                  </select>
                </div>
                  <div style={{ minWidth: 160 }}>
                    <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Basis Yil</div>
                    <select className="input sm" style={compactControlStyle} value={basisYearKey} onChange={(e) => setBasisYearKey(e.target.value)}>
                      <option value="y1">Y1</option>
                      <option value="y2">Y2</option>
                      <option value="y3">Y3</option>
                    </select>
                  </div>
                  <div style={{ minWidth: 210 }}>
                    <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Yil ortasi donemleri</div>
                    <select
                      className="input sm"
                      style={compactControlStyle}
                      value={yearBasis}
                      onChange={(e) => setYearBasis(e.target.value)}
                    >
                      <option value="academic">Ayrik (2024-2025)</option>
                      <option value="start">Baslangic yilina dahil</option>
                      <option value="end">Bitis yilina dahil</option>
                    </select>
                  </div>
                  <div style={{ flex: "1 1 220px" }}>
                    <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Hedef Ara</div>
                    <input
                      className="input sm"
                    style={compactControlStyle}
                    placeholder="Okul veya senaryo ara"
                    value={targetSearch}
                    onChange={(e) => setTargetSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 5 }}>
              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                onClick={() => setShowTargets((prev) => !prev)}
              >
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  {showTargets ? <FaChevronDown aria-hidden="true" /> : <FaChevronRight aria-hidden="true" />}
                  <div className="small" style={{ fontWeight: 700 }}>Hedef Senaryolar</div>
                </div>
              </div>
              {showTargets ? (
                loadingTargets ? (
                  <div className="small">Yukleniyor...</div>
                ) : (
                  <div className="table-scroll" style={{ maxHeight: 260 }}>
                    <table className="table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}></th>
                          <th style={{ fontSize: 12, padding: "6px 8px" }}>Okul</th>
                          <th style={{ fontSize: 12, padding: "6px 8px" }}>Senaryo</th>
                          <th style={{ fontSize: 12, padding: "6px 8px" }}>Yil</th>
                          <th style={{ fontSize: 12, padding: "6px 8px" }}>Para Birimi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTargets.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="small" style={{ padding: "6px 8px" }}>Hedef bulunamadi.</td>
                          </tr>
                        ) : (
                          filteredTargets.map((row) => {
                            const id = String(row.scenarioId);
                            const checked = selectedTargets.has(id);
                            const currencyLabel =
                              String(row.input_currency || "USD") === "LOCAL"
                                ? `${row.input_currency}/${row.local_currency_code || "LOCAL"}`
                                : row.input_currency || "USD";
                            return (
                              <tr
                                key={row.scenarioId}
                                onClick={() => toggleTarget(id)}
                                style={{
                                  cursor: "pointer",
                                  ...(checked ? { background: "#eef2ff" } : {}),
                                }}
                              >
                                <td style={{ padding: "6px 8px" }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => toggleTarget(id)}
                                  />
                                </td>
                                <td style={{ padding: "6px 8px" }}>{row.schoolName}</td>
                                <td style={{ padding: "6px 8px" }}>{row.scenarioName}</td>
                                <td style={{ padding: "6px 8px" }}>{row.academic_year}</td>
                                <td style={{ padding: "6px 8px" }}>{currencyLabel}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}
            </div>

            <div style={{ marginTop: 16 }}>
              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                onClick={() => setShowExpenses((prev) => !prev)}
              >
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  {showExpenses ? <FaChevronDown aria-hidden="true" /> : <FaChevronRight aria-hidden="true" />}
                  <div className="small" style={{ fontWeight: 700 }}>Gider Kalemleri</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn"
                    type="button"
                    style={{ padding: "4px 10px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpenseKeys(EXPENSE_KEYS, true);
                    }}
                    disabled={!totalExpenseCount}
                  >
                    Tumunu Sec
                  </button>
                  <button
                    className="btn"
                    type="button"
                    style={{ padding: "4px 10px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpenseKeys(EXPENSE_KEYS, false);
                    }}
                    disabled={!selectedExpenseCount}
                  >
                    Temizle
                  </button>
                </div>
              </div>
              {showExpenses ? (
                <>
                  <div className="row" style={{ gap: 10, alignItems: "center", marginTop: 8 }}>
                    <label className="row small" style={{ gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={allExpensesSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someExpensesSelected;
                        }}
                        onChange={(e) => setExpenseKeys(EXPENSE_KEYS, e.target.checked)}
                      />
                      <span>Toplam Secili: {selectedExpenseCount}/{totalExpenseCount}</span>
                    </label>
                  </div>

                  <div className="row" style={{ alignItems: "flex-start", gap: 12, marginTop: 10 }}>
                    <div style={{ flex: "1 1 0", minWidth: 320 }}>
                      {renderSectionCard(isletmeSection)}
                    </div>
                    <div style={{ flex: "1 1 0", minWidth: 320, display: "grid", gap: 12 }}>
                      {otherSections.map((section) => renderSectionCard(section))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="row" style={{ justifyContent: "flex-end", marginTop: 16, gap: 8 }}>
              <button className="btn" onClick={handlePreview} disabled={previewDisabled}>
                {previewLoading ? "Önizleme..." : "Önizle"}
              </button>
              <button
                className="btn primary"
                onClick={handleApply}
                disabled={
                  applyLoading ||
                  revertLoading ||
                  previewLoading ||
                  !selectedTargets.size ||
                  !selectedExpenseKeys.size
                }
              >
                {applyLoading ? "Uygulaniyor..." : "Uygula"}
              </button>
              {prefillScope ? (
                <button
                  className="btn danger"
                  onClick={handleRevert}
                  disabled={!selectedTargets.size || applyLoading || revertLoading}
                >
                  {revertLoading ? "Geri Aliniyor..." : "Gider Dagitimini Geri Al"}
                </button>
              ) : null}
            </div>

            {previewWarnings.length > 0 ? (
              <div className="card" style={{ marginTop: 12, background: "#fff7ed", borderColor: "#fed7aa" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Uyarilar</div>
                {previewWarnings.map((w, idx) => (
                  <div key={idx} className="small">• {w}</div>
                ))}
              </div>
            ) : null}

            {preview ? (
              <div style={{ marginTop: 16 }}>
                {previewPools.length > 0 ? (
                  <>
                    <div
                      className="row"
                      style={{
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                        cursor: "pointer",
                      }}
                      onClick={() => setShowPools((prev) => !prev)}
                    >
                      <div className="row" style={{ gap: 6, alignItems: "center" }}>
                        {showPools ? <FaChevronDown aria-hidden="true" /> : <FaChevronRight aria-hidden="true" />}
                        <div className="small" style={{ fontWeight: 700 }}>
                          Havuz Tutarlari{sourceLabel ? ` (${sourceLabel})` : ""}
                        </div>
                      </div>
                    </div>
                    {showPools ? (
                      <div className="table-scroll">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Gider</th>
                              <th>Havuz Tutari</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewPools.map((p) => (
                              <tr key={p.expenseKey}>
                                <td>{EXPENSE_LABELS.get(p.expenseKey) || p.expenseKey}</td>
                                <td>{fmtNum(p.poolAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {previewTargets.length > 0 ? (
                  <>
                    <div className="small" style={{ fontWeight: 700, margin: "12px 0 6px" }}>
                      Agirliklar (satira tiklayin)
                    </div>
                    <div className="table-scroll">
                      <table className="table">
                        <thead>
                          <tr>
                            <th style={{ width: 28 }} />
                            <th>Okul</th>
                            <th>Senaryo</th>
                            <th>Basis</th>
                            <th>Agirlik</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewTargets.map((t) => {
                            const targetKey = String(t.targetScenarioId);
                            const isExpanded = expandedTargets.has(targetKey);
                            const allocRows = allocationsByTarget.get(targetKey) || [];
                            return (
                              <React.Fragment key={t.targetScenarioId}>
                                <tr
                                  onClick={() => toggleTargetAllocations(t.targetScenarioId)}
                                  style={{ cursor: "pointer" }}
                                >
                                  <td style={{ textAlign: "center" }}>
                                    {isExpanded ? (
                                      <FaChevronDown aria-hidden="true" />
                                    ) : (
                                      <FaChevronRight aria-hidden="true" />
                                    )}
                                  </td>
                                  <td>{t.schoolName}</td>
                                  <td>{t.scenarioName}</td>
                                  <td>{fmtNum(t.basisValue)}</td>
                                  <td>{fmtPct(t.weight)}</td>
                                </tr>
                                {isExpanded ? (
                                  <tr>
                                    <td colSpan={5}>
                                      {allocRows.length ? (
                                        <table className="table" style={{ margin: 0 }}>
                                          <thead>
                                            <tr>
                                              <th>Gider</th>
                                              <th>Tutar</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {allocRows.map((row, idx) => (
                                              <tr key={`${targetKey}-${row.expenseLabel}-${idx}`}>
                                                <td>{row.expenseLabel}</td>
                                                <td>{fmtNum(row.amount)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      ) : (
                                        <div className="small is-muted">Dagitim bulunamadi.</div>
                                      )}
                                    </td>
                                  </tr>
                                ) : null}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
