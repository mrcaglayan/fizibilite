// frontend/src/components/ExpenseSplitModal.jsx

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { api } from "../api";

const IK_AUTO_KEYS = new Set([
  "turkPersonelMaas",
  "turkDestekPersonelMaas",
  "yerelPersonelMaas",
  "yerelDestekPersonelMaas",
  "internationalPersonelMaas",
]);

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
  { key: "sharedPayrollAllocation", label: "Paylaşılan Bordro (Dağıtım)" },
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

const EXPENSE_ITEMS = [
  ...OPERATING_ITEMS.filter((it) => !IK_AUTO_KEYS.has(it.key)),
  ...SERVICE_ITEMS,
  ...DORM_ITEMS,
  ...DISCOUNT_ITEMS,
];
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
          "sharedPayrollAllocation",
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
    const groups = section.groups
      .map((group) => ({
        ...group,
        keys: group.keys.filter((key) => !IK_AUTO_KEYS.has(key)),
      }))
      .filter((group) => group.keys.length);
    const keys = groups.flatMap((group) => group.keys);
    return { ...section, groups, keys };
  }
  return {
    ...section,
    keys: section.keys.filter((key) => !IK_AUTO_KEYS.has(key)),
  };
}).filter((section) => section.keys.length);

const fmtNum = (v, fractionDigits = 2) =>
  Number.isFinite(Number(v))
    ? Number(v).toLocaleString(undefined, { maximumFractionDigits: fractionDigits })
    : "-";

const fmtPct = (v) =>
  Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(2)}%` : "-";

export default function ExpenseSplitModal({ open, onClose, sourceScenario, sourceSchoolId }) {
  const [targets, setTargets] = useState([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedTargets, setSelectedTargets] = useState(new Set());
  const [basis, setBasis] = useState("students");
  const [basisYearKey, setBasisYearKey] = useState("y1");
  const [selectedExpenseKeys, setSelectedExpenseKeys] = useState(new Set());
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
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
    setPreview(null);
  }, [open, sourceScenario?.id]);

  useEffect(() => {
    setPreview(null);
  }, [basis, basisYearKey, selectedTargetsKey, selectedExpenseKeyStr]);

  useEffect(() => {
    let active = true;
    async function loadTargets() {
      if (!open || !sourceScenario?.academic_year) return;
      setLoadingTargets(true);
      try {
        const data = await api.expenseSplitTargets(sourceScenario.academic_year);
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
  }, [open, sourceScenario?.academic_year, sourceScenario?.id]);

  const filteredTargets = useMemo(() => {
    const term = targetSearch.trim().toLowerCase();
    if (!term) return targets;
    return targets.filter((row) => {
      const schoolName = String(row?.schoolName || "").toLowerCase();
      const scenarioName = String(row?.scenarioName || "").toLowerCase();
      return schoolName.includes(term) || scenarioName.includes(term);
    });
  }, [targets, targetSearch]);

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
      onClose?.();
    } catch (e) {
      toast.error(e.message || "Dagitim uygulanamadi");
    } finally {
      setApplyLoading(false);
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

  const targetById = useMemo(() => {
    const m = new Map();
    previewTargets.forEach((t) => m.set(String(t.targetScenarioId), t));
    return m;
  }, [previewTargets]);

  const allocationRows = useMemo(() => {
    return previewAllocations.map((row) => {
      const target = targetById.get(String(row.targetScenarioId));
      return {
        targetLabel: target
          ? `${target.schoolName || ""} • ${target.scenarioName || ""}`
          : String(row.targetScenarioId),
        expenseLabel: EXPENSE_LABELS.get(row.expenseKey) || row.expenseKey,
        amount: row.allocatedAmount,
      };
    });
  }, [previewAllocations, targetById]);

  const totalExpenseCount = EXPENSE_KEYS.length;
  const selectedExpenseCount = selectedExpenseKeys.size;
  const allExpensesSelected = totalExpenseCount > 0 && selectedExpenseCount === totalExpenseCount;
  const someExpensesSelected = selectedExpenseCount > 0 && !allExpensesSelected;

  const previewDisabled =
    !selectedTargets.size || !selectedExpenseKeys.size || previewLoading || applyLoading;

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
            disabled={applyLoading || previewLoading}
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
              <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Hedef Senaryolar</div>
              {loadingTargets ? (
                <div className="small">Yükleniyor...</div>
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
                            <tr key={row.scenarioId}>
                              <td style={{ padding: "6px 8px" }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
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
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="small" style={{ fontWeight: 700 }}>Gider Kalemleri</div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn"
                    type="button"
                    style={{ padding: "4px 10px" }}
                    onClick={() => setExpenseKeys(EXPENSE_KEYS, true)}
                    disabled={!totalExpenseCount}
                  >
                    Tumunu Sec
                  </button>
                  <button
                    className="btn"
                    type="button"
                    style={{ padding: "4px 10px" }}
                    onClick={() => setExpenseKeys(EXPENSE_KEYS, false)}
                    disabled={!selectedExpenseCount}
                  >
                    Temizle
                  </button>
                </div>
              </div>
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
                  previewLoading ||
                  !selectedTargets.size ||
                  !selectedExpenseKeys.size
                }
              >
                {applyLoading ? "Uygulaniyor..." : "Uygula"}
              </button>
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
                    <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Havuz Tutarlari</div>
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
                  </>
                ) : null}

                {previewTargets.length > 0 ? (
                  <>
                    <div className="small" style={{ fontWeight: 700, margin: "12px 0 6px" }}>Agirliklar</div>
                    <div className="table-scroll">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Okul</th>
                            <th>Senaryo</th>
                            <th>Basis</th>
                            <th>Agirlik</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewTargets.map((t) => (
                            <tr key={t.targetScenarioId}>
                              <td>{t.schoolName}</td>
                              <td>{t.scenarioName}</td>
                              <td>{fmtNum(t.basisValue)}</td>
                              <td>{fmtPct(t.weight)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}

                {allocationRows.length > 0 ? (
                  <>
                    <div className="small" style={{ fontWeight: 700, margin: "12px 0 6px" }}>Dagitimlar</div>
                    <div className="table-scroll">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Hedef</th>
                            <th>Gider</th>
                            <th>Tutar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allocationRows.map((row, idx) => (
                            <tr key={`${row.targetLabel}-${row.expenseLabel}-${idx}`}>
                              <td>{row.targetLabel}</td>
                              <td>{row.expenseLabel}</td>
                              <td>{fmtNum(row.amount)}</td>
                            </tr>
                          ))}
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
