import { describe, expect, it } from 'vitest';

import { isValidGoogleClientId } from './googleAuth';

describe('Google OAuth configuration', () => {
  it('rejects missing and malformed client IDs', () => {
    expect(isValidGoogleClientId(undefined)).toBe(false);
    expect(isValidGoogleClientId('not-a-google-client')).toBe(false);
  });

  it('accepts the Google web client ID format', () => {
    expect(isValidGoogleClientId('123456789-example.apps.googleusercontent.com')).toBe(true);
  });
});
