// frontend/src/pages/ManagerReviewQueuePage.jsx

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { writeGlobalLastRouteSegment, writeLastVisitedPath, writeSelectedScenarioId } from '../utils/schoolNavStorage';

/**
 * ManagerReviewQueuePage
 *
 * Displays a list of scenarios grouped by school for manager review.  Managers,
 * accountants, admins, or users granted the manage_permissions permission can
 * access this page.  The page lists each scenario's required modules and
 * allows the reviewer to approve or request revision for submitted modules.
 * When all required modules are approved, the reviewer can forward the
 * scenario to administrators for final approval via the "Onaya Gönder"
 * button.  The list refreshes automatically after each action.
 */

// Define the stable required work item identifiers and their friendly labels.
const REQUIRED_WORK_IDS = [
  'temel_bilgiler',
  'kapasite',
  'norm.ders_dagilimi',
  'ik.local_staff',
  'gelirler.unit_fee',
  'giderler.isletme',
];

const WORK_ID_LABELS = {
  'temel_bilgiler': 'Temel Bilgiler',
  'kapasite': 'Kapasite',
  'norm.ders_dagilimi': 'Norm',
  'ik.local_staff': 'İK',
  'gelirler.unit_fee': 'Gelirler',
  'giderler.isletme': 'Giderler',
};

const WORK_ID_TO_ROUTE = {
  'temel_bilgiler': 'temel-bilgiler',
  'kapasite': 'kapasite',
  'norm.ders_dagilimi': 'norm',
  'ik.local_staff': 'ik',
  'gelirler.unit_fee': 'gelirler',
  'giderler.isletme': 'giderler',
};

const FILTER_TABS = [
  { key: 'all', label: 'TÃ¼mÃ¼' },
  { key: 'ready', label: 'Merkeze Ä°letmeye HazÄ±r' },
  { key: 'in_review', label: 'Ä°ncelemede' },
  { key: 'revision', label: 'Revize Ä°stendi' },
  { key: 'approved', label: 'Kontrol Edildi' },
  { key: 'sent', label: 'Merkeze Ä°letildi' },
  { key: 'approved_final', label: 'OnaylandÄ±' },
];

// Map scenario status and sent_at to visual badge metadata.  A scenario
// that is approved but has not yet been forwarded to administrators
// (sent_at is null) is considered manager-approved (“Kontrol edildi”).
function getScenarioStatusMeta(scenario) {
  const status = scenario?.status;
  const sentAt = scenario?.sent_at;
  switch (status) {
    case 'revision_requested':
      return { label: 'Revize İstendi', className: 'is-bad' };
    case 'sent_for_approval':
      return { label: 'Merkeze iletildi', className: 'is-warn' };
    case 'approved':
      if (sentAt) {
        return { label: 'Onaylandı', className: 'is-ok' };
      }
      return { label: 'Kontrol edildi', className: 'is-ok' };
    case 'in_review':
      return { label: 'İncelemede', className: 'is-warn' };
    case 'submitted':
      return { label: 'Onayda', className: 'is-warn' };
    default:
      return { label: 'Taslak', className: 'is-muted' };
  }
}

// Map work item states to badge metadata.
function getWorkItemStateMeta(state) {
  switch (state) {
    case 'approved':
      // Manager approval of a work item is tracked as "Kontrol edildi"
      return { label: 'Kontrol edildi', className: 'is-ok' };
    case 'needs_revision':
      return { label: 'Revize İstendi', className: 'is-bad' };
    case 'submitted':
      return { label: 'İncelemede', className: 'is-warn' };
    case 'in_progress':
      return { label: 'Hazırlanıyor', className: 'is-warn' };
    default:
      return { label: 'Başlanmadı', className: 'is-muted' };
  }
}

export default function ManagerReviewQueuePage() {
  const auth = useAuth();
  const outlet = useOutletContext();
  const navigate = useNavigate();
  const [queueData, setQueueData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [collapsedCards, setCollapsedCards] = useState({});

  // Determine whether the current user is allowed to view the review queue.
  const canView = useMemo(() => {
    const role = auth.user?.role;
    if (role === 'admin' || role === 'manager' || role === 'accountant') return true;
    const perms = auth.user?.permissions;
    if (!Array.isArray(perms)) return false;
    return perms.some(
      (p) =>
        p.resource === 'page.manage_permissions' &&
        (p.action === 'read' || p.action === 'write')
    );
  }, [auth.user]);

  // Configure the top bar header on mount.  Align text to center per spec.
  useEffect(() => {
    outlet?.setHeaderMeta?.({
      title: 'Review Queue',
      subtitle: 'Modül onay kuyruğu',
      centered: true,
    });
    return () => {
      outlet?.clearHeaderMeta?.();
    };
  }, [outlet]);

  // Load the queue.  Fetch schools, then scenarios for each school, then work items.
  const loadQueue = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const results = await api.managerGetReviewQueue();
      setQueueData(Array.isArray(results) ? results : []);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const matchFilter = useCallback((entry, filterKey) => {
    if (!entry) return false;
    const scenario = entry.scenario || {};
    const status = scenario.status;
    const sentAt = scenario.sent_at;
    const approvedCount = Number(entry.approvedCount || 0);
    const allApproved = approvedCount === REQUIRED_WORK_IDS.length;
    const isManagerApproved = status === 'approved' && !sentAt;
    const isFinalApproved = status === 'approved' && !!sentAt;
    switch (filterKey) {
      case 'ready':
        return isManagerApproved && allApproved;
      case 'in_review':
        return status === 'in_review' || status === 'submitted';
      case 'revision':
        return status === 'revision_requested';
      case 'approved':
        return isManagerApproved;
      case 'sent':
        return status === 'sent_for_approval';
      case 'approved_final':
        return isFinalApproved;
      case 'all':
      default:
        return true;
    }
  }, []);

  const filterCounts = useMemo(() => {
    const base = Object.fromEntries(FILTER_TABS.map((t) => [t.key, 0]));
    base.all = Array.isArray(queueData) ? queueData.length : 0;
    if (!Array.isArray(queueData)) return base;
    queueData.forEach((entry) => {
      FILTER_TABS.forEach((tab) => {
        if (tab.key === 'all') return;
        if (matchFilter(entry, tab.key)) base[tab.key] += 1;
      });
    });
    return base;
  }, [queueData, matchFilter]);

  const filteredRows = useMemo(() => {
    if (!Array.isArray(queueData)) return [];
    if (activeFilter === 'all') return queueData;
    return queueData.filter((entry) => matchFilter(entry, activeFilter));
  }, [queueData, activeFilter, matchFilter]);

  const handleNavigateToModule = useCallback(
    (schoolId, scenarioId, workId) => {
      const segment = WORK_ID_TO_ROUTE[workId];
      if (!segment) return;
      writeSelectedScenarioId(schoolId, scenarioId);
      writeLastVisitedPath(schoolId, scenarioId, segment);
      writeGlobalLastRouteSegment(segment);
      navigate(`/schools/${schoolId}/${segment}`);
    },
    [navigate]
  );

  // Handlers for approving or revising a work item
  const handleApprove = async (schoolId, scenarioId, workId) => {
    try {
      await api.reviewWorkItem(schoolId, scenarioId, workId, { action: 'approve' });
      toast.success('Onaylandı');
      loadQueue();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Failed to approve work item');
    }
  };

  const handleRevise = async (schoolId, scenarioId, workId) => {
    // Prompt the reviewer for a comment.  Use the browser prompt for simplicity.
    const comment = window.prompt('Revizyon notu (opsiyonel):');
    if (comment === undefined) return;
    try {
      await api.reviewWorkItem(schoolId, scenarioId, workId, {
        action: 'revise',
        comment: comment && comment.trim() ? comment.trim() : undefined,
      });
      toast.success('Revizyon istendi');
      loadQueue();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Failed to request revision');
    }
  };

  // Handler for sending a scenario for admin approval
  const handleSendForApproval = async (schoolId, scenarioId) => {
    try {
      const calcRes = await api.calculateScenario(schoolId, scenarioId);
      if (!calcRes || !calcRes.results) {
        toast.error('Hesaplama tamamlanamadı');
        return;
      }
      await api.sendForApproval(schoolId, scenarioId);
      toast.success('Merkeze iletildi');
      loadQueue();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Failed to send for approval');
    }
  };

  // Group results by school for rendering
  const grouped = useMemo(() => {
    const bySchool = {};
    for (const entry of filteredRows) {
      const sid = String(entry.school.id);
      if (!bySchool[sid]) bySchool[sid] = { school: entry.school, scenarios: [] };
      bySchool[sid].scenarios.push(entry);
    }
    return Object.values(bySchool);
  }, [filteredRows]);

  if (!canView) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ fontWeight: 700 }}>Access Denied</div>
          <div className="small" style={{ marginTop: 6 }}>
            You do not have permission to view the review queue.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="review-queue-tabs" role="tablist" aria-label="Senaryo filtresi">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`review-queue-tab ${activeFilter === tab.key ? 'is-active' : ''}`}
            onClick={() => setActiveFilter(tab.key)}
            role="tab"
            aria-selected={activeFilter === tab.key}
          >
            <span>{tab.label}</span>
            <span className="review-queue-count">{filterCounts[tab.key] ?? 0}</span>
          </button>
        ))}
      </div>
      {loading ? (
        <div className="card">Loading...</div>
      ) : grouped.length === 0 ? (
        <div className="card">
          <div>No scenarios to review</div>
        </div>
      ) : (
        grouped.map(({ school, scenarios }) => (
          <div key={school.id} style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{school.name}</div>
            {scenarios.map(({ scenario, requiredItems, approvedCount }) => {
              const statusMeta = getScenarioStatusMeta(scenario);
              const allApproved = approvedCount === REQUIRED_WORK_IDS.length;
              const isCollapsed = collapsedCards[scenario.id] ?? true;
              return (
                <div key={scenario.id} className="card" style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 600 }}>
                        {scenario.name} ({scenario.academic_year})
                      </div>
                      <span className={`status-badge ${statusMeta.className}`}>{statusMeta.label}</span>
                      <span className="small is-muted">{approvedCount}/{REQUIRED_WORK_IDS.length} onaylandı</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className="btn sm review-queue-toggle"
                        type="button"
                        onClick={() =>
                          setCollapsedCards((prev) => ({
                            ...prev,
                            [scenario.id]: !(prev[scenario.id] ?? true),
                          }))
                        }
                        title={isCollapsed ? 'Detaylari ac' : 'Detaylari kapat'}
                      >
                        {isCollapsed ? 'Ac' : 'Kapat'}
                      </button>
                      <button
                        className="btn primary"
                        type="button"
                        onClick={() => handleSendForApproval(school.id, scenario.id)}
                        disabled={!allApproved || scenario.status !== 'approved' || scenario.sent_at != null}
                        title={!allApproved
                          ? 'Tüm modüller tamamlanmalı'
                          : scenario.status !== 'approved' || scenario.sent_at
                            ? 'Durum izin vermiyor'
                            : undefined}
                      >
                        Merkeze ilet
                      </button>
                    </div>
                  </div>
                  <div className={`review-queue-card-body ${isCollapsed ? "is-collapsed" : "is-open"}`}>
                    <div className="review-queue-card-inner">
                       <table className="table">
                         <thead>
                           <tr>
                             <th>Modül</th>
                             <th>Durum</th>
                             <th>Gönderildi</th>
                             <th>Yorum</th>
                             <th>Aksiyon</th>
                           </tr>
                         </thead>
                         <tbody>
                      {requiredItems.map(({ workId, item }) => {
                        const state = item?.state || 'not_started';
                        const meta = getWorkItemStateMeta(state);
                        const submittedAt = item?.submitted_at
                          ? new Date(item.submitted_at).toLocaleString()
                          : '-';
                        const comment = item?.manager_comment || '-';
                        const canApprove = state === 'submitted';
                        const canRevise = state === 'submitted';
                        const canNavigate = Boolean(WORK_ID_TO_ROUTE[workId]);
                        return (
                          <tr key={workId} className={state === 'submitted' ? 'highlight-row' : ''}>
                            <td>
                              {canNavigate ? (
                                <button
                                  type="button"
                                  className="review-queue-module-link"
                                  onClick={() => handleNavigateToModule(school.id, scenario.id, workId)}
                                  title="ModÃ¼le git"
                                >
                                  {WORK_ID_LABELS[workId] || workId}
                                </button>
                              ) : (
                                WORK_ID_LABELS[workId] || workId
                              )}
                            </td>
                            <td>
                              <span className={`status-badge ${meta.className}`}>{meta.label}</span>
                            </td>
                            <td className="small">{submittedAt}</td>
                            <td className="small" style={{ maxWidth: 200, whiteSpace: 'pre-wrap' }}>{comment}</td>
                            <td>
                              {canApprove ? (
                                <button
                                  className="btn sm primary"
                                  type="button"
                                  onClick={() => handleApprove(school.id, scenario.id, workId)}
                                >
                                  Onayla
                                </button>
                              ) : null}
                              {canRevise ? (
                                <button
                                  className="btn sm danger"
                                  type="button"
                                  onClick={() => handleRevise(school.id, scenario.id, workId)}
                                  style={{ marginLeft: 4 }}
                                >
                                  Revizyon İste
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                         </tbody>
                       </table>
                    </div>
                  </div>
                  {isCollapsed ? (
                    <div className="small muted review-queue-collapsed-hint">
                      Detaylari gormek icin acin.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
