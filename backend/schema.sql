-- Feasibility App (School-level) - MySQL 8+
-- Create database
CREATE DATABASE IF NOT EXISTS feasibility_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE feasibility_app;


CREATE TABLE `countries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `region` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `full_name` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `must_reset_password` tinyint(1) NOT NULL DEFAULT '0',
  `country_id` bigint DEFAULT NULL,
  `region` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `country_id` (`country_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `schools` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `country_id` bigint NOT NULL,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `closed_at` timestamp NULL DEFAULT NULL,
  `closed_by` bigint DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_schools_country` (`country_id`),
  KEY `fk_schools_closed_by` (`closed_by`),
  KEY `fk_schools_updated_by` (`updated_by`),
  KEY `idx_schools_country_status` (`country_id`,`status`),
  KEY `idx_schools_status` (`status`),
  CONSTRAINT `fk_schools_closed_by` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_schools_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `schools_ibfk_1` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`),
  CONSTRAINT `schools_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `school_norm_configs` (
  `school_id` bigint NOT NULL,
  `teacher_weekly_max_hours` decimal(6,2) NOT NULL DEFAULT '24.00',
  `curriculum_weekly_hours_json` json NOT NULL,
  `updated_by` bigint NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`school_id`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `school_norm_configs_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `school_norm_configs_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `school_scenarios` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `academic_year` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `input_currency` enum('USD','LOCAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `local_currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fx_usd_to_local` decimal(18,6) DEFAULT NULL,
  `program_type` enum('local','international') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'local',
  -- Status codes for the scenario workflow.  New values have been added to
  -- support a manager review step and a final approval gate.  The
  -- 'submitted' value is retained for backward compatibility but is
  -- superseded by 'in_review' and 'sent_for_approval'.
  `status` enum('draft','in_review','revision_requested','approved','sent_for_approval','submitted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `submitted_at` timestamp NULL DEFAULT NULL,
  `submitted_by` bigint DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `reviewed_by` bigint DEFAULT NULL,
  `review_note` text COLLATE utf8mb4_unicode_ci,
  -- When a scenario is forwarded by a manager for final approval, the
  -- sent_at and sent_by columns capture the time and actor.  A NULL
  -- sent_at indicates that a manager-approved scenario is still open
  -- for edits; when non‑NULL the scenario is locked pending final
  -- admin review.
  `sent_at` timestamp NULL DEFAULT NULL,
  `sent_by` bigint DEFAULT NULL,
  -- When a manager approves a scenario ("Kontrol edildi"), these
  -- columns capture the time at which the check occurred and the
  -- identifier of the user who performed the check.  A NULL value
  -- indicates the scenario has not yet been checked this review
  -- cycle.
  `checked_at` timestamp NULL DEFAULT NULL,
  `checked_by` bigint DEFAULT NULL,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `progress_pct` decimal(5,2) DEFAULT NULL,
  `progress_json` json DEFAULT NULL,
  `progress_calculated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_scenarios_school` (`school_id`),
  KEY `idx_scenarios_school_created_at` (`school_id`,`created_at`,`id`),
  KEY `idx_scenarios_status_submitted_created` (`status`,`submitted_at`,`created_at`,`id`),
  KEY `fk_scenarios_submitted_by` (`submitted_by`),
  KEY `fk_scenarios_reviewed_by` (`reviewed_by`),
  KEY `fk_school_scenarios_sent_by` (`sent_by`),
  KEY `fk_school_scenarios_checked_by` (`checked_by`),
  UNIQUE KEY `uniq_scenarios_school_year` (`school_id`,`academic_year`),
  KEY `idx_scenarios_status_year` (`status`,`academic_year`),
  CONSTRAINT `fk_scenarios_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_scenarios_submitted_by` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_school_scenarios_sent_by` FOREIGN KEY (`sent_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_school_scenarios_checked_by` FOREIGN KEY (`checked_by`) REFERENCES `users` (`id`),
  CONSTRAINT `school_scenarios_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `school_scenarios_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `scenario_norm_configs` (
  `scenario_id` bigint NOT NULL,
  `teacher_weekly_max_hours` decimal(6,2) NOT NULL DEFAULT '24.00',
  `curriculum_weekly_hours_json` json NOT NULL,
  `updated_by` bigint NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`scenario_id`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `scenario_norm_configs_ibfk_1` FOREIGN KEY (`scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `scenario_norm_configs_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Migration helper:
-- ALTER TABLE school_scenarios
--   ADD COLUMN input_currency ENUM('USD','LOCAL') NOT NULL DEFAULT 'USD',
--   ADD COLUMN local_currency_code VARCHAR(10) NULL,
--   ADD COLUMN fx_usd_to_local DECIMAL(18,6) NULL;

-- Migration helper (uniqueness per school+academic_year):
-- ALTER TABLE school_scenarios DROP INDEX idx_scenarios_school_year;
-- ALTER TABLE school_scenarios ADD UNIQUE KEY uniq_scenarios_school_year (school_id, academic_year);


CREATE TABLE `school_reporting_scenarios` (
  `school_id` bigint NOT NULL,
  `academic_year` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scenario_id` bigint NOT NULL,
  `included_years` set('y1','y2','y3') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'y1,y2,y3',
  `approved_by` bigint DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`school_id`,`academic_year`),
  UNIQUE KEY `uniq_reporting_scenario` (`scenario_id`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `school_reporting_scenarios_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `school_reporting_scenarios_ibfk_2` FOREIGN KEY (`scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `school_reporting_scenarios_ibfk_3` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `progress_requirements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `country_id` bigint NOT NULL,
  `config_json` json NOT NULL,
  `updated_by` bigint DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `country_id` (`country_id`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `progress_requirements_ibfk_1` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `progress_requirements_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `scenario_inputs` (
  `scenario_id` bigint NOT NULL,
  `inputs_json` json NOT NULL,
  `updated_by` bigint NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`scenario_id`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `scenario_inputs_ibfk_1` FOREIGN KEY (`scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `scenario_inputs_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `scenario_kpis` (
  `scenario_id` bigint NOT NULL,
  `academic_year` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `year_key` enum('y1','y2','y3') COLLATE utf8mb4_unicode_ci NOT NULL,
  `net_ciro` decimal(18,2) NOT NULL DEFAULT '0.00',
  `net_income` decimal(18,2) NOT NULL DEFAULT '0.00',
  `total_expenses` decimal(18,2) NOT NULL DEFAULT '0.00',
  `net_result` decimal(18,2) NOT NULL DEFAULT '0.00',
  `students_total` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`scenario_id`,`year_key`),
  KEY `idx_kpis_academic_year` (`academic_year`,`year_key`),
  CONSTRAINT `scenario_kpis_ibfk_1` FOREIGN KEY (`scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `scenario_results` (
  `scenario_id` bigint NOT NULL,
  `results_json` json NOT NULL,
  `calculated_by` bigint NOT NULL,
  `calculated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`scenario_id`),
  KEY `calculated_by` (`calculated_by`),
  CONSTRAINT `scenario_results_ibfk_1` FOREIGN KEY (`scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `scenario_results_ibfk_2` FOREIGN KEY (`calculated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `expense_distribution_sets` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `country_id` bigint NOT NULL,
  `academic_year` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_scenario_id` bigint NOT NULL,
  `basis` enum('students','revenue') COLLATE utf8mb4_unicode_ci NOT NULL,
  `basis_year_key` enum('y1','y2','y3') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'y1',
  `scope_json` json NOT NULL,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_expense_distribution_sets_country_year` (`country_id`,`academic_year`),
  KEY `idx_expense_distribution_sets_source` (`source_scenario_id`),
  KEY `idx_expense_distribution_sets_created_by` (`created_by`),
  CONSTRAINT `expense_distribution_sets_ibfk_1` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `expense_distribution_sets_ibfk_2` FOREIGN KEY (`source_scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `expense_distribution_sets_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `expense_distribution_targets` (
  `distribution_id` bigint NOT NULL,
  `target_scenario_id` bigint NOT NULL,
  `basis_value` decimal(18,6) NOT NULL DEFAULT '0',
  `weight` decimal(18,10) NOT NULL DEFAULT '0',
  PRIMARY KEY (`distribution_id`,`target_scenario_id`),
  KEY `idx_expense_distribution_targets_target` (`target_scenario_id`),
  CONSTRAINT `expense_distribution_targets_ibfk_1` FOREIGN KEY (`distribution_id`) REFERENCES `expense_distribution_sets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `expense_distribution_targets_ibfk_2` FOREIGN KEY (`target_scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `expense_distribution_allocations` (
  `distribution_id` bigint NOT NULL,
  `target_scenario_id` bigint NOT NULL,
  `expense_key` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `allocated_amount` decimal(18,6) NOT NULL DEFAULT '0',
  PRIMARY KEY (`distribution_id`,`target_scenario_id`,`expense_key`),
  KEY `idx_expense_distribution_allocations_target` (`target_scenario_id`),
  CONSTRAINT `expense_distribution_allocations_ibfk_1` FOREIGN KEY (`distribution_id`) REFERENCES `expense_distribution_sets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `expense_distribution_allocations_ibfk_2` FOREIGN KEY (`target_scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `country_approval_batches` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `country_id` bigint NOT NULL,
  `academic_year` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('sent_for_approval','revision_requested','approved') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sent_for_approval',
  `created_by` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_by` bigint DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `review_note` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_country_approval_batches_country_year_status` (`country_id`,`academic_year`,`status`),
  KEY `idx_country_approval_batches_created_by` (`created_by`),
  KEY `idx_country_approval_batches_reviewed_by` (`reviewed_by`),
  CONSTRAINT `country_approval_batches_ibfk_1` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `country_approval_batches_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `country_approval_batches_ibfk_3` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `country_approval_batch_items` (
  `batch_id` bigint NOT NULL,
  `scenario_id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `is_source` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`batch_id`,`scenario_id`),
  UNIQUE KEY `uniq_country_approval_batch_items_scenario` (`scenario_id`),
  KEY `idx_country_approval_batch_items_school` (`school_id`),
  CONSTRAINT `country_approval_batch_items_ibfk_1` FOREIGN KEY (`batch_id`) REFERENCES `country_approval_batches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `country_approval_batch_items_ibfk_2` FOREIGN KEY (`scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `country_approval_batch_items_ibfk_3` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `scenario_review_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `scenario_id` bigint NOT NULL,
  `action` enum('submit','approve','revise','unapprove') COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `actor_user_id` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `scenario_id` (`scenario_id`),
  KEY `actor_user_id` (`actor_user_id`),
  CONSTRAINT `scenario_review_events_ibfk_1` FOREIGN KEY (`scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `scenario_review_events_ibfk_2` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: scenario_work_items
-- Tracks per‑module progress within a scenario.  Each row is keyed by
-- scenario_id and a stable work_id (e.g. gelirler.unit_fee).  States
-- reflect whether the module is untouched, being edited, submitted by
-- principals/HR, needs revision, or approved by a manager.
CREATE TABLE `scenario_work_items` (
  `scenario_id` bigint NOT NULL,
  `work_id` varchar(200) NOT NULL,
  `resource` varchar(200) NOT NULL,
  `state` enum('not_started','in_progress','submitted','needs_revision','approved') NOT NULL DEFAULT 'not_started',
  `updated_by` bigint DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `manager_comment` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`scenario_id`,`work_id`),
  KEY `idx_scenario_work_items_state` (`state`),
  KEY `fk_scenario_work_items_updated_by` (`updated_by`),
  CONSTRAINT `fk_scenario_work_items_scenario` FOREIGN KEY (`scenario_id`) REFERENCES `school_scenarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_scenario_work_items_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Additional tables for managing user roles and permissions
--
-- These tables support assigning specific roles to users at a school level and
-- granting fine‑grained permissions.  See migrations for incremental updates.

-- Table: school_user_roles
-- Associates users with roles within a specific school.  Each combination
-- of school, user, and role is unique.  When a school or user is removed
-- the corresponding assignments are cascaded or set to null accordingly.
CREATE TABLE `school_user_roles` (
  `school_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `role` varchar(50) NOT NULL,
  `modules_json` json DEFAULT NULL,
  `assigned_by` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`school_id`,`user_id`,`role`),
  KEY `idx_sur_user` (`user_id`),
  KEY `idx_sur_role` (`role`),
  CONSTRAINT `fk_sur_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sur_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sur_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: permissions
-- Defines atomic permissions that can be granted to users.  Each permission
-- is scoped to a resource and an action.  A unique constraint ensures
-- there are no duplicate resource/action combinations.
CREATE TABLE `permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `resource` varchar(190) NOT NULL,
  `action` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_perm` (`resource`,`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `permission_id` bigint NOT NULL,
  `scope_country_id` bigint DEFAULT NULL,
  `scope_school_id` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_perm_scope` (`user_id`,`permission_id`,`scope_country_id`,`scope_school_id`),
  KEY `idx_up_perm` (`permission_id`),
  KEY `idx_up_country` (`scope_country_id`),
  KEY `idx_up_school` (`scope_school_id`),
  CONSTRAINT `fk_up_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_up_perm` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_up_country` FOREIGN KEY (`scope_country_id`) REFERENCES `countries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_up_school` FOREIGN KEY (`scope_school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
