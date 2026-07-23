-- The customer live-trip/SOS path still reads these additive legacy projection
-- tables. Some tenant databases were provisioned before they were migrated.
CREATE TABLE IF NOT EXISTS `trip_daily_schedules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_id` INTEGER NOT NULL,
  `day_number` INTEGER NOT NULL,
  `time_slot` VARCHAR(50) NOT NULL,
  `activity_title` VARCHAR(255) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  `driver_id` INTEGER NULL,
  `inclusions_text` TEXT NULL,
  `exclusions_text` TEXT NULL,
  `est_spending` VARCHAR(100) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_trip_daily_schedules_booking` (`booking_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trip_live_milestones` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_id` INTEGER NOT NULL,
  `phase_name` VARCHAR(100) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
  `timestamp` DATETIME(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_trip_live_milestones_booking` (`booking_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
