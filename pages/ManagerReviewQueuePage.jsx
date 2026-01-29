// frontend/src/pages/ManagerReviewQueuePage.jsx

import React, { useEffect, useState, useMemo, useCallback, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaCheck, FaCheckCircle, FaExclamationTriangle, FaPaperPlane, FaSearch, FaStar, FaThLarge } from 'react-icons/fa';
import { api } from '../api';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { useAuth } from '../auth/AuthContext';
import { writeGlobalLastRouteSegment, writeLastVisitedPath, writeSelectedScenarioId } from '../utils/schoolNavStorage';

/**
 * ManagerReviewQueuePage
 *
 * Displays a list of scenarios for manager review.  Managers,
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
  { key: 'all', label: 'Tümü' },
  { key: 'ready', label: 'Merkeze İletilmeye Hazır' },
  { key: 'in_review', label: 'İncelemede' },
  { key: 'revision', label: 'Revize İstendi' },
  { key: 'approved', label: 'Kontrol Edildi' },
  { key: 'sent', label: 'Merkeze İletildi' },
  { key: 'approved_final', label: 'Onaylandı' },
];

const FILTER_TAB_ICONS = {
  all: FaThLarge,
  ready: FaCheckCircle,
  in_review: FaSearch,
  revision: FaExclamationTriangle,
  approved: FaCheck,
  sent: FaPaperPlane,
  approved_final: FaStar,
};


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
  const [activeCard, setActiveCard] = useState(null);
  const modalRef = useRef(null);
  const motionId = useId();
  const tabsId = useId();

  const closeModal = useCallback(() => setActiveCard(null), []);
  useOutsideClick(modalRef, closeModal, Boolean(activeCard));

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        closeModal();
      }
    }

    if (activeCard && typeof activeCard === 'object') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeCard, closeModal]);


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

  const activeTabIndex = Math.max(
    0,
    FILTER_TABS.findIndex((tab) => tab.key === activeFilter)
  );

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

  const handleTabKeyDown = useCallback((event, tabKey) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveFilter(tabKey);
    }
  }, []);

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

  const activeScenario = activeCard?.scenario;
  const activeSchool = activeCard?.school;
  const activeStatusMeta = activeScenario ? getScenarioStatusMeta(activeScenario) : null;
  const activeAllApproved = activeCard ? activeCard.approvedCount === REQUIRED_WORK_IDS.length : false;

  return (
    <div className="container">
      <AnimatePresence>
        {activeCard && typeof activeCard === 'object' ? (
          <motion.div
            key="rq-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rq-overlay"
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {activeCard && typeof activeCard === 'object' ? (
          <div className="rq-modal-wrap" role="dialog" aria-modal="true" aria-label="Scenario details">
            <motion.button
              key={`rq-close-${activeScenario?.id}-${motionId}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="rq-close-btn"
              type="button"
              onClick={closeModal}
              aria-label="Close"
            >
              <CloseIcon />
            </motion.button>

            <motion.div
              layoutId={`rq-card-${activeScenario?.id}-${motionId}`}
              ref={modalRef}
              className="card rq-modal"
            >
              <div className="rq-modal-head">
                <motion.div
                  layoutId={`rq-thumb-${activeScenario?.id}-${motionId}`}
                  className="rq-thumb rq-thumb--lg"
                >
                  {getScenarioInitials(activeScenario)}
                </motion.div>

                <div className="rq-modal-head-text">
                  <motion.div
                    layoutId={`rq-title-${activeScenario?.id}-${motionId}`}
                    className="rq-title rq-title--lg"
                  >
                    {activeScenario?.name} ({activeScenario?.academic_year})
                  </motion.div>
                  <div className="rq-subtitle">{activeSchool?.name}</div>
                </div>

                <div className="rq-modal-top-actions">
                  {activeStatusMeta ? (
                    <span className={`status-badge ${activeStatusMeta.className}`}>{activeStatusMeta.label}</span>
                  ) : null}
                  {activeCard ? (
                    <span className="small is-muted">
                      {activeCard.approvedCount}/{REQUIRED_WORK_IDS.length} onaylandı
                    </span>
                  ) : null}

                  <button
                    className="btn sm primary"
                    type="button"
                    onClick={() => handleSendForApproval(activeSchool.id, activeScenario.id)}
                    disabled={!activeAllApproved || activeScenario?.status !== 'approved' || activeScenario?.sent_at != null}
                    title={
                      !activeAllApproved
                        ? 'Tüm modüller tamamlanmalı'
                        : activeScenario?.status !== 'approved' || activeScenario?.sent_at
                        ? 'Durum izin vermiyor'
                        : undefined
                    }
                  >
                    Merkeze ilet
                  </button>
                </div>
              </div>

              <div className="rq-modal-body">
                <div className="small is-muted" style={{ marginBottom: 10 }}>
                  Modülleri inceleyin. &ldquo;Gönderildi&rdquo; durumundaki modüller için <b>Onayla</b> veya{' '}
                  <b>Revizyon İste</b> kullanın.
                </div>

                <div className="review-queue-card-inner">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Modül</th>
                        <th>Durum</th>
                        <th>Gönderildi</th>
                        <th>Yorum</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {activeCard?.requiredItems?.map(({ workId, item }) => {
                        const state = item?.state || 'not_started';
                        const meta = getWorkItemStateMeta(state);
                        const submittedAt = item?.submitted_at ? new Date(item.submitted_at).toLocaleString() : '-';
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
                                  onClick={() => {
                                    closeModal();
                                    handleNavigateToModule(activeSchool.id, activeScenario.id, workId);
                                  }}
                                  title="Modüle git"
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
                            <td className="small" style={{ maxWidth: 260, whiteSpace: 'pre-wrap' }}>
                              {comment}
                            </td>
                            <td>
                              {canApprove ? (
                                <button
                                  className="btn sm primary"
                                  type="button"
                                  onClick={() => handleApprove(activeSchool.id, activeScenario.id, workId)}
                                >
                                  Onayla
                                </button>
                              ) : null}
                              {canRevise ? (
                                <button
                                  className="btn sm danger"
                                  type="button"
                                  onClick={() => handleRevise(activeSchool.id, activeScenario.id, workId)}
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
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <section
        className="review-queue-tabs"
        style={{
          '--rq-tab-count': FILTER_TABS.length,
          '--rq-active-index': activeTabIndex,
        }}
      >
        {FILTER_TABS.map((tab) => {
          const inputId = `${tabsId}-${tab.key}`;
          return (
            <input
              key={inputId}
              id={inputId}
              type="radio"
              name={`review-queue-filter-${tabsId}`}
              className="rq-tab-input"
              checked={activeFilter === tab.key}
              onChange={() => setActiveFilter(tab.key)}
            />
          );
        })}

        <nav className="rq-tab-nav" role="tablist" aria-label="Senaryo filtresi">
          {FILTER_TABS.map((tab) => {
            const inputId = `${tabsId}-${tab.key}`;
            const isActive = activeFilter === tab.key;
            const Icon = FILTER_TAB_ICONS[tab.key];
            return (
              <label
                key={tab.key}
                htmlFor={inputId}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                className={`review-queue-tab ${isActive ? 'is-active' : ''}`}
                onKeyDown={(event) => handleTabKeyDown(event, tab.key)}
              >
                <span className="rq-tab-icon">{Icon ? <Icon aria-hidden="true" /> : null}</span>
                <span className="rq-tab-text">{tab.label}</span>
                <span className="review-queue-count">{filterCounts[tab.key] ?? 0}</span>
              </label>
            );
          })}
        </nav>
      </section>

      {loading ? (
        <div className="card">Loading...</div>
      ) : filteredRows.length === 0 ? (
        <div className="card">
          <div>No scenarios to review</div>
        </div>
      ) : (
        <div className="review-queue-cards">
          {filteredRows.map(({ school, scenario, requiredItems, approvedCount }) => {
            const statusMeta = getScenarioStatusMeta(scenario);
            const allApproved = approvedCount === REQUIRED_WORK_IDS.length;

            const cardPayload = { school, scenario, requiredItems, approvedCount };

            return (
              <motion.div
                key={scenario.id}
                layoutId={`rq-card-${scenario.id}-${motionId}`}
                className="card rq-card-compact"
                onClick={() => setActiveCard(cardPayload)}
              >
                <div className="rq-compact-row">
                  <div className="rq-compact-left">
                    <motion.div
                      layoutId={`rq-thumb-${scenario.id}-${motionId}`}
                      className="rq-thumb"
                    >
                      {getScenarioInitials(scenario)}
                    </motion.div>

                    <div>
                      <div className="rq-kicker">{school?.name}</div>
                      <motion.div
                        layoutId={`rq-title-${scenario.id}-${motionId}`}
                        className="rq-title"
                      >
                        {scenario.name} ({scenario.academic_year})
                      </motion.div>

                      <div className="rq-subtitle">
                        <span className={`status-badge ${statusMeta.className}`}>{statusMeta.label}</span>
                        <span className="small is-muted" style={{ marginLeft: 8 }}>
                          {approvedCount}/{REQUIRED_WORK_IDS.length} onaylandı
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rq-actions">
                    <button
                      type="button"
                      className="rq-open-pill"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveCard(cardPayload);
                      }}
                    >
                      İncele
                    </button>

                    <button
                      className="btn sm primary"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSendForApproval(school.id, scenario.id);
                      }}
                      disabled={!allApproved || scenario.status !== 'approved' || scenario.sent_at != null}
                      title={
                        !allApproved
                          ? 'Tüm modüller tamamlanmalı'
                          : scenario.status !== 'approved' || scenario.sent_at
                          ? 'Durum izin vermiyor'
                          : undefined
                      }
                    >
                      Merkeze ilet
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <motion.svg
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.05 } }}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="rq-close-icon"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </motion.svg>
  );
}

function getScenarioInitials(scenario) {
  const name = String(scenario?.name || '').trim();
  if (!name) return 'S';
  const parts = name.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || 'S';
  const b = parts[1]?.[0] || '';
  return (a + b).toUpperCase();
}
