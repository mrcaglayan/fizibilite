-- Rollup/report queries filter by academic_year first
ALTER TABLE school_reporting_scenarios
  ADD KEY idx_srs_academic_year_school (academic_year, school_id);

-- Speed up /schools pagination + sorting within a country
ALTER TABLE schools
  ADD KEY idx_schools_country_status_created (country_id, status, created_at, id);

-- Speed up principal school listing (search by user first)
ALTER TABLE school_user_roles
  ADD KEY idx_sur_user_role_school (user_id, role, school_id);

-- Speed up manager user listing (country filter + name sort)
ALTER TABLE users
  ADD KEY idx_users_country_full_name (country_id, full_name, id);

-- Optional: admin scenario queue often filters by academic_year without status
ALTER TABLE school_scenarios
  ADD KEY idx_scenarios_academic_year_created (academic_year, created_at, id);
