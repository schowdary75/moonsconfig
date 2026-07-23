import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';

import { OperationRequestError } from '@/services/legacyOperationService';
import { shouldRetryQuery } from './queryClient';

describe('query retry policy', () => {
  it('does not amplify rate limits or other client errors', () => {
    const error = new AxiosError('Too many requests', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {},
      config: { headers: {} } as never,
      data: {},
    });

    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it('does not retry legacy operation errors after Axios has been normalized', () => {
    expect(shouldRetryQuery(0, new OperationRequestError('Too many requests', 429, 120_000))).toBe(
      false,
    );
  });

  it('allows one retry for transient failures', () => {
    expect(shouldRetryQuery(0, new Error('Network failure'))).toBe(true);
    expect(shouldRetryQuery(1, new Error('Network failure'))).toBe(false);
  });
});
