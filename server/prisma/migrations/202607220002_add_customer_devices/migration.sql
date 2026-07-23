CREATE TABLE `customer_devices` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `token` VARCHAR(512) NOT NULL,
  `platform` VARCHAR(20) NOT NULL,
  `app_version` VARCHAR(40) NULL,
  `last_seen_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `uq_customer_devices_token`(`token`),
  INDEX `idx_customer_devices_user`(`user_id`),
  INDEX `idx_customer_devices_platform`(`platform`),
  PRIMARY KEY (`id`),
  CONSTRAINT `customer_devices_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
