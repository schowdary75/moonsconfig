const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

export function isValidGoogleClientId(value: string | undefined) {
  const clientId = value?.trim() ?? '';
  return clientId.includes('-') && clientId.endsWith(GOOGLE_CLIENT_ID_SUFFIX);
}

export const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
export const isGoogleAuthConfigured = isValidGoogleClientId(googleClientId);
