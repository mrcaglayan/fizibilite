-- Migration: add expense distribution overlay tables

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

