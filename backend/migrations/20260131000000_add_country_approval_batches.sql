-- Add country-level approval batch tables

CREATE TABLE IF NOT EXISTS `country_approval_batches` (
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

CREATE TABLE IF NOT EXISTS `country_approval_batch_items` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
