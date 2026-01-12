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
  `status` enum('draft','submitted','revision_requested','approved') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `submitted_at` timestamp NULL DEFAULT NULL,
  `submitted_by` bigint DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `reviewed_by` bigint DEFAULT NULL,
  `review_note` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `progress_pct` decimal(5,2) DEFAULT NULL,
  `progress_json` json DEFAULT NULL,
  `progress_calculated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_scenarios_school` (`school_id`),
  KEY `fk_scenarios_submitted_by` (`submitted_by`),
  KEY `fk_scenarios_reviewed_by` (`reviewed_by`),
  UNIQUE KEY `uniq_scenarios_school_year` (`school_id`,`academic_year`),
  KEY `idx_scenarios_status_year` (`status`,`academic_year`),
  CONSTRAINT `fk_scenarios_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_scenarios_submitted_by` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`),
  CONSTRAINT `school_scenarios_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `school_scenarios_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
