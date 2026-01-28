-- Migration: add modules_json column for per-role module responsibility
-- Adds a JSON column to store module assignments for each school/user/role row.

ALTER TABLE `school_user_roles`
  ADD COLUMN `modules_json` json DEFAULT NULL AFTER `role`;
