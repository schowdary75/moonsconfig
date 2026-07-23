ALTER TABLE `tenants`
  ADD COLUMN `administratively_suspended_at` DATETIME(3) NULL,
  ADD COLUMN `administrative_suspension_reason` VARCHAR(500) NULL,
  ADD COLUMN `administratively_suspended_by_id` CHAR(36) NULL;

ALTER TABLE `subscriptions`
  ADD COLUMN `amount_paise` INTEGER NULL,
  ADD COLUMN `outstanding_paise` INTEGER NULL,
  ADD COLUMN `next_charge_at` DATETIME(3) NULL,
  ADD COLUMN `past_due_since` DATETIME(3) NULL,
  ADD COLUMN `contract_reference` VARCHAR(160) NULL;

ALTER TABLE `billing_invoices`
  ADD COLUMN `due_at` DATETIME(3) NULL,
  ADD COLUMN `amount_paid_paise` INTEGER NULL,
  ADD COLUMN `balance_paise` INTEGER NULL;

UPDATE `billing_invoices`
SET
  `amount_paid_paise` = CASE WHEN `status` = 'paid' THEN `total_paise` ELSE 0 END,
  `balance_paise` = CASE WHEN `status` = 'paid' THEN 0 ELSE `total_paise` END
WHERE `amount_paid_paise` IS NULL OR `balance_paise` IS NULL;

ALTER TABLE `platform_audit_events`
  ADD COLUMN `operator_id` CHAR(36) NULL;

CREATE INDEX `tenants_administratively_suspended_by_id_idx`
  ON `tenants`(`administratively_suspended_by_id`);
CREATE INDEX `platform_audit_events_operator_id_created_at_idx`
  ON `platform_audit_events`(`operator_id`, `created_at`);

ALTER TABLE `tenants`
  ADD CONSTRAINT `tenants_administratively_suspended_by_id_fkey`
  FOREIGN KEY (`administratively_suspended_by_id`) REFERENCES `platform_operators`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `platform_audit_events`
  ADD CONSTRAINT `platform_audit_events_operator_id_fkey`
  FOREIGN KEY (`operator_id`) REFERENCES `platform_operators`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
