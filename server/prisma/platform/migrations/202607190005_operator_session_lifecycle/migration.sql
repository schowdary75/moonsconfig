CREATE TABLE `platform_operator_sessions` (
  `id` CHAR(36) NOT NULL,
  `operator_id` CHAR(36) NOT NULL,
  `mfa_verified_at` DATETIME(3) NOT NULL,
  `last_seen_at` DATETIME(3) NOT NULL,
  `absolute_expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `platform_operator_sessions_operator_id_revoked_at_idx` (`operator_id`, `revoked_at`),
  INDEX `platform_operator_sessions_last_seen_at_absolute_expires_at_idx` (`last_seen_at`, `absolute_expires_at`),
  CONSTRAINT `platform_operator_sessions_operator_id_fkey`
    FOREIGN KEY (`operator_id`) REFERENCES `platform_operators` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
