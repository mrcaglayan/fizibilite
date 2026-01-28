//frontend/src/pages/SchoolsPage.jsx


import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Link, useOutletContext } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Button from "../components/ui/Button";
import { FaFolderOpen as FaOpen } from "react-icons/fa";
import ProgressBar from "../components/ui/ProgressBar";

const SCENARIO_PREFETCH_PARAMS = {
  limit: 50,
  offset: 0,
  fields: "brief",
  order: "created_at:desc",
};

export default function SchoolsPage() {
  const auth = useAuth();
  const outlet = useOutletContext();
  const queryClient = useQueryClient();
  const prefetchedFirstRef = useRef(false);
  const [schools, setSchools] = useState([]);
  const [err, setErr] = useState("");
  const [schoolProgress, setSchoolProgress] = useState({});
  const [progressLoading, setProgressLoading] = useState(false);
  const isAssigned = auth.user?.country_id != null;

  useEffect(() => {
    document.title = "Schools · Feasibility Studio";
  }, []);

  useEffect(() => {
    if (!outlet?.setHeaderMeta) return;
    // Ensure the header layout matches the school pages (e.g. Temel Bilgiler) by centering
    // the title and placing the "Okul / Senaryo Değiştir" button consistently.
    // Without the `centered` flag the top bar uses a left‑aligned layout which causes
    // the switch button to appear misaligned on the dashboard compared to other pages.
    outlet.setHeaderMeta({
      title: "Okullar",
      subtitle: "Atanan okullarınız listelenir.",
      centered: true,
    });
    return () => outlet.clearHeaderMeta?.();
  }, [outlet]);

  const loadProgress = useCallback(async (rows) => {
    if (!Array.isArray(rows) || !rows.length) {
      setSchoolProgress({});
      return;
    }
    setProgressLoading(true);
    try {
      const ids = rows.map((s) => s.id);
      const data = await api.getSchoolsProgressBulk(ids);
      const map = data?.progressBySchoolId && typeof data.progressBySchoolId === "object"
        ? data.progressBySchoolId
        : {};
      setSchoolProgress(map);
    } catch (_) {
      const fallback = {};
      rows.forEach((s) => {
        fallback[s.id] = { state: "error", label: "İlerleme hesaplanamadı" };
      });
      setSchoolProgress(fallback);
    } finally {
      setProgressLoading(false);
    }
  }, []);

  const prefetchScenarios = useCallback(
    (schoolId) => {
      if (!schoolId) return;
      queryClient.prefetchQuery({
        queryKey: ["scenarios", schoolId, SCENARIO_PREFETCH_PARAMS],
        queryFn: () => api.listScenarios(schoolId, SCENARIO_PREFETCH_PARAMS),
        staleTime: 60_000,
      });
    },
    [queryClient]
  );

  const load = useCallback(async () => {
    setErr("");
    try {
      const data = await api.listSchools({
        limit: 50,
        offset: 0,
        fields: "brief",
        order: "name:asc",
      });
      const rows = Array.isArray(data?.items) ? data.items : [];
      setSchools(rows);
    } catch (e) {
      setErr(e.message || "Failed to load schools");
    }
  }, []);

  useEffect(() => {
    if (!auth.user) return;
    if (!isAssigned) {
      setSchools([]);
      setErr("");
      setSchoolProgress({});
      setProgressLoading(false);
      return;
    }
    load();
  }, [auth.user, isAssigned, load]);

  useEffect(() => {
    if (!schools.length) return;
    loadProgress(schools);
  }, [schools, loadProgress]);

  useEffect(() => {
    if (!schools.length || prefetchedFirstRef.current) return;
    prefetchScenarios(schools[0]?.id);
    prefetchedFirstRef.current = true;
  }, [schools, prefetchScenarios]);

  return (
    <div className="container">
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
                      <Button
                        as={Link}
                        variant="primary"
                        size="sm"
                        to={`/select?schoolId=${s.id}`}
                        onMouseEnter={() => prefetchScenarios(s.id)}
                      >
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
