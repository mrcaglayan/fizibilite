-- Migration: add tables for school_user_roles, permissions, and user_permissions
-- This migration introduces new tables to support assigning roles to users at
-- the school level and implementing a fine‑grained permission system.
--
-- Note: these tables reference existing tables (`schools`, `users`, `countries`).

CREATE TABLE IF NOT EXISTS `school_user_roles` (
  `school_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `role` varchar(50) NOT NULL,
  `assigned_by` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`school_id`,`user_id`,`role`),
  KEY `idx_sur_user` (`user_id`),
  KEY `idx_sur_role` (`role`),
  CONSTRAINT `fk_sur_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sur_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sur_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `resource` varchar(190) NOT NULL,
  `action` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_perm` (`resource`,`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_permissions` (
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