-- Legacy imports left rows whose role is not a member of the MySQL ENUM
-- (stored as ''). Prisma cannot deserialize those rows, so every
-- crm_users read that includes roles fails with a 500 (People & Access,
-- team rosters). Normalize the data additively:
--   * secondary role assignments with an invalid value carry no meaning — drop them;
--   * primary roles fall back to the least-privileged role, 'viewer'.

DELETE FROM crm_user_roles
WHERE role NOT IN ('admin','editor','approver','manager','sales','support','finance','marketing','operations','viewer');

UPDATE crm_users
SET role = 'viewer'
WHERE role NOT IN ('admin','editor','approver','manager','sales','support','finance','marketing','operations','viewer');
