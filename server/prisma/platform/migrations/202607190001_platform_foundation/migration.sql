-- MooNsConfig platform/control-plane foundation.
-- Generated from prisma/platform/schema.prisma; kept separate from tenant migrations.
CREATE TABLE `platform_users` (
  `id` CHAR(36) NOT NULL, `email` VARCHAR(255) NOT NULL, `password_hash` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL, `mobile` VARCHAR(50) NULL, `email_verified_at` DATETIME(3) NULL,
  `mfa_enabled` BOOLEAN NOT NULL DEFAULT false,
  `status` ENUM('pending_verification','active','suspended','deleted') NOT NULL DEFAULT 'pending_verification',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `platform_users_email_key`(`email`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tenants` (
  `id` CHAR(36) NOT NULL, `name` VARCHAR(255) NOT NULL, `slug` VARCHAR(80) NOT NULL,
  `database_name` VARCHAR(64) NOT NULL, `database_username` VARCHAR(64) NOT NULL,
  `encrypted_database_password` TEXT NOT NULL,
  `status` ENUM('pending','provisioning','active','suspended','deleting','deleted','failed') NOT NULL DEFAULT 'pending',
  `country` CHAR(2) NOT NULL DEFAULT 'IN', `timezone` VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata',
  `currency` CHAR(3) NOT NULL DEFAULT 'INR', `billing_address` TEXT NOT NULL, `gstin` VARCHAR(32) NULL,
  `schema_version` VARCHAR(100) NULL, `suspended_at` DATETIME(3) NULL, `retention_ends_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `tenants_slug_key`(`slug`), UNIQUE INDEX `tenants_database_name_key`(`database_name`),
  UNIQUE INDEX `tenants_database_username_key`(`database_username`), INDEX `tenants_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `memberships` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NOT NULL, `user_id` CHAR(36) NOT NULL,
  `tenant_user_id` INTEGER NULL,
  `role` ENUM('owner','admin','manager','editor','approver','sales','support','finance','marketing','operations','viewer') NOT NULL,
  `status` ENUM('invited','active','suspended') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `memberships_tenant_id_user_id_key`(`tenant_id`,`user_id`),
  INDEX `memberships_user_id_status_idx`(`user_id`,`status`), PRIMARY KEY (`id`),
  CONSTRAINT `memberships_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `platform_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_refresh_tokens` (
  `id` CHAR(36) NOT NULL, `user_id` CHAR(36) NOT NULL, `membership_id` CHAR(36) NOT NULL,
  `family_id` CHAR(36) NOT NULL, `token_hash` CHAR(64) NOT NULL, `jwt_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL, `revoked_at` DATETIME(3) NULL, `replaced_by_id` CHAR(36) NULL,
  `ip_address` VARCHAR(64) NULL, `user_agent` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `platform_refresh_tokens_token_hash_key`(`token_hash`), INDEX `platform_refresh_tokens_family_id_idx`(`family_id`),
  INDEX `platform_refresh_tokens_expires_at_idx`(`expires_at`), PRIMARY KEY (`id`),
  CONSTRAINT `platform_refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `platform_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `platform_refresh_tokens_membership_id_fkey` FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `email_verifications` (
  `id` CHAR(36) NOT NULL, `user_id` CHAR(36) NOT NULL, `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL, `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `email_verifications_token_hash_key`(`token_hash`), INDEX `email_verifications_user_id_expires_at_idx`(`user_id`,`expires_at`),
  PRIMARY KEY (`id`), CONSTRAINT `email_verifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `platform_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `domains` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NOT NULL, `hostname` VARCHAR(255) NOT NULL,
  `kind` ENUM('platform_subdomain','custom_public','custom_app') NOT NULL,
  `status` ENUM('pending','verified','active','failed') NOT NULL DEFAULT 'pending',
  `verification_hash` CHAR(64) NULL, `verified_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `domains_hostname_key`(`hostname`), INDEX `domains_tenant_id_status_idx`(`tenant_id`,`status`), PRIMARY KEY (`id`),
  CONSTRAINT `domains_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `plans` (
  `code` ENUM('starter','business','enterprise') NOT NULL, `name` VARCHAR(80) NOT NULL,
  `included_seats` INTEGER NOT NULL, `max_seats` INTEGER NULL, `storage_bytes` BIGINT NOT NULL,
  `monthly_price_paise` INTEGER NULL, `annual_price_paise` INTEGER NULL, `extra_seat_price_paise` INTEGER NULL,
  `active` BOOLEAN NOT NULL DEFAULT true, PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `entitlements` (
  `id` CHAR(36) NOT NULL, `plan_code` ENUM('starter','business','enterprise') NOT NULL,
  `feature_key` VARCHAR(100) NOT NULL, `enabled` BOOLEAN NOT NULL DEFAULT true, `limit_value` BIGINT NULL,
  UNIQUE INDEX `entitlements_plan_code_feature_key_key`(`plan_code`,`feature_key`), PRIMARY KEY (`id`),
  CONSTRAINT `entitlements_plan_code_fkey` FOREIGN KEY (`plan_code`) REFERENCES `plans`(`code`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tenant_prices` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NOT NULL, `plan_code` ENUM('starter','business','enterprise') NOT NULL,
  `interval` ENUM('monthly','annual') NOT NULL, `seats` INTEGER NOT NULL, `amount_paise` INTEGER NOT NULL,
  `provider_plan_id` VARCHAR(100) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `tenant_prices_provider_plan_id_key`(`provider_plan_id`),
  UNIQUE INDEX `tenant_prices_tenant_id_plan_code_interval_seats_key`(`tenant_id`,`plan_code`,`interval`,`seats`), PRIMARY KEY (`id`),
  CONSTRAINT `tenant_prices_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tenant_prices_plan_code_fkey` FOREIGN KEY (`plan_code`) REFERENCES `plans`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `subscriptions` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NOT NULL, `plan_code` ENUM('starter','business','enterprise') NOT NULL,
  `status` ENUM('trialing','active','past_due','suspended','cancelled','expired') NOT NULL,
  `interval` ENUM('monthly','annual') NULL, `seats` INTEGER NOT NULL, `provider` VARCHAR(40) NULL,
  `provider_customer_id` VARCHAR(100) NULL, `provider_subscription_id` VARCHAR(100) NULL,
  `current_period_start` DATETIME(3) NULL, `current_period_end` DATETIME(3) NULL,
  `cancel_at_period_end` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `subscriptions_provider_subscription_id_key`(`provider_subscription_id`), INDEX `subscriptions_tenant_id_status_idx`(`tenant_id`,`status`), PRIMARY KEY (`id`),
  CONSTRAINT `subscriptions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `subscriptions_plan_code_fkey` FOREIGN KEY (`plan_code`) REFERENCES `plans`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `trials` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NOT NULL, `started_at` DATETIME(3) NOT NULL,
  `ends_at` DATETIME(3) NOT NULL, `ended_at` DATETIME(3) NULL,
  UNIQUE INDEX `trials_tenant_id_key`(`tenant_id`), INDEX `trials_ends_at_idx`(`ends_at`), PRIMARY KEY (`id`),
  CONSTRAINT `trials_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payment_events` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NULL, `provider` VARCHAR(40) NOT NULL,
  `provider_event_id` VARCHAR(160) NOT NULL, `event_type` VARCHAR(100) NOT NULL, `payload_hash` CHAR(64) NOT NULL,
  `payload` JSON NOT NULL, `processed_at` DATETIME(3) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `payment_events_provider_event_id_key`(`provider_event_id`), INDEX `payment_events_tenant_id_created_at_idx`(`tenant_id`,`created_at`), PRIMARY KEY (`id`),
  CONSTRAINT `payment_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `usage_counters` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NOT NULL, `quota_key` VARCHAR(100) NOT NULL,
  `period_start` DATETIME(3) NOT NULL, `period_end` DATETIME(3) NOT NULL, `value` BIGINT NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `usage_counters_tenant_id_quota_key_period_start_key`(`tenant_id`,`quota_key`,`period_start`), PRIMARY KEY (`id`),
  CONSTRAINT `usage_counters_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `provisioning_jobs` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NOT NULL,
  `status` ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  `attempt_count` INTEGER NOT NULL DEFAULT 0, `last_error` TEXT NULL, `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `provisioning_jobs_tenant_id_status_idx`(`tenant_id`,`status`), PRIMARY KEY (`id`),
  CONSTRAINT `provisioning_jobs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `invitations` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NOT NULL, `email` VARCHAR(255) NOT NULL,
  `role` ENUM('owner','admin','manager','editor','approver','sales','support','finance','marketing','operations','viewer') NOT NULL,
  `token_hash` CHAR(64) NOT NULL, `status` ENUM('invited','active','suspended') NOT NULL DEFAULT 'invited',
  `invited_by_id` CHAR(36) NOT NULL, `expires_at` DATETIME(3) NOT NULL, `accepted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `invitations_token_hash_key`(`token_hash`), INDEX `invitations_tenant_id_email_idx`(`tenant_id`,`email`), PRIMARY KEY (`id`),
  CONSTRAINT `invitations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `invitations_invited_by_id_fkey` FOREIGN KEY (`invited_by_id`) REFERENCES `platform_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_audit_events` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NULL, `actor_id` CHAR(36) NULL, `action` VARCHAR(120) NOT NULL,
  `target` VARCHAR(255) NULL, `metadata` JSON NULL, `ip_address` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `platform_audit_events_tenant_id_created_at_idx`(`tenant_id`,`created_at`), PRIMARY KEY (`id`),
  CONSTRAINT `platform_audit_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `platform_audit_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `platform_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `deletion_requests` (
  `id` CHAR(36) NOT NULL, `tenant_id` CHAR(36) NOT NULL, `requested_by` CHAR(36) NOT NULL,
  `execute_at` DATETIME(3) NOT NULL, `completed_at` DATETIME(3) NULL, `cancelled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `deletion_requests_execute_at_completed_at_idx`(`execute_at`,`completed_at`), PRIMARY KEY (`id`),
  CONSTRAINT `deletion_requests_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `plans` (`code`,`name`,`included_seats`,`max_seats`,`storage_bytes`,`monthly_price_paise`,`annual_price_paise`,`extra_seat_price_paise`) VALUES
('starter','Starter',2,5,5368709120,149900,1499000,49900),
('business','Business',10,50,53687091200,499900,4999000,39900),
('enterprise','Enterprise',25,NULL,268435456000,1499900,NULL,NULL);
