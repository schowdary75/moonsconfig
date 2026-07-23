-- Maya action-layer tables (additive; no changes to existing tables).

CREATE TABLE `visa_cases` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NULL,
  `customer_id` INTEGER NULL,
  `destination` VARCHAR(160) NOT NULL,
  `travel_date` DATE NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'not_started',
  `notes` TEXT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_visa_cases_status`(`status`),
  INDEX `idx_visa_cases_travel_date`(`travel_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `traveller_documents` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `traveler_ref` VARCHAR(120) NOT NULL,
  `doc_type` VARCHAR(20) NOT NULL,
  `file_url` VARCHAR(500) NOT NULL,
  `expires_on` DATE NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_traveller_documents_ref`(`traveler_ref`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `maya_flight_watches` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_id` INTEGER NOT NULL,
  `flight_number` VARCHAR(20) NOT NULL,
  `scheduled_departure` DATETIME(0) NOT NULL,
  `international` BOOLEAN NOT NULL DEFAULT false,
  `traveller_phone` VARCHAR(50) NULL,
  `traveller_name` VARCHAR(255) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `last_checked_at` DATETIME(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_maya_flight_watches_active`(`active`),
  INDEX `idx_maya_flight_watches_booking`(`booking_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
