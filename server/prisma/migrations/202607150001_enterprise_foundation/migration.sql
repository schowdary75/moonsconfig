ALTER TABLE `crm_users` MODIFY `role` ENUM('admin', 'editor', 'approver', 'manager', 'sales', 'support', 'finance', 'marketing', 'operations', 'viewer') NOT NULL DEFAULT 'viewer';
ALTER TABLE `crm_user_roles` MODIFY `role` ENUM('admin', 'editor', 'approver', 'manager', 'sales', 'support', 'finance', 'marketing', 'operations', 'viewer') NOT NULL;
ALTER TABLE `crm_user_roles`
  ADD CONSTRAINT `crm_user_roles_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `crm_users` (`id`) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS `auth_refresh_tokens` (
  `id` CHAR(36) NOT NULL,
  `principal_type` ENUM('crm_user', 'customer_user') NOT NULL,
  `crm_user_id` INT NULL,
  `customer_user_id` INT NULL,
  `family_id` CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `jwt_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` DATETIME NULL,
  `replaced_by_id` CHAR(36) NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(512) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_refresh_tokens_token_hash_key` (`token_hash`),
  UNIQUE KEY `auth_refresh_tokens_jwt_id_key` (`jwt_id`),
  KEY `auth_refresh_tokens_family_id_idx` (`family_id`),
  KEY `auth_refresh_tokens_crm_user_id_idx` (`crm_user_id`),
  KEY `auth_refresh_tokens_customer_user_id_idx` (`customer_user_id`),
  KEY `auth_refresh_tokens_expires_at_revoked_at_idx` (`expires_at`, `revoked_at`),
  CONSTRAINT `auth_refresh_tokens_crm_user_id_fkey` FOREIGN KEY (`crm_user_id`) REFERENCES `crm_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `auth_refresh_tokens_customer_user_id_fkey` FOREIGN KEY (`customer_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `auth_refresh_tokens_principal_check` CHECK (
    (`principal_type` = 'crm_user' AND `crm_user_id` IS NOT NULL AND `customer_user_id` IS NULL) OR
    (`principal_type` = 'customer_user' AND `customer_user_id` IS NOT NULL AND `crm_user_id` IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS `enterprise_notifications` (
  `id` CHAR(36) NOT NULL,
  `user_id` INT NOT NULL,
  `type` VARCHAR(80) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `payload` JSON NULL,
  `read_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `enterprise_notifications_user_id_read_at_created_at_idx` (`user_id`, `read_at`, `created_at`)
);

CREATE TABLE IF NOT EXISTS `scheduled_job_executions` (
  `id` CHAR(36) NOT NULL,
  `job_name` VARCHAR(100) NOT NULL,
  `scheduled_at` DATETIME NOT NULL,
  `status` VARCHAR(30) NOT NULL,
  `details` JSON NULL,
  `completed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `scheduled_job_executions_job_name_scheduled_at_key` (`job_name`, `scheduled_at`)
);
