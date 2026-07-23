ALTER TABLE `tenants`
  MODIFY `status` ENUM('pending', 'pending_activation', 'provisioning', 'active', 'suspended', 'deleting', 'deleted', 'failed') NOT NULL DEFAULT 'pending';

CREATE TABLE `plan_catalog_versions` (
  `id` CHAR(36) NOT NULL,
  `version` INTEGER NOT NULL,
  `status` ENUM('draft', 'published', 'retired') NOT NULL DEFAULT 'draft',
  `notes` TEXT NULL,
  `published_at` DATETIME(3) NULL,
  `published_by_id` CHAR(36) NULL,
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `plan_catalog_versions_version_key` (`version`),
  INDEX `plan_catalog_versions_status_version_idx` (`status`, `version`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `plan_versions` (
  `id` CHAR(36) NOT NULL,
  `catalog_version_id` CHAR(36) NOT NULL,
  `code` ENUM('starter', 'business', 'enterprise') NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `included_seats` INTEGER NOT NULL,
  `max_seats` INTEGER NULL,
  `storage_bytes` BIGINT NOT NULL,
  `monthly_price_paise` INTEGER NULL,
  `annual_price_paise` INTEGER NULL,
  `extra_seat_price_paise` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `plan_versions_catalog_version_id_code_key` (`catalog_version_id`, `code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `plan_version_entitlements` (
  `id` CHAR(36) NOT NULL,
  `plan_version_id` CHAR(36) NOT NULL,
  `feature_key` VARCHAR(100) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `limit_value` BIGINT NULL,
  UNIQUE INDEX `plan_version_entitlements_plan_version_id_feature_key_key` (`plan_version_id`, `feature_key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `tenant_prices`
  ADD COLUMN `plan_version_id` CHAR(36) NULL;

ALTER TABLE `subscriptions`
  ADD COLUMN `source` ENUM('razorpay', 'manual_enterprise') NOT NULL DEFAULT 'razorpay',
  ADD COLUMN `plan_version_id` CHAR(36) NULL,
  ADD COLUMN `entitlement_snapshot` JSON NULL,
  ADD COLUMN `pricing_snapshot` JSON NULL;

UPDATE `subscriptions`
SET `source` = 'manual_enterprise'
WHERE `provider` IS NULL AND `plan_code` = 'enterprise';

ALTER TABLE `trials`
  ADD COLUMN `plan_version_id` CHAR(36) NULL,
  ADD COLUMN `entitlement_snapshot` JSON NULL;

ALTER TABLE `account_exports`
  DROP FOREIGN KEY `account_exports_requester_fk`,
  MODIFY `requested_by_id` CHAR(36) NULL,
  ADD COLUMN `requested_by_operator_id` CHAR(36) NULL;

CREATE TABLE `subscription_changes` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `subscription_id` CHAR(36) NOT NULL,
  `operator_id` CHAR(36) NULL,
  `change_type` VARCHAR(80) NOT NULL,
  `previous_state` JSON NULL,
  `resulting_state` JSON NULL,
  `reason` VARCHAR(500) NOT NULL,
  `ticket` VARCHAR(160) NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `subscription_changes_idempotency_key_key` (`idempotency_key`),
  INDEX `subscription_changes_subscription_id_created_at_idx` (`subscription_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_operator_invitations` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `role` ENUM('support', 'billing', 'security', 'platform_admin') NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `status` ENUM('pending', 'accepted', 'revoked', 'expired') NOT NULL DEFAULT 'pending',
  `invited_by_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `accepted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `platform_operator_invitations_token_hash_key` (`token_hash`),
  INDEX `platform_operator_invitations_email_status_idx` (`email`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `governed_operations` (
  `id` CHAR(36) NOT NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `operator_id` CHAR(36) NOT NULL,
  `action` VARCHAR(120) NOT NULL,
  `target` VARCHAR(255) NULL,
  `result` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `governed_operations_idempotency_key_key` (`idempotency_key`),
  INDEX `governed_operations_operator_id_created_at_idx` (`operator_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `plan_catalog_versions`
  ADD CONSTRAINT `plan_catalog_versions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `platform_operators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `plan_catalog_versions_published_by_id_fkey` FOREIGN KEY (`published_by_id`) REFERENCES `platform_operators`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `plan_versions`
  ADD CONSTRAINT `plan_versions_catalog_version_id_fkey` FOREIGN KEY (`catalog_version_id`) REFERENCES `plan_catalog_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `plan_version_entitlements`
  ADD CONSTRAINT `plan_version_entitlements_plan_version_id_fkey` FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `tenant_prices`
  ADD CONSTRAINT `tenant_prices_plan_version_id_fkey` FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `subscriptions`
  ADD CONSTRAINT `subscriptions_plan_version_id_fkey` FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `trials`
  ADD CONSTRAINT `trials_plan_version_id_fkey` FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `subscription_changes`
  ADD CONSTRAINT `subscription_changes_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `subscription_changes_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `subscription_changes_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `platform_operators`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `platform_operator_invitations`
  ADD CONSTRAINT `platform_operator_invitations_invited_by_id_fkey` FOREIGN KEY (`invited_by_id`) REFERENCES `platform_operators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `governed_operations`
  ADD CONSTRAINT `governed_operations_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `platform_operators`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `account_exports`
  ADD CONSTRAINT `account_exports_requester_fk` FOREIGN KEY (`requested_by_id`) REFERENCES `platform_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `account_exports_requested_by_operator_id_fkey` FOREIGN KEY (`requested_by_operator_id`) REFERENCES `platform_operators`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
