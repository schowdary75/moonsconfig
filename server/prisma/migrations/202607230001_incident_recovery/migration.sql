-- Durable on-trip incident recovery. The legacy contingency table was present
-- in the Prisma schema but absent from tenant migrations, so create it here
-- before adding the canonical recovery workflow tables.
CREATE TABLE IF NOT EXISTS `booking_contingencies` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_id` INTEGER NOT NULL,
  `issue_type` VARCHAR(100) NOT NULL,
  `severity` VARCHAR(20) NOT NULL DEFAULT 'medium',
  `details` TEXT NULL,
  `plan_a_status` VARCHAR(50) NOT NULL DEFAULT 'failed',
  `plan_b_authorized` BOOLEAN NOT NULL DEFAULT false,
  `refund_amount` DECIMAL(10,2) NULL,
  `resolved_by` INTEGER NULL,
  `resolved_at` DATETIME(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_booking_contingencies_booking` (`booking_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `incident_recoveries` (
  `id` CHAR(36) NOT NULL,
  `incident_id` INTEGER NOT NULL,
  `booking_id` INTEGER NOT NULL,
  `customer_user_id` INTEGER NOT NULL,
  `trip_id` CHAR(36) NULL,
  `issue_type` VARCHAR(40) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'reported',
  `destination` VARCHAR(255) NULL,
  `assigned_vendor_id` INTEGER NULL,
  `assigned_operator_id` INTEGER NULL,
  `assigned_service_id` CHAR(36) NULL,
  `response_due_at` DATETIME(0) NULL,
  `fallback_activated_at` DATETIME(0) NULL,
  `resolved_at` DATETIME(0) NULL,
  `resolution_summary` TEXT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_incident_recoveries_incident` (`incident_id`),
  INDEX `idx_incident_recoveries_due` (`status`, `response_due_at`),
  INDEX `idx_incident_recoveries_booking` (`booking_id`, `created_at`),
  INDEX `idx_incident_recoveries_customer` (`customer_user_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `incident_vendor_attempts` (
  `id` CHAR(36) NOT NULL,
  `recovery_id` CHAR(36) NOT NULL,
  `vendor_id` INTEGER NULL,
  `operator_id` INTEGER NULL,
  `role` VARCHAR(30) NOT NULL,
  `channel` VARCHAR(20) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'queued',
  `response_code` VARCHAR(16) NOT NULL,
  `provider_reference` VARCHAR(160) NULL,
  `contact_snapshot` JSON NOT NULL,
  `response_due_at` DATETIME(0) NOT NULL,
  `responded_at` DATETIME(0) NULL,
  `response` JSON NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_incident_vendor_attempt_code` (`response_code`),
  INDEX `idx_incident_vendor_attempts_recovery` (`recovery_id`, `status`),
  INDEX `idx_incident_vendor_attempts_due` (`status`, `response_due_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `incident_alternatives` (
  `id` CHAR(36) NOT NULL,
  `recovery_id` CHAR(36) NOT NULL,
  `vendor_id` INTEGER NULL,
  `service_type` VARCHAR(30) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `contact_name` VARCHAR(160) NULL,
  `phone` VARCHAR(50) NULL,
  `email` VARCHAR(255) NULL,
  `booking_url` VARCHAR(500) NULL,
  `address` VARCHAR(500) NULL,
  `availability_status` VARCHAR(40) NOT NULL DEFAULT 'contacting',
  `source` VARCHAR(80) NOT NULL,
  `source_as_of` DATETIME(0) NOT NULL,
  `estimated_amount` DECIMAL(14,2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `selected_at` DATETIME(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_incident_alternatives_recovery` (`recovery_id`, `availability_status`),
  INDEX `idx_incident_alternatives_vendor` (`vendor_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `incident_customer_updates` (
  `id` CHAR(36) NOT NULL,
  `recovery_id` CHAR(36) NOT NULL,
  `channel` VARCHAR(20) NOT NULL,
  `delivery_status` VARCHAR(30) NOT NULL,
  `message` TEXT NOT NULL,
  `provider_reference` VARCHAR(160) NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_incident_customer_update_key` (`idempotency_key`),
  INDEX `idx_incident_customer_updates_recovery` (`recovery_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `incident_receipts` (
  `id` CHAR(36) NOT NULL,
  `recovery_id` CHAR(36) NOT NULL,
  `customer_user_id` INTEGER NOT NULL,
  `secure_document_id` CHAR(36) NOT NULL,
  `expense_type` VARCHAR(30) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `merchant` VARCHAR(255) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'upload_pending',
  `proposal_id` CHAR(36) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_incident_receipts_document` (`secure_document_id`),
  INDEX `idx_incident_receipts_recovery` (`recovery_id`, `status`),
  INDEX `idx_incident_receipts_customer` (`customer_user_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `secure_travel_documents`
  MODIFY COLUMN `document_type` ENUM('passport','visa','id','insurance','ticket','voucher','medical','receipt','other') NOT NULL;
