-- Migration: Add new scenario statuses and work item tracking
-- Adds new columns for sent timestamps and user tracking, introduces new
-- statuses for manager review workflow, and creates the scenario_work_items
-- table to track per‑module progress within a scenario.

-- Extend the status enum on school_scenarios to support the manager layer
-- of the workflow.  We retain the existing values for backward
-- compatibility but prefer the new values.  MySQL requires a full
-- definition of the ENUM type when adding new values.
ALTER TABLE school_scenarios
  MODIFY COLUMN status ENUM('draft','in_review','revision_requested','approved','sent_for_approval','submitted') NOT NULL DEFAULT 'draft';

-- Add columns to track when a scenario is sent for final approval and by
-- whom.  These fields allow the application to differentiate between
-- manager‑approved scenarios and scenarios that have been forwarded to
-- administrators for final approval.  When sent_at is NULL the
-- scenario.status='approved' represents a manager‑level approval; when
-- sent_at is non‑NULL the same status indicates the scenario is locked
-- pending or after an admin review.
ALTER TABLE school_scenarios
  ADD COLUMN sent_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN sent_by BIGINT NULL,
  ADD KEY fk_school_scenarios_sent_by (sent_by),
  ADD CONSTRAINT fk_school_scenarios_sent_by FOREIGN KEY (sent_by) REFERENCES users(id);

-- Create the scenario_work_items table.  Each scenario may contain
-- multiple work items corresponding to pages or sections (e.g.
-- gelirler.unit_fee).  The primary key consists of (scenario_id,
-- work_id) to enforce uniqueness.  A work item tracks its current
-- state, the underlying permission resource, timestamps for when
-- principals/HR submit their portion (submitted_at) and when a manager
-- reviews the item (reviewed_at), the last user to update the item, and
-- an optional manager comment.  The default state is 'not_started'.
CREATE TABLE scenario_work_items (
  scenario_id BIGINT NOT NULL,
  work_id VARCHAR(200) NOT NULL,
  resource VARCHAR(200) NOT NULL,
  state ENUM('not_started','in_progress','submitted','needs_revision','approved') NOT NULL DEFAULT 'not_started',
  updated_by BIGINT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP NULL DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  manager_comment TEXT,
  PRIMARY KEY (scenario_id, work_id),
  KEY idx_scenario_work_items_state (state),
  KEY fk_scenario_work_items_updated_by (updated_by),
  CONSTRAINT fk_scenario_work_items_scenario FOREIGN KEY (scenario_id) REFERENCES school_scenarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_scenario_work_items_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);