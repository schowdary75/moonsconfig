export const REFRESH_COOKIE = 'moons_refresh';
export const CUSTOMER_REFRESH_COOKIE = 'moons_customer_refresh';
export const USER_ROLES = [
  'admin',
  'editor',
  'approver',
  'manager',
  'sales',
  'support',
  'finance',
  'marketing',
  'operations',
  'viewer',
] as const;
export type UserRole = (typeof USER_ROLES)[number];
