//frontend/src/pages/SchoolsPage.jsx


import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Button from "../components/ui/Button";
import { FaFolderOpen as FaOpen } from "react-icons/fa";
import ProgressBar from "../components/ui/ProgressBar";
import { computeScenarioProgress } from "../utils/scenarioProgress";

export default function SchoolsPage() {
  const auth = useAuth();
  const [schools, setSchools] = useState([]);
  const [err, setErr] = useState("");
  const [schoolProgress, setSchoolProgress] = useState({});
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressConfig, setProgressConfig] = useState(null);
  const isAssigned = auth.user?.country_id != null;

  useEffect(() => {
    document.title = "Schools · Feasibility Studio";
  }, []);

  const computeSchoolProgressForSchool = useCallback(async (schoolId) => {
    const scenarios = await api.listScenarios(schoolId);
    const list = Array.isArray(scenarios) ? scenarios : [];
    const active = list.filter((s) => s.status !== "approved");
    if (!list.length) {
      return { state: "empty", label: "Senaryo yok" };
    }
    if (!active.length) {
      return { state: "approved", label: "Tum senaryolar onayli" };
    }

    const latest = active
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    const [inputsData, normData] = await Promise.all([
      api.getScenarioInputs(schoolId, latest.id),
      api.getNormConfig(schoolId).catch(() => null),
    ]);

    const progress = computeScenarioProgress({
      inputs: inputsData?.inputs,
      norm: normData,
      config: progressConfig,
    });
    const tooltipLines = progress.missingDetailsLines.length
      ? ["Eksik:", ...progress.missingDetailsLines]
      : ["Tum tablar tamamlandi"];
    return { state: "active", pct: progress.pct, tooltipLines };
  }, [progressConfig]);

  const loadProgress = useCallback(async (rows) => {
    if (!Array.isArray(rows) || !rows.length) {
      setSchoolProgress({});
      return;
    }
    setProgressLoading(true);
    try {
      const progressRows = await Promise.all(
        rows.map(async (s) => {
          try {
            return await computeSchoolProgressForSchool(s.id);
          } catch (_) {
            return { state: "error", label: "Ilerleme hesaplanamadi" };
          }
        })
      );
      const map = {};
      rows.forEach((s, idx) => {
        map[s.id] = progressRows[idx];
      });
      setSchoolProgress(map);
    } finally {
      setProgressLoading(false);
    }
  }, [computeSchoolProgressForSchool]);

  const load = useCallback(async () => {
    setErr("");
    try {
      const rows = await api.listSchools();
      setSchools(rows);
      await loadProgress(rows);
    } catch (e) {
      setErr(e.message || "Failed to load schools");
    }
  }, [loadProgress]);

  useEffect(() => {
    if (!auth.user) return;
    if (!isAssigned) {
      setSchools([]);
      setErr("");
      setSchoolProgress({});
      setProgressLoading(false);
      setProgressConfig(null);
      return;
    }
    load();
  }, [auth.user, isAssigned, load]);

  useEffect(() => {
    let active = true;
    if (!auth.user || !isAssigned) return () => { };
    async function loadConfig() {
      try {
        const data = await api.getProgressRequirements();
        if (!active) return;
        setProgressConfig(data?.config || data || null);
      } catch (_) {
        if (!active) return;
        setProgressConfig(null);
      }
    }
    loadConfig();
    return () => {
      active = false;
    };
  }, [auth.user, isAssigned]);

  useEffect(() => {
    if (!schools.length) return;
    if (!progressConfig) return;
    loadProgress(schools);
  }, [progressConfig, schools, loadProgress]);

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>Okullar</div>
          <div className="small">Atanan okullariniz listelenir.</div>
        </div>
        <div className="row">
          {auth.user?.role === "admin" ? (
            <Button as={Link} variant="ghost" to="/admin">
              Admin
            </Button>
          ) : null}
          <Button as={Link} variant="ghost" to="/profile">
            Hesabım
          </Button>
          <Button variant="danger" onClick={() => auth.logout()}>
            Çıkış
          </Button>
        </div>
      </div>

      {err ? <div className="card" style={{ marginTop: 10, background: "#fff1f2", borderColor: "#fecaca" }}>{err}</div> : null}

      {!isAssigned && auth.user ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700 }}>Ülke ataması yapılması gerekir.</div>
          <div className="small" style={{ marginTop: 6 }}>
            Okul oluşturmanız için hesabınız ülke ataması yapılması gerekir. Lütfen yöneticiniz ile iletişime geçin.
          </div>
        </div>
      ) : null}


      {isAssigned ? (
        <div className="card" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Okul/Kampüs Adı</th>
                <th>Ilerleme</th>
                <th>Oluşturma Tarihi</th>
                <th>En son guncelleme</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {schools.length === 0 ? (
                <tr><td colSpan="5" className="small">Henuz okul tanimlanmamis. Lutfen yoneticiniz ile iletisime gecin.</td></tr>
              ) : schools.map(s => (
                <tr key={s.id}>
                  <td><b>{s.name}</b></td>
                  <td style={{ minWidth: 180 }}>
                    {schoolProgress[s.id] ? (
                      schoolProgress[s.id].state === "active" ? (
                        <ProgressBar
                          value={schoolProgress[s.id].pct}
                          tooltipLines={schoolProgress[s.id].tooltipLines}
                        />
                      ) : (
                        <div className="small">{schoolProgress[s.id].label || "-"}</div>
                      )
                    ) : (
                      <div className="small">{progressLoading ? "Hesaplaniyor..." : "-"}</div>
                    )}
                  </td>
                  <td className="small">{new Date(s.created_at).toLocaleString()}</td>
                  <td className="small">{new Date(s.updated_at || s.created_at).toLocaleString()}</td>
                  <td>
                    <div className="row">
                      <Button as={Link} variant="primary" size="sm" to={`/schools/${s.id}?open=1`}>
                        <FaOpen /> Aç
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {auth.user?.role === "admin" ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="small">
            Okullari ulkelere gore Admin panelinden yonetebilirsiniz.
          </div>
        </div>
      ) : null}
    </div>
  );
}
