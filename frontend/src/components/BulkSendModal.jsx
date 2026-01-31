import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";

function normalizeIdList(ids) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id))));
}

export default function BulkSendModal({ open, onClose, schoolIds }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [hideIneligible, setHideIneligible] = useState(false);
  const [hideSent, setHideSent] = useState(false);
  const [hideOlder, setHideOlder] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResults, setApplyResults] = useState(null);

  const schoolIdsKey = useMemo(
    () => normalizeIdList(schoolIds).sort().join(","),
    [schoolIds]
  );

  const loadPreview = useCallback(
    async ({ resetSelection = true, resetResults = true } = {}) => {
      if (!open) return;
      setErr("");
      setLoading(true);
      try {
        const data = await api.bulkSendPreview(normalizeIdList(schoolIds));
        setPreview(data || { rows: [] });
      } catch (e) {
        setErr(e.message || "Onizleme alinamadi");
      } finally {
        setLoading(false);
      }
      if (resetSelection) setSelected(new Set());
      if (resetResults) setApplyResults(null);
    },
    [open, schoolIds]
  );

  useEffect(() => {
    if (!open) return;
    loadPreview();
  }, [open, schoolIdsKey, loadPreview]);

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
      if (hideOlder && !row.isLatestKontrolEdildi) return false;
      if (!searchTerm) return true;
      const schoolName = String(row.schoolName || "").toLowerCase();
      const scenarioName = String(row.scenarioName || "").toLowerCase();
      return schoolName.includes(searchTerm) || scenarioName.includes(searchTerm);
    });
  }, [rows, hideIneligible, hideSent, hideOlder, searchTerm]);

  const toggleSelect = (scenarioId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = String(scenarioId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllEligible = () => {
    const next = new Set();
    rows.forEach((row) => {
      if (row.eligible) next.add(String(row.scenarioId));
    });
    setSelected(next);
  };

  const handleClearSelection = () => setSelected(new Set());

  const handleApply = async () => {
    if (!selected.size || applyLoading) return;
    setErr("");
    setApplyLoading(true);
    try {
      const scenarioIds = Array.from(selected).map((id) => Number(id));
      const data = await api.bulkSendApply(scenarioIds);
      setApplyResults(Array.isArray(data?.results) ? data.results : []);
      await loadPreview({ resetSelection: true, resetResults: false });
    } catch (e) {
      if (e.status === 409 && e.data?.bulkDisabledDueToStaleSource) {
        setPreview((prev) => ({
          ...(prev || {}),
          bulkDisabledDueToStaleSource: true,
          staleSources: Array.isArray(e.data?.staleSources) ? e.data.staleSources : [],
        }));
      } else {
        setErr(e.message || "Toplu gonderim basarisiz");
      }
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
    if (splitStatus === "stale") return "?? stale";
    return "none";
  };

  const selectedCount = selected.size;
  const resultsList = Array.isArray(applyResults) ? applyResults : [];
  const failedResults = resultsList.filter((r) => !r.ok);
  const successCount = resultsList.filter((r) => r.ok).length;
  const sendableRows = rows.filter((row) => !row.isSourceScenario);
  const allRowsReadyForBulkSend =
    sendableRows.length > 0 &&
    sendableRows.every(
      (row) =>
        row.eligible &&
        Number.isFinite(Number(row.progress)) &&
        Number(row.progress) >= 100 &&
        String(row.status || "") === "approved"
    );

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal"
        style={{ width: "min(1100px, 96vw)", maxHeight: "86vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Merkeze Gonder (Toplu)</div>
          <button className="btn" onClick={onClose} disabled={applyLoading}>
            Kapat
          </button>
        </div>

        {guardDisabled ? (
          <div className="card" style={{ marginTop: 10, background: "#fff1f2", borderColor: "#fecaca" }}>
            <div style={{ fontWeight: 700 }}>
              ?? Gider paylastirma güncel degil. Kaynak senaryolar güncellenmeden toplu gönderim yapilamaz.
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

        <div className="row" style={{ gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
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
          <label className="row small" style={{ gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={hideOlder}
              onChange={(e) => setHideOlder(e.target.checked)}
            />
            <span>Eski kontrol edilenleri gizle</span>
          </label>
          <button
            className="btn"
            type="button"
            onClick={handleSelectAllEligible}
            disabled={guardDisabled || loading}
          >
            Uygunlari Sec
          </button>
          <button className="btn" type="button" onClick={handleClearSelection} disabled={loading}>
            Temizle
          </button>
          <div className="small">Secili: {selectedCount}</div>
        </div>

        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
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
                  <td colSpan="9" className="small">Yukleniyor...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="9" className="small">Gosterilecek satir yok.</td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isSelected = selected.has(String(row.scenarioId));
                  const selectable = row.eligible;
                  const reasons = Array.isArray(row.reasons) && row.reasons.length
                    ? row.reasons.join(", ")
                    : "-";
                  const progressText = Number.isFinite(Number(row.progress))
                    ? `${Math.round(Number(row.progress))}%`
                    : "-";
                  return (
                    <tr key={`${row.schoolId}-${row.scenarioId}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!selectable}
                          onChange={() => toggleSelect(row.scenarioId)}
                        />
                      </td>
                      <td>{row.schoolName}</td>
                      <td>{row.scenarioName}</td>
                      <td>{row.yearText}</td>
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

        {resultsList.length ? (
          <div className="card" style={{ marginTop: 12, background: "#ecfeff", borderColor: "#cffafe" }}>
            <div style={{ fontWeight: 700 }}>Sonuclar</div>
            <div className="small">Basarili: {successCount} / Basarisiz: {failedResults.length}</div>
            {failedResults.length ? (
              <div className="small" style={{ marginTop: 6 }}>
                {failedResults.map((row) => (
                  <div key={`res-${row.scenarioId}`}>
                    #{row.scenarioId}: {(Array.isArray(row.reasons) && row.reasons.length)
                      ? row.reasons.join(", ")
                      : "Basarisiz"}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
          <button
            className="btn primary"
            onClick={handleApply}
            disabled={guardDisabled || !selectedCount || applyLoading || !allRowsReadyForBulkSend}
          >
            {applyLoading ? "Gonderiliyor..." : "Merkeze Ilet"}
          </button>
        </div>
      </div>
    </div>
  );
}