-- Access codes for protected CRM screens are stored only as salted hashes.
CREATE TABLE `protected_screen_access` (
  `screen_key` VARCHAR(80) NOT NULL,
  `access_code_hash` VARCHAR(255) NOT NULL,
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`screen_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `protected_screen_access` (`screen_key`, `access_code_hash`)
VALUES (
  'trending-2',
  'pbkdf2_sha256$210000$f70120a9bd31bf0d3622ab32241365d5$5e0a8159246e40e67b83295bb4e4ba13a270292d5b72e01aeb10e336063d6cbc'
);
