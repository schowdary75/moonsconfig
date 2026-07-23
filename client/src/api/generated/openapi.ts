/** Regenerate from GET /api/openapi.json during API client automation. */
export type ApiPath =
  | '/health'
  | '/auth/login'
  | '/auth/refresh'
  | '/auth/logout'
  | '/auth/me'
  | '/auth/legacy/exchange'
  | '/users'
  | `/users/${number}`
  | '/uploads'
  | `/uploads/${string}`;
