ALTER TABLE `platform_refresh_tokens`
  ADD COLUMN `auth_method` VARCHAR(40) NOT NULL DEFAULT 'password',
  ADD COLUMN `mfa_verified_at` DATETIME(3) NULL;

ALTER TABLE `tenants`
  ADD COLUMN `onboarding_step` VARCHAR(80) NOT NULL DEFAULT 'company_profile',
  ADD COLUMN `onboarding_completed_at` DATETIME(3) NULL,
  ADD COLUMN `database_secret_arn` VARCHAR(512) NULL,
  ADD COLUMN `internal` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `domains`
  MODIFY `status` ENUM('pending','requested','dns_pending','verified','certificate_pending','active','failed','revoked') NOT NULL DEFAULT 'pending',
  ADD COLUMN `dns_record_name` VARCHAR(255) NULL,
  ADD COLUMN `dns_record_value` VARCHAR(512) NULL,
  ADD COLUMN `provider_tenant_id` VARCHAR(160) NULL,
  ADD COLUMN `certificate_arn` VARCHAR(512) NULL,
  ADD COLUMN `failure_reason` TEXT NULL,
  ADD COLUMN `activated_at` DATETIME(3) NULL,
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD UNIQUE INDEX `domains_provider_tenant_id_key` (`provider_tenant_id`);

ALTER TABLE `subscriptions`
  ADD COLUMN `last_provider_event_at` DATETIME(3) NULL;

ALTER TABLE `payment_events`
  ADD COLUMN `provider_created_at` DATETIME(3) NULL;

ALTER TABLE `platform_audit_events`
  ADD COLUMN `previous_hash` CHAR(64) NULL,
  ADD COLUMN `event_hash` CHAR(64) NULL,
  ADD UNIQUE INDEX `platform_audit_events_event_hash_key` (`event_hash`);

ALTER TABLE `deletion_requests`
  ADD COLUMN `status` ENUM('requested','scheduled','processing','completed','cancelled','failed') NOT NULL DEFAULT 'requested',
  ADD COLUMN `reason` VARCHAR(500) NULL,
  ADD COLUMN `last_error` TEXT NULL,
  ADD COLUMN `attempt_count` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `mfa_methods` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `kind` ENUM('totp') NOT NULL DEFAULT 'totp',
  `encrypted_secret` TEXT NOT NULL,
  `verified_at` DATETIME(3) NULL,
  `disabled_at` DATETIME(3) NULL,
  `last_used_step` BIGINT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `mfa_methods_user_kind_key` (`user_id`, `kind`),
  CONSTRAINT `mfa_methods_user_fk` FOREIGN KEY (`user_id`) REFERENCES `platform_users` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `trial_claims` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `identifier_type` VARCHAR(40) NOT NULL,
  `identifier_hash` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `trial_claims_identifier_hash_key` (`identifier_hash`),
  INDEX `trial_claims_tenant_idx` (`tenant_id`),
  CONSTRAINT `trial_claims_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `mfa_challenges` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `membership_id` CHAR(36) NULL,
  `purpose` ENUM('login','enrollment','step_up','recovery') NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `expires_at` DATETIME(3) NOT NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `mfa_challenges_token_hash_key` (`token_hash`),
  INDEX `mfa_challenges_user_purpose_expiry_idx` (`user_id`, `purpose`, `expires_at`),
  CONSTRAINT `mfa_challenges_user_fk` FOREIGN KEY (`user_id`) REFERENCES `platform_users` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `recovery_codes` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `recovery_codes_code_hash_key` (`code_hash`),
  INDEX `recovery_codes_user_used_idx` (`user_id`, `used_at`),
  CONSTRAINT `recovery_codes_user_fk` FOREIGN KEY (`user_id`) REFERENCES `platform_users` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `enterprise_sso_configs` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `policy` ENUM('disabled','optional','required') NOT NULL DEFAULT 'disabled',
  `workos_organization_id` VARCHAR(160) NULL,
  `workos_connection_id` VARCHAR(160) NULL,
  `verified_domains` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `enterprise_sso_tenant_key` (`tenant_id`),
  UNIQUE INDEX `enterprise_sso_org_key` (`workos_organization_id`),
  UNIQUE INDEX `enterprise_sso_connection_key` (`workos_connection_id`),
  CONSTRAINT `enterprise_sso_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sso_login_states` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `state_hash` CHAR(64) NOT NULL,
  `encrypted_code_verifier` TEXT NOT NULL,
  `nonce` VARCHAR(160) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `sso_login_states_state_hash_key` (`state_hash`),
  INDEX `sso_login_states_tenant_expiry_idx` (`tenant_id`, `expires_at`),
  CONSTRAINT `sso_login_states_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `provider_credentials` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `provider` VARCHAR(80) NOT NULL,
  `secret_arn` VARCHAR(512) NOT NULL,
  `status` ENUM('pending','processing','active','failed','revoked','deleted') NOT NULL DEFAULT 'pending',
  `metadata` JSON NULL,
  `last_verified_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `provider_credentials_tenant_provider_key` (`tenant_id`, `provider`),
  CONSTRAINT `provider_credentials_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `billing_invoices` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `subscription_id` CHAR(36) NULL,
  `invoice_number` VARCHAR(80) NOT NULL,
  `status` ENUM('draft','issued','paid','void','failed') NOT NULL DEFAULT 'draft',
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `legal_name` VARCHAR(255) NOT NULL,
  `gstin` VARCHAR(32) NULL,
  `billing_address` TEXT NOT NULL,
  `place_of_supply` VARCHAR(80) NULL,
  `subtotal_paise` INTEGER NOT NULL,
  `tax_paise` INTEGER NOT NULL DEFAULT 0,
  `total_paise` INTEGER NOT NULL,
  `provider` VARCHAR(40) NULL,
  `provider_invoice_id` VARCHAR(160) NULL,
  `provider_status` VARCHAR(80) NULL,
  `pdf_storage_key` VARCHAR(512) NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `issued_at` DATETIME(3) NULL,
  `paid_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `billing_invoices_number_key` (`invoice_number`),
  UNIQUE INDEX `billing_invoices_provider_key` (`provider_invoice_id`),
  UNIQUE INDEX `billing_invoices_idempotency_key` (`idempotency_key`),
  INDEX `billing_invoices_tenant_created_idx` (`tenant_id`, `created_at`),
  CONSTRAINT `billing_invoices_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `billing_invoice_lines` (
  `id` CHAR(36) NOT NULL,
  `invoice_id` CHAR(36) NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `quantity` INTEGER NOT NULL DEFAULT 1,
  `unit_amount_paise` INTEGER NOT NULL,
  `tax_paise` INTEGER NOT NULL DEFAULT 0,
  `hsn_sac` VARCHAR(32) NULL,
  `provider_tax_id` VARCHAR(160) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `billing_invoice_lines_invoice_fk` FOREIGN KEY (`invoice_id`) REFERENCES `billing_invoices` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `account_exports` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `requested_by_id` CHAR(36) NOT NULL,
  `status` ENUM('pending','processing','completed','failed','expired') NOT NULL DEFAULT 'pending',
  `storage_key` VARCHAR(512) NULL,
  `sha256` CHAR(64) NULL,
  `size_bytes` BIGINT NULL,
  `expires_at` DATETIME(3) NULL,
  `last_error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `account_exports_tenant_created_idx` (`tenant_id`, `created_at`),
  CONSTRAINT `account_exports_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `account_exports_requester_fk` FOREIGN KEY (`requested_by_id`) REFERENCES `platform_users` (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `consent_records` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `user_id` CHAR(36) NOT NULL,
  `document_type` VARCHAR(80) NOT NULL,
  `document_version` VARCHAR(80) NOT NULL,
  `document_hash` CHAR(64) NOT NULL,
  `purpose` VARCHAR(255) NOT NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(512) NULL,
  `accepted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `withdrawn_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `consent_records_user_document_idx` (`user_id`, `document_type`, `accepted_at`),
  CONSTRAINT `consent_records_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `consent_records_user_fk` FOREIGN KEY (`user_id`) REFERENCES `platform_users` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `data_subject_requests` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `user_id` CHAR(36) NOT NULL,
  `request_type` VARCHAR(40) NOT NULL,
  `status` ENUM('pending','processing','active','failed','revoked','deleted') NOT NULL DEFAULT 'pending',
  `due_at` DATETIME(3) NOT NULL,
  `completed_at` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `data_subject_requests_status_due_idx` (`status`, `due_at`),
  CONSTRAINT `data_subject_requests_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `data_subject_requests_user_fk` FOREIGN KEY (`user_id`) REFERENCES `platform_users` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `migration_rollouts` (
  `id` CHAR(36) NOT NULL,
  `migration_name` VARCHAR(160) NOT NULL,
  `target_version` VARCHAR(100) NOT NULL,
  `status` ENUM('draft','running','paused','completed','failed') NOT NULL DEFAULT 'draft',
  `current_stage` INTEGER NOT NULL DEFAULT 0,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `paused_reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `migration_rollouts_name_key` (`migration_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `migration_targets` (
  `id` CHAR(36) NOT NULL,
  `rollout_id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `stage` INTEGER NOT NULL,
  `status` ENUM('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
  `lease_owner` VARCHAR(160) NULL,
  `lease_expires_at` DATETIME(3) NULL,
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `last_error` TEXT NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `migration_targets_rollout_tenant_key` (`rollout_id`, `tenant_id`),
  INDEX `migration_targets_stage_status_idx` (`rollout_id`, `stage`, `status`),
  CONSTRAINT `migration_targets_rollout_fk` FOREIGN KEY (`rollout_id`) REFERENCES `migration_rollouts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `migration_targets_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `backup_artifacts` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `kind` VARCHAR(40) NOT NULL,
  `status` ENUM('pending','processing','active','failed','revoked','deleted') NOT NULL DEFAULT 'pending',
  `storage_key` VARCHAR(512) NULL,
  `checksum` CHAR(64) NULL,
  `schema_version` VARCHAR(100) NULL,
  `size_bytes` BIGINT NULL,
  `captured_at` DATETIME(3) NULL,
  `expires_at` DATETIME(3) NULL,
  `restored_at` DATETIME(3) NULL,
  `last_error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `backup_artifacts_tenant_captured_idx` (`tenant_id`, `captured_at`),
  CONSTRAINT `backup_artifacts_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_operators` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('support','billing','security','platform_admin') NOT NULL,
  `status` ENUM('active','suspended') NOT NULL DEFAULT 'active',
  `mfa_secret` TEXT NULL,
  `mfa_verified_at` DATETIME(3) NULL,
  `last_used_step` BIGINT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `platform_operators_email_key` (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `operator_access_grants` (
  `id` CHAR(36) NOT NULL,
  `operator_id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `approved_by_id` CHAR(36) NULL,
  `approved_at` DATETIME(3) NULL,
  `reason` VARCHAR(500) NOT NULL,
  `ticket` VARCHAR(160) NOT NULL,
  `read_only` BOOLEAN NOT NULL DEFAULT true,
  `starts_at` DATETIME(3) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `operator_access_grants_tenant_expiry_idx` (`tenant_id`, `expires_at`),
  CONSTRAINT `operator_access_grants_operator_fk` FOREIGN KEY (`operator_id`) REFERENCES `platform_operators` (`id`) ON DELETE CASCADE,
  CONSTRAINT `operator_access_grants_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `operator_access_grants_approver_fk` FOREIGN KEY (`approved_by_id`) REFERENCES `platform_users` (`id`) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `security_events` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `actor_id` CHAR(36) NULL,
  `event_type` VARCHAR(120) NOT NULL,
  `severity` ENUM('info','low','medium','high','critical') NOT NULL DEFAULT 'info',
  `source` VARCHAR(80) NOT NULL,
  `ip_address` VARCHAR(64) NULL,
  `metadata` JSON NULL,
  `resolved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `security_events_tenant_severity_created_idx` (`tenant_id`, `severity`, `created_at`),
  CONSTRAINT `security_events_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `security_events_actor_fk` FOREIGN KEY (`actor_id`) REFERENCES `platform_users` (`id`) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `upload_objects` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `object_key` VARCHAR(700) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(160) NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `checksum` VARCHAR(128) NULL,
  `status` ENUM('pending','processing','active','failed','revoked','deleted') NOT NULL DEFAULT 'pending',
  `malware_status` VARCHAR(80) NULL,
  `clean_object_key` VARCHAR(700) NULL,
  `uploaded_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `upload_objects_object_key_key` (`object_key`),
  INDEX `upload_objects_tenant_status_idx` (`tenant_id`, `status`),
  CONSTRAINT `upload_objects_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
