-- Add year_basis to country_approval_batches

ALTER TABLE `country_approval_batches`
  ADD COLUMN `year_basis` enum('academic','start','end') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'academic' AFTER `academic_year`;

UPDATE `country_approval_batches`
  SET `year_basis`='academic'
  WHERE `year_basis` IS NULL;
