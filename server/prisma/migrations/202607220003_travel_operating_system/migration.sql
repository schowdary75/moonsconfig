-- Canonical travel operating system, Maya governance and lifecycle outbox.
-- Additive by design: legacy tables remain compatibility adapters.

ALTER TABLE `bookings`
  ADD COLUMN `canonical_trip_id` CHAR(36) NULL,
  ADD COLUMN `traveller_id` CHAR(36) NULL,
  ADD COLUMN `quote_version_id` CHAR(36) NULL,
  ADD COLUMN `package_id` INTEGER NULL,
  ADD INDEX `idx_bookings_canonical_trip` (`canonical_trip_id`),
  ADD INDEX `idx_bookings_traveller` (`traveller_id`),
  ADD INDEX `idx_bookings_quote_version` (`quote_version_id`),
  ADD INDEX `idx_bookings_package` (`package_id`);

ALTER TABLE `user_refunds`
  MODIFY COLUMN `status` ENUM('initiated', 'admin_review', 'escrow_hold', 'settled') NULL DEFAULT 'initiated';

ALTER TABLE `maya_flight_watches`
  ADD COLUMN `origin_country` CHAR(2) NULL,
  ADD COLUMN `destination_country` CHAR(2) NULL,
  ADD COLUMN `carrier_country` CHAR(2) NULL,
  ADD COLUMN `jurisdiction` VARCHAR(40) NULL,
  ADD COLUMN `policy_version` VARCHAR(80) NULL;

CREATE TABLE `travellers` (
  `id` CHAR(36) NOT NULL, `customer_user_id` INTEGER NULL, `crm_client_id` INTEGER NULL,
  `primary_lead_id` INTEGER NULL, `display_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NULL, `phone` VARCHAR(50) NULL, `locale` VARCHAR(16) NOT NULL DEFAULT 'en',
  `timezone` VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata', `nationality` VARCHAR(2) NULL,
  `status` ENUM('active','merged','archived') NOT NULL DEFAULT 'active', `merged_into_id` CHAR(36) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_travellers_customer_user` (`customer_user_id`),
  INDEX `idx_travellers_email` (`email`), INDEX `idx_travellers_phone` (`phone`),
  INDEX `idx_travellers_crm_client` (`crm_client_id`), INDEX `idx_travellers_primary_lead` (`primary_lead_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `traveller_identities` (
  `id` CHAR(36) NOT NULL, `traveller_id` CHAR(36) NOT NULL,
  `type` ENUM('email','phone','customer_account','crm_client','lead') NOT NULL,
  `normalized_value` VARCHAR(255) NOT NULL, `display_value` VARCHAR(255) NULL,
  `verified_at` DATETIME(0) NULL, `is_primary` BOOLEAN NOT NULL DEFAULT false,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_traveller_identities_traveller` (`traveller_id`),
  UNIQUE INDEX `uq_traveller_identity` (`type`,`normalized_value`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `traveller_preferences` (
  `id` CHAR(36) NOT NULL, `traveller_id` CHAR(36) NOT NULL, `key` VARCHAR(80) NOT NULL,
  `value` JSON NOT NULL, `source` VARCHAR(40) NOT NULL DEFAULT 'staff',
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_traveller_preference` (`traveller_id`,`key`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `traveller_consents` (
  `id` CHAR(36) NOT NULL, `traveller_id` CHAR(36) NOT NULL, `purpose` VARCHAR(80) NOT NULL,
  `channel` VARCHAR(30) NULL, `status` ENUM('granted','withdrawn','expired') NOT NULL,
  `policy_version` VARCHAR(40) NOT NULL, `source` VARCHAR(80) NOT NULL,
  `captured_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0), `withdrawn_at` DATETIME(0) NULL,
  `expires_at` DATETIME(0) NULL, `evidence` JSON NULL,
  INDEX `idx_traveller_consents_lookup` (`traveller_id`,`purpose`,`status`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `travel_trips` (
  `id` CHAR(36) NOT NULL, `booking_id` INTEGER NULL, `lead_id` INTEGER NULL,
  `traveller_id` CHAR(36) NOT NULL, `reference` VARCHAR(100) NOT NULL, `name` VARCHAR(255) NOT NULL,
  `direction` ENUM('domestic','inbound','outbound') NOT NULL,
  `status` ENUM('planning','quoted','accepted','booked','travelling','completed','cancelled') NOT NULL DEFAULT 'planning',
  `destination` VARCHAR(255) NULL, `start_date` DATE NULL, `end_date` DATE NULL,
  `timezone` VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata', `quote_version_id` CHAR(36) NULL,
  `source_snapshot` JSON NULL, `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_trips_booking` (`booking_id`), UNIQUE INDEX `uq_trips_reference` (`reference`),
  INDEX `idx_trips_traveller_date` (`traveller_id`,`start_date`), INDEX `idx_trips_status_date` (`status`,`start_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `travel_party_members` (
  `id` CHAR(36) NOT NULL, `trip_id` CHAR(36) NOT NULL, `traveller_id` CHAR(36) NULL,
  `display_name` VARCHAR(255) NOT NULL, `role` ENUM('organiser','adult','child','infant') NOT NULL DEFAULT 'adult',
  `nationality` VARCHAR(2) NULL, `birth_date` DATE NULL, `room_group` VARCHAR(80) NULL,
  `dietary_needs` TEXT NULL, `accessibility_needs` TEXT NULL, `emergency_contact` JSON NULL,
  `form_status` ENUM('invited','in_progress','complete','verified') NOT NULL DEFAULT 'invited',
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_party_members_trip` (`trip_id`), INDEX `idx_party_members_traveller` (`traveller_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `trip_services` (
  `id` CHAR(36) NOT NULL, `trip_id` CHAR(36) NOT NULL,
  `service_type` ENUM('flight','stay','transfer','activity','cruise','visa','insurance','other') NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `status` ENUM('draft','requested','optioned','confirmed','waitlisted','cancelled','failed','completed') NOT NULL DEFAULT 'draft',
  `supplier_id` INTEGER NULL, `source_catalog_type` VARCHAR(40) NULL, `source_catalog_id` INTEGER NULL,
  `origin` VARCHAR(160) NULL, `destination` VARCHAR(160) NULL, `starts_at` DATETIME(0) NULL,
  `ends_at` DATETIME(0) NULL, `timezone` VARCHAR(80) NULL, `provider_reference` VARCHAR(160) NULL,
  `service_data` JSON NULL, `net_amount` DECIMAL(14,2) NULL, `sell_amount` DECIMAL(14,2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR', `cancellation_policy` JSON NULL, `source_as_of` DATETIME(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_trip_services_trip_date` (`trip_id`,`starts_at`),
  INDEX `idx_trip_services_supplier_status` (`supplier_id`,`status`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `supplier_reservations` (
  `id` CHAR(36) NOT NULL, `trip_service_id` CHAR(36) NOT NULL, `supplier_id` INTEGER NULL,
  `status` ENUM('requested','optioned','confirmed','waitlisted','cancelled','failed') NOT NULL DEFAULT 'requested',
  `provider_reference` VARCHAR(160) NULL, `option_expires_at` DATETIME(0) NULL,
  `confirmation_due_at` DATETIME(0) NULL, `confirmed_at` DATETIME(0) NULL,
  `voucher_storage_key` VARCHAR(500) NULL, `assigned_operator_id` INTEGER NULL, `terms_snapshot` JSON NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_supplier_reservation_service` (`trip_service_id`),
  INDEX `idx_supplier_reservations_due` (`status`,`confirmation_due_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quote_versions` (
  `id` CHAR(36) NOT NULL, `legacy_quote_id` INTEGER NULL, `deal_id` INTEGER NULL, `lead_id` INTEGER NULL,
  `traveller_id` CHAR(36) NULL, `trip_id` CHAR(36) NULL, `version` INTEGER NOT NULL,
  `status` ENUM('draft','awaiting_approval','approved','sent','viewed','accepted','rejected','expired','superseded') NOT NULL DEFAULT 'draft',
  `confidence` ENUM('indicative','confirmed') NOT NULL DEFAULT 'indicative', `title` VARCHAR(255) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR', `total_net` DECIMAL(14,2) NOT NULL,
  `total_sell` DECIMAL(14,2) NOT NULL, `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `fx_snapshot` JSON NULL, `terms_version` VARCHAR(40) NOT NULL, `valid_until` DATETIME(0) NULL,
  `source_as_of` DATETIME(0) NOT NULL, `created_by` INTEGER NULL, `approved_by` INTEGER NULL,
  `approved_at` DATETIME(0) NULL, `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_quote_versions_traveller` (`traveller_id`,`created_at`), INDEX `idx_quote_versions_trip` (`trip_id`),
  INDEX `idx_quote_versions_lead` (`lead_id`,`created_at`),
  UNIQUE INDEX `uq_quote_versions_legacy_version` (`legacy_quote_id`,`version`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quote_line_snapshots` (
  `id` CHAR(36) NOT NULL, `quote_version_id` CHAR(36) NOT NULL, `position` INTEGER NOT NULL,
  `service_type` VARCHAR(40) NOT NULL, `source_catalog_type` VARCHAR(40) NULL, `source_catalog_id` INTEGER NULL,
  `label` VARCHAR(255) NOT NULL, `quantity` DECIMAL(10,2) NOT NULL, `unit_type` VARCHAR(40) NOT NULL,
  `unit_net` DECIMAL(14,2) NULL, `unit_sell` DECIMAL(14,2) NULL, `total_net` DECIMAL(14,2) NOT NULL,
  `total_sell` DECIMAL(14,2) NOT NULL, `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `bindable` BOOLEAN NOT NULL DEFAULT false, `evidence` JSON NULL, `cancellation_policy` JSON NULL,
  UNIQUE INDEX `uq_quote_line_position` (`quote_version_id`,`position`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `proposal_acceptances` (
  `id` CHAR(36) NOT NULL, `quote_version_id` CHAR(36) NOT NULL, `traveller_id` CHAR(36) NULL,
  `signer_name` VARCHAR(255) NOT NULL, `signer_email` VARCHAR(255) NULL,
  `terms_version` VARCHAR(40) NOT NULL, `accepted_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `ip_address` VARCHAR(45) NULL, `user_agent` VARCHAR(512) NULL, `evidence` JSON NULL,
  UNIQUE INDEX `uq_proposal_acceptance_quote` (`quote_version_id`),
  INDEX `idx_proposal_acceptances_traveller` (`traveller_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `proposal_views` (
  `id` CHAR(36) NOT NULL, `quote_version_id` CHAR(36) NOT NULL, `traveller_id` CHAR(36) NULL,
  `viewed_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0), `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(512) NULL, INDEX `idx_proposal_views_quote` (`quote_version_id`,`viewed_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quote_comments` (
  `id` CHAR(36) NOT NULL, `quote_version_id` CHAR(36) NOT NULL, `traveller_id` CHAR(36) NULL,
  `author_type` VARCHAR(30) NOT NULL, `body` TEXT NOT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_quote_comments_quote` (`quote_version_id`,`created_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payment_schedules` (
  `id` CHAR(36) NOT NULL, `trip_id` CHAR(36) NOT NULL, `party_member_id` CHAR(36) NULL,
  `label` VARCHAR(160) NOT NULL, `amount` DECIMAL(14,2) NOT NULL, `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `due_at` DATETIME(0) NOT NULL,
  `status` ENUM('pending','partially_paid','paid','overdue','waived','cancelled') NOT NULL DEFAULT 'pending',
  `paid_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_payment_schedules_trip_due` (`trip_id`,`due_at`),
  INDEX `idx_payment_schedules_status_due` (`status`,`due_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payment_transactions` (
  `id` CHAR(36) NOT NULL, `trip_id` CHAR(36) NOT NULL, `payment_schedule_id` CHAR(36) NULL,
  `provider` VARCHAR(40) NOT NULL, `provider_reference` VARCHAR(160) NOT NULL,
  `idempotency_key` VARCHAR(160) NOT NULL, `amount` DECIMAL(14,2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `status` ENUM('pending','authorized','captured','failed','refunded') NOT NULL,
  `occurred_at` DATETIME(0) NOT NULL, `raw_snapshot` JSON NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_payment_transactions_idempotency` (`idempotency_key`),
  INDEX `idx_payment_transactions_trip` (`trip_id`,`occurred_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `supplier_payables` (
  `id` CHAR(36) NOT NULL, `trip_service_id` CHAR(36) NOT NULL, `supplier_id` INTEGER NULL,
  `amount` DECIMAL(14,2) NOT NULL, `currency` CHAR(3) NOT NULL DEFAULT 'INR', `due_at` DATETIME(0) NULL,
  `status` ENUM('pending','approved','paid','disputed','cancelled') NOT NULL DEFAULT 'pending',
  `provider_reference` VARCHAR(160) NULL, `paid_at` DATETIME(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_supplier_payables_due` (`supplier_id`,`status`,`due_at`),
  INDEX `idx_supplier_payables_service` (`trip_service_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `secure_travel_documents` (
  `id` CHAR(36) NOT NULL, `traveller_id` CHAR(36) NOT NULL, `trip_id` CHAR(36) NULL,
  `party_member_id` CHAR(36) NULL,
  `document_type` ENUM('passport','visa','id','insurance','ticket','voucher','medical','other') NOT NULL,
  `storage_key` VARCHAR(500) NOT NULL, `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(120) NOT NULL, `scan_status` ENUM('pending','clean','infected','failed') NOT NULL DEFAULT 'pending',
  `issued_on` DATE NULL, `expires_on` DATE NULL, `issuing_country` VARCHAR(2) NULL, `metadata` JSON NULL,
  `verified_at` DATETIME(0) NULL, `verified_by` INTEGER NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0), `deleted_at` DATETIME(0) NULL,
  UNIQUE INDEX `uq_secure_documents_storage_key` (`storage_key`),
  INDEX `idx_secure_documents_traveller` (`traveller_id`,`document_type`),
  INDEX `idx_secure_documents_trip` (`trip_id`), INDEX `idx_secure_documents_expiry` (`expires_on`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `travel_conversations` (
  `id` CHAR(36) NOT NULL, `traveller_id` CHAR(36) NULL, `trip_id` CHAR(36) NULL,
  `subject` VARCHAR(255) NULL,
  `status` ENUM('open','waiting_on_traveller','waiting_on_staff','escalated','closed') NOT NULL DEFAULT 'open',
  `assigned_to` INTEGER NULL, `maya_mode` ENUM('shadow','copilot','low_risk_autonomy','human_only') NOT NULL DEFAULT 'copilot',
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_conversations_traveller` (`traveller_id`,`status`), INDEX `idx_conversations_trip` (`trip_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `conversation_participants` (
  `id` CHAR(36) NOT NULL, `conversation_id` CHAR(36) NOT NULL,
  `participant_type` VARCHAR(30) NOT NULL, `participant_ref` VARCHAR(120) NOT NULL,
  `display_name` VARCHAR(255) NULL, `joined_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `left_at` DATETIME(0) NULL,
  UNIQUE INDEX `uq_conversation_participant` (`conversation_id`,`participant_type`,`participant_ref`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `channel_messages` (
  `id` CHAR(36) NOT NULL, `conversation_id` CHAR(36) NOT NULL,
  `channel` ENUM('voice','whatsapp','chat','sms','email') NOT NULL,
  `direction` ENUM('inbound','outbound','internal') NOT NULL, `sender_type` VARCHAR(30) NOT NULL,
  `sender_ref` VARCHAR(120) NULL, `body` TEXT NOT NULL, `locale` VARCHAR(16) NOT NULL DEFAULT 'en',
  `provider_reference` VARCHAR(160) NULL, `delivery_status` VARCHAR(30) NULL,
  `idempotency_key` VARCHAR(160) NULL, `metadata` JSON NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_channel_messages_idempotency` (`idempotency_key`),
  INDEX `idx_channel_messages_conversation` (`conversation_id`,`created_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `canonical_refund_cases` (
  `id` CHAR(36) NOT NULL, `legacy_refund_id` INTEGER NULL, `trip_id` CHAR(36) NULL,
  `traveller_id` CHAR(36) NULL,
  `status` ENUM('requested','admin_review','approved','processing','settled','rejected','cancelled') NOT NULL DEFAULT 'requested',
  `amount` DECIMAL(14,2) NOT NULL, `currency` CHAR(3) NOT NULL DEFAULT 'INR', `reason` TEXT NULL,
  `jurisdiction` VARCHAR(40) NULL, `policy_version` VARCHAR(80) NULL, `eligibility` JSON NULL,
  `provider_reference` VARCHAR(160) NULL, `requested_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `reviewed_at` DATETIME(0) NULL, `settled_at` DATETIME(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_refund_cases_legacy` (`legacy_refund_id`),
  INDEX `idx_refund_cases_status` (`status`,`requested_at`), INDEX `idx_refund_cases_trip` (`trip_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `maya_action_proposals` (
  `id` CHAR(36) NOT NULL, `conversation_id` CHAR(36) NULL, `action_type` VARCHAR(100) NOT NULL,
  `risk_class` ENUM('read_only','low_risk_write','human_approval','high_risk') NOT NULL,
  `subject_type` VARCHAR(50) NOT NULL, `subject_ref` VARCHAR(120) NOT NULL,
  `input` JSON NOT NULL, `evidence` JSON NOT NULL, `policy_version` VARCHAR(80) NOT NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `status` ENUM('pending','approved','rejected','expired','executing','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `requested_by` VARCHAR(120) NOT NULL, `approved_by` INTEGER NULL, `approval_reason` VARCHAR(500) NULL,
  `expires_at` DATETIME(0) NOT NULL, `reviewed_at` DATETIME(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_maya_action_idempotency` (`idempotency_key`),
  INDEX `idx_maya_action_queue` (`status`,`risk_class`,`created_at`),
  INDEX `idx_maya_action_subject` (`subject_type`,`subject_ref`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `maya_action_executions` (
  `id` CHAR(36) NOT NULL, `proposal_id` CHAR(36) NOT NULL, `attempt` INTEGER NOT NULL DEFAULT 1,
  `status` ENUM('running','succeeded','failed','rolled_back') NOT NULL,
  `external_reference` VARCHAR(160) NULL, `result` JSON NULL, `error_code` VARCHAR(80) NULL,
  `error_message` VARCHAR(600) NULL, `rollback_information` JSON NULL,
  `started_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0), `completed_at` DATETIME(0) NULL,
  UNIQUE INDEX `uq_maya_execution_attempt` (`proposal_id`,`attempt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `domain_outbox_events` (
  `id` CHAR(36) NOT NULL, `aggregate_type` VARCHAR(80) NOT NULL, `aggregate_id` VARCHAR(120) NOT NULL,
  `event_type` VARCHAR(100) NOT NULL, `payload` JSON NOT NULL, `idempotency_key` VARCHAR(160) NOT NULL,
  `status` ENUM('pending','publishing','published','failed','dead_letter') NOT NULL DEFAULT 'pending',
  `attempts` INTEGER NOT NULL DEFAULT 0, `available_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `published_at` DATETIME(0) NULL, `last_error` VARCHAR(600) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_outbox_idempotency` (`idempotency_key`),
  INDEX `idx_outbox_dispatch` (`status`,`available_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `automation_runs` (
  `id` CHAR(36) NOT NULL, `automation_key` VARCHAR(100) NOT NULL, `source_event_id` CHAR(36) NOT NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `status` ENUM('pending','running','waiting_approval','succeeded','failed','dead_letter','cancelled') NOT NULL DEFAULT 'pending',
  `current_step` INTEGER NOT NULL DEFAULT 0, `context` JSON NOT NULL, `attempts` INTEGER NOT NULL DEFAULT 0,
  `next_attempt_at` DATETIME(0) NULL, `last_error` VARCHAR(600) NULL, `started_at` DATETIME(0) NULL,
  `completed_at` DATETIME(0) NULL, `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uq_automation_run_idempotency` (`idempotency_key`),
  INDEX `idx_automation_runs_dispatch` (`status`,`next_attempt_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `provider_capability_health` (
  `id` CHAR(36) NOT NULL, `capability` VARCHAR(80) NOT NULL, `provider` VARCHAR(80) NOT NULL,
  `status` ENUM('healthy','degraded','unavailable','unconfigured') NOT NULL,
  `checked_at` DATETIME(0) NOT NULL, `last_success_at` DATETIME(0) NULL,
  `consecutive_failures` INTEGER NOT NULL DEFAULT 0, `details` JSON NULL,
  UNIQUE INDEX `uq_provider_capability` (`capability`,`provider`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
