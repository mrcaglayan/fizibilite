-- Migration: add manager-level check tracking to scenarios
--
-- This migration introduces two new nullable columns on the
-- `school_scenarios` table to record when a scenario has been
-- checked (approved) by a manager or accountant.  The `checked_at`
-- column stores the timestamp of the approval and `checked_by` stores
-- a foreign key reference to the user who performed the check.  These
-- fields allow the application to distinguish between scenarios that
-- have been reviewed at the manager level (“Kontrol edildi”) and
-- those that have merely been submitted for review.  A supporting
-- foreign key ensures that `checked_by` references a valid user.

ALTER TABLE school_scenarios
  ADD COLUMN checked_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN checked_by BIGINT NULL,
  ADD KEY fk_school_scenarios_checked_by (checked_by),
  ADD CONSTRAINT fk_school_scenarios_checked_by FOREIGN KEY (checked_by) REFERENCES users(id);

-- Optional backfill: if legacy data contains sent_at values without
-- corresponding checked_at values, assume that the check occurred at
-- the time the scenario was sent to administrators.  Likewise copy
-- sent_by into checked_by for completeness.  This is safe to run
-- multiple times because it only fills NULL fields.
UPDATE school_scenarios
   SET checked_at = COALESCE(checked_at, sent_at),
       checked_by = COALESCE(checked_by, sent_by)
 WHERE sent_at IS NOT NULL;