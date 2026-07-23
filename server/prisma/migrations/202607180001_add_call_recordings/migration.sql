-- Stores one row per recorded call (employee<->customer and customer<->Maya).
-- Audio files are written by Asterisk MixMonitor into the uploads/recordings
-- directory; the Node server's reconciler ingests finalized files into this table.

CREATE TABLE `call_recordings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `uniqueid` VARCHAR(80) NOT NULL,
  `direction` ENUM('inbound','outbound') NOT NULL,
  `from_number` VARCHAR(64) NULL,
  `to_number` VARCHAR(64) NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_size` INTEGER NULL,
  `duration_sec` INTEGER NULL,
  `recorded_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE INDEX `uq_call_recordings_uniqueid`(`uniqueid`),
  INDEX `idx_call_recordings_recorded_at`(`recorded_at`),
  INDEX `idx_call_recordings_direction`(`direction`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
