import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { api } from "../api";

export default function CountrySendModal({ open, onClose, countryId }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState("");
  const [years, setYears] = useState([]);
  const [yearsLoading, setYearsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [hideIneligible, setHideIneligible] = useState(false);
  const [hideSent, setHideSent] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const [academicYear, setAcademicYear] = useState("");
  const [yearBasis, setYearBasis] = useState("academic");

  const loadPreview = useCallback(async () => {
    if (!open || !countryId || !academicYear.trim()) return;
    setErr("");
    setLoading(true);
    try {
      const data = await api.countryApprovalBatchPreview(countryId, academicYear.trim(), yearBasis);
      setPreview(data || { rows: [] });
    } catch (e) {
      setErr(e.message || "Onizleme alinamadi");
    } finally {
      setLoading(false);
    }
    setApplyResult(null);
  }, [open, countryId, academicYear, yearBasis]);

  const loadYears = useCallback(async () => {
    if (!open || !countryId) return;
    setYearsLoading(true);
    setErr("");
    try {
      const data = await api.countryApprovalBatchYears(countryId, yearBasis);
      const list = Array.isArray(data?.years) ? data.years : Array.isArray(data) ? data : [];
      setYears(list);
      setAcademicYear((prev) => {
        if (prev && list.includes(prev)) return prev;
        return list[0] || "";
      });
    } catch (e) {
      setErr(e.message || "Yillar alinamadi");
      setYears([]);
    } finally {
      setYearsLoading(false);
    }
  }, [open, countryId, yearBasis]);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setErr("");
    setApplyResult(null);
    setYears([]);
    loadYears();
  }, [open, loadYears]);

  useEffect(() => {
    if (!open) return;
    if (!academicYear) return;
    if (yearsLoading) return;
    if (years.length && !years.includes(academicYear)) return;
    loadPreview();
  }, [open, academicYear, loadPreview, yearsLoading, years]);

  const rows = useMemo(
    () => (Array.isArray(preview?.rows) ? preview.rows : []),
    [preview?.rows]
  );
  const guardDisabled = !!preview?.bulkDisabledDueToStaleSource;
  const staleSources = Array.isArray(preview?.staleSources) ? preview.staleSources : [];

  const searchTerm = search.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (hideIneligible && !row.eligible) return false;
      if (hideSent && row.sentAt) return false;
      if (!searchTerm) return true;
      const schoolName = String(row.schoolName || "").toLowerCase();
      const scenarioName = String(row.scenarioName || "").toLowerCase();
      return schoolName.includes(searchTerm) || scenarioName.includes(searchTerm);
    });
  }, [rows, hideIneligible, hideSent, searchTerm]);

  const handleApply = async () => {
    if (applyLoading || !preview?.canSubmit || !academicYear.trim()) return;
    setErr("");
    setApplyLoading(true);
    try {
      const data = await api.countryApprovalBatchSend(countryId, academicYear.trim(), yearBasis);
      setApplyResult(data || null);
      toast.success("Ulke onay paketi gonderildi");
      await loadPreview();
    } catch (e) {
      setErr(e.message || "Gonderim basarisiz");
    } finally {
      setApplyLoading(false);
    }
  };

  const statusLabel = (status) => {
    if (status === "approved") return "Kontrol edildi";
    if (status === "sent_for_approval") return "Merkeze iletildi";
    return status || "-";
  };

  const splitLabel = (splitStatus) => {
    if (splitStatus === "ok") return "OK";
    if (splitStatus === "stale") return "Stale";
    return "none";
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal"
        style={{ width: "min(1100px, 96vw)", maxHeight: "86vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Ulke Onay Paketi Gonder</div>
          <button className="btn" onClick={onClose} disabled={applyLoading}>
            Kapat
          </button>
        </div>

        <div className="row" style={{ gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <select
            className="input sm"
            style={{ minWidth: 200 }}
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            disabled={yearsLoading || !years.length}
          >
            {!years.length ? (
              <option value="">Akademik yil yok</option>
            ) : (
              years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))
            )}
          </select>
          <label className="row small" style={{ gap: 6, alignItems: "center" }}>
            <span>Yil ortasi donemleri:</span>
            <select
              className="input sm"
              value={yearBasis}
              onChange={(e) => setYearBasis(e.target.value)}
              disabled={yearsLoading}
            >
              <option value="academic">Ayrik (2024-2025)</option>
              <option value="start">Baslangic yilina dahil</option>
              <option value="end">Bitis yilina dahil</option>
            </select>
          </label>
          <button className="btn" type="button" onClick={loadPreview} disabled={loading || !academicYear.trim()}>
            Onizleme
          </button>
          <input
            className="input sm"
            style={{ minWidth: 220 }}
            placeholder="Ara: okul veya senaryo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="row small" style={{ gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={hideIneligible}
              onChange={(e) => setHideIneligible(e.target.checked)}
            />
            <span>Uygun olmayanlari gizle</span>
          </label>
          <label className="row small" style={{ gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={hideSent}
              onChange={(e) => setHideSent(e.target.checked)}
            />
            <span>Gonderilenleri gizle</span>
          </label>
        </div>

        {guardDisabled ? (
          <div className="card" style={{ marginTop: 10, background: "#fff1f2", borderColor: "#fecaca" }}>
            <div style={{ fontWeight: 700 }}>
              Gider paylastirma guncel degil. Kaynak senaryolar guncellenmeden gonderim yapilamaz.
            </div>
            {staleSources.length ? (
              <div className="small" style={{ marginTop: 6 }}>
                {staleSources.map((row) => (
                  <div key={`${row.schoolId}-${row.scenarioId}`}>
                    {row.schoolName} - {row.scenarioName} ({row.yearText})
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {err ? (
          <div className="card" style={{ marginTop: 10, background: "#fff1f2", borderColor: "#fecaca" }}>
            {err}
          </div>
        ) : null}

        {!preview ? (
          <div className="card" style={{ marginTop: 10 }}>
            Once akademik yil girip onizleme alin.
          </div>
        ) : (
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Okul</th>
                  <th>Senaryo</th>
                  <th>Yil</th>
                  <th>Durum</th>
                  <th>Ilerleme</th>
                  <th>Split</th>
                  <th>Uygun</th>
                  <th>Nedenler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="small">Yukleniyor...</td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="small">Gosterilecek satir yok.</td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const reasons = Array.isArray(row.reasons) && row.reasons.length
                      ? row.reasons.join(", ")
                      : "-";
                    const hasProgress = row.progress !== null && row.progress !== undefined && Number.isFinite(Number(row.progress));
                    const progressText = hasProgress ? `${Math.round(Number(row.progress))}%` : "-";
                    return (
                      <tr key={`${row.schoolId}-${row.scenarioId || "none"}`}>
                        <td>{row.schoolName}</td>
                        <td>{row.scenarioName || "-"}</td>
                        <td>{row.academicYear || "-"}</td>
                        <td>{statusLabel(row.status)}</td>
                        <td>{progressText}</td>
                        <td>{splitLabel(row.splitStatus)}</td>
                        <td>{row.eligible ? "Evet" : "Hayir"}</td>
                        <td className="small">{reasons}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {applyResult ? (
          <div className="card" style={{ marginTop: 12, background: "#ecfeff", borderColor: "#cffafe" }}>
            <div style={{ fontWeight: 700 }}>Sonuc</div>
            <div className="small">
              Gonderilen senaryo sayisi: {applyResult.scenarioCount ?? 0} (Batch #{applyResult.batchId})
            </div>
          </div>
        ) : null}

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
          <button
            className="btn primary"
            onClick={handleApply}
            disabled={!preview?.canSubmit || guardDisabled || applyLoading}
          >
            {applyLoading ? "Gonderiliyor..." : "Merkeze Ilet"}
          </button>
        </div>
      </div>
    </div>
  );
}
