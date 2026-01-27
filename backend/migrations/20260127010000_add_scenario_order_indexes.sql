ALTER TABLE school_scenarios
  ADD KEY idx_scenarios_school_created_at (school_id, created_at, id),
  ADD KEY idx_scenarios_status_submitted_created (status, submitted_at, created_at, id);
