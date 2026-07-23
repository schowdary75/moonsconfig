-- Suppression list for promotional/marketing SMS. Transactional messages
-- (OTP, booking lifecycle, receipts, follow-ups) ignore this list; only
-- promotional broadcasts check it. Populated by inbound "STOP" replies and
-- by manual opt-out from the CRM.

CREATE TABLE `sms_opt_outs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `phone` VARCHAR(32) NOT NULL,
  `reason` VARCHAR(64) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE INDEX `uq_sms_opt_outs_phone`(`phone`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
