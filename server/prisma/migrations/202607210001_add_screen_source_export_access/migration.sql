-- Fixed screen-source export access is stored only as a salted password hash.
INSERT INTO `protected_screen_access` (`screen_key`, `access_code_hash`)
VALUES (
  'screen-source-export',
  'pbkdf2_sha256$210000$ef5debad507408c68aad78b5328e1239$6228abfeb81df165f2f5bb7d2b4b165bc6bb197ea6f33bfbbfc70eee6fab71f0'
)
ON DUPLICATE KEY UPDATE
  `access_code_hash` = VALUES(`access_code_hash`);
