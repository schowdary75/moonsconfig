import { describe, expect, it } from 'vitest';

import {
  RfqPayloadValidationError,
  buildRfqPayload,
  toRfqComposeRequest,
  toRfqSendRequest,
} from './rfqPayload';

const baseInput = {
  packageId: 42,
  scopes: ['full'],
  travelDates: {
    from: new Date(2026, 0, 10),
    to: new Date(2026, 0, 14),
  },
  vendorIds: [101],
};

describe('buildRfqPayload', () => {
  it('builds the full-package operation contract', () => {
    const payload = buildRfqPayload(baseInput);

    expect(toRfqComposeRequest(payload)).toEqual({
      packageId: 42,
      scope: ['full'],
      travelDates: 'Jan 10, 2026 - Jan 14, 2026',
      customHotels: [],
    });
  });

  it('builds a hotel-only request with a fictional custom hotel', () => {
    const payload = buildRfqPayload({
      ...baseInput,
      scopes: ['hotels'],
      hotelRequests: [{ name: 'Example Harbour Hotel', source: 'custom' }],
    });

    expect(payload.scope).toEqual(['hotels']);
    expect(payload.hotelRequests).toEqual([{ name: 'Example Harbour Hotel', source: 'custom' }]);
  });

  it('normalizes multi-scope and duplicate-scope requests in stable order', () => {
    const payload = buildRfqPayload({
      ...baseInput,
      scopes: ['cruise', 'hotels', 'full', 'hotels', 'transport'],
      vendorIds: [101, 101, 202],
    });

    expect(payload.scope).toEqual(['full', 'hotels', 'transport', 'cruise']);
    expect(payload.vendorIds).toEqual([101, 202]);
  });

  it('builds a validated send request with message content', () => {
    const payload = buildRfqPayload({
      ...baseInput,
      message: {
        subject: ' Fictional group request ',
        htmlBody: ' <p>Please quote the sample journey.</p> ',
      },
    });

    expect(toRfqSendRequest(payload)).toEqual({
      packageId: 42,
      vendorIds: [101],
      subject: 'Fictional group request',
      htmlBody: '<p>Please quote the sample journey.</p>',
    });
  });

  it.each([
    [{ ...baseInput, vendorIds: [] }, 'vendors'],
    [{ ...baseInput, scopes: [] }, 'scope'],
    [
      {
        ...baseInput,
        travelDates: {
          from: new Date(2026, 0, 15),
          to: new Date(2026, 0, 10),
        },
      },
      'travelDates',
    ],
    [
      {
        ...baseInput,
        scopes: ['hotels'],
        hotelRequests: [{ name: 'Invalid\nHotel', source: 'custom' as const }],
      },
      'hotels',
    ],
  ])('rejects invalid input before a request is built', (input, field) => {
    expect(() => buildRfqPayload(input)).toThrow(RfqPayloadValidationError);
    try {
      buildRfqPayload(input);
    } catch (error) {
      expect(error).toMatchObject({ field });
    }
  });

  it('rejects an empty message before send', () => {
    const payload = buildRfqPayload(baseInput);
    expect(() => toRfqSendRequest(payload)).toThrow(/Subject and message body are required/);
  });
});
