-- Migration: add scenario-specific norm configs

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
