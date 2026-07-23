import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInventoryProvider,
  readInventoryProviderConfig,
  RESERVED_EXAMPLE_INVENTORY_PROVIDER,
  type HotelQuery,
  type InventoryHttpResponse,
  type InventoryProviderConfig,
  type InventoryTransport,
} from '../maya/inventory/inventoryProvider.js';
import { createExampleInventoryProvider } from '../maya/inventory/exampleInventoryProvider.js';

const query: HotelQuery = {
  destination: 'Test City',
  checkIn: new Date('2030-01-10T00:00:00.000Z'),
  checkOut: new Date('2030-01-12T00:00:00.000Z'),
  guests: 2,
};

const config: InventoryProviderConfig = {
  provider: 'stub-provider',
  baseUrl: 'https://inventory.example.invalid',
  apiKey: 'placeholder',
  timeoutMs: 1_000,
};

function response(
  status: number,
  body: unknown,
  json: () => Promise<unknown> = async () => body,
): InventoryHttpResponse {
  return { ok: status >= 200 && status < 300, status, json };
}

function harness(transport: InventoryTransport, providerConfig = config) {
  const warningLogger = { warn: vi.fn() };
  return {
    provider: createInventoryProvider({
      config: providerConfig,
      transport,
      warningLogger,
    }),
    warningLogger,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('configurable inventory provider', () => {
  it('maps a validated success response and sends the documented request contract', async () => {
    const transport = vi.fn<InventoryTransport>().mockResolvedValue(
      response(200, {
        offers: [
          {
            supplier: 'stub-supplier',
            hotelName: 'Fixture Hotel',
            roomType: 'Fixture Room',
            boardBasis: 'Fixture Board',
            totalPriceInr: 12_345,
            cancellationPolicy: 'Fixture policy; not bookable.',
          },
        ],
      }),
    );
    const { provider, warningLogger } = harness(transport);

    await expect(provider.searchHotels(query)).resolves.toEqual({
      available: true,
      provider: 'stub-provider',
      offers: [
        {
          supplier: 'stub-supplier',
          hotelName: 'Fixture Hotel',
          roomType: 'Fixture Room',
          boardBasis: 'Fixture Board',
          totalPriceInr: 12_345,
          cancellationPolicy: 'Fixture policy; not bookable.',
        },
      ],
    });
    expect(transport).toHaveBeenCalledOnce();
    const [url, request] = transport.mock.calls[0]!;
    expect(url).toBe('https://inventory.example.invalid/hotels/search');
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer placeholder',
      },
      body: JSON.stringify({
        destination: 'Test City',
        checkIn: '2030-01-10',
        checkOut: '2030-01-12',
        guests: 2,
      }),
    });
    expect(warningLogger.warn).not.toHaveBeenCalled();
  });

  it('returns an unavailable result for non-2xx responses without parsing the body', async () => {
    const json = vi.fn();
    const { provider, warningLogger } = harness(async () => response(503, null, json));

    await expect(provider.searchHotels(query)).resolves.toEqual({
      available: false,
      provider: 'stub-provider',
      offers: [],
    });
    expect(json).not.toHaveBeenCalled();
    expect(warningLogger.warn).toHaveBeenCalledWith('Inventory provider returned non-OK', {
      provider: 'stub-provider',
      status: 503,
    });
  });

  it('aborts at the configured timeout and reports only a safe reason', async () => {
    vi.useFakeTimers();
    const transport: InventoryTransport = (_url, request) =>
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('request aborted'), { name: 'AbortError' }));
        });
      });
    const { provider, warningLogger } = harness(transport, { ...config, timeoutMs: 250 });

    const pending = provider.searchHotels(query);
    await vi.advanceTimersByTimeAsync(250);

    await expect(pending).resolves.toEqual({
      available: false,
      provider: 'stub-provider',
      offers: [],
    });
    expect(warningLogger.warn).toHaveBeenCalledWith(
      'Live inventory search failed; falling back to catalogue',
      { provider: 'stub-provider', reason: 'timeout' },
    );
  });

  it('falls back on a network failure without logging the error object or request data', async () => {
    const { provider, warningLogger } = harness(async () => {
      throw new Error('transport details that must not be logged');
    });

    await expect(provider.searchHotels(query)).resolves.toMatchObject({
      available: false,
      provider: 'stub-provider',
      offers: [],
    });
    expect(warningLogger.warn).toHaveBeenCalledWith(
      'Live inventory search failed; falling back to catalogue',
      { provider: 'stub-provider', reason: 'network' },
    );
  });

  it('rejects malformed JSON and structurally invalid offers', async () => {
    const malformedJson = harness(async () =>
      response(200, null, async () => {
        throw new SyntaxError('bad json');
      }),
    );
    await expect(malformedJson.provider.searchHotels(query)).resolves.toMatchObject({
      available: false,
      offers: [],
    });
    expect(malformedJson.warningLogger.warn).toHaveBeenCalledWith(
      'Inventory provider returned malformed JSON',
      { provider: 'stub-provider', reason: 'invalid_json' },
    );

    const malformedPayload = harness(async () =>
      response(200, { offers: [{ hotelName: 'missing required fields' }] }),
    );
    await expect(malformedPayload.provider.searchHotels(query)).resolves.toMatchObject({
      available: false,
      offers: [],
    });
    expect(malformedPayload.warningLogger.warn).toHaveBeenCalledWith(
      'Inventory provider response failed validation',
      { provider: 'stub-provider', reason: 'invalid_payload' },
    );
  });

  it('uses the catalogue fallback when configuration is missing or reserved for examples', async () => {
    const transport = vi.fn<InventoryTransport>();
    const missing = harness(transport, { ...config, apiKey: '' }).provider;
    const reserved = harness(transport, {
      ...config,
      provider: RESERVED_EXAMPLE_INVENTORY_PROVIDER,
    }).provider;

    expect(missing.configured).toBe(false);
    expect(reserved.configured).toBe(false);
    await expect(missing.searchHotels(query)).resolves.toEqual({
      available: false,
      provider: 'fallback',
      offers: [],
    });
    await expect(reserved.searchHotels(query)).resolves.toEqual({
      available: false,
      provider: 'fallback',
      offers: [],
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('normalizes environment configuration and rejects unsafe timeout values', () => {
    expect(
      readInventoryProviderConfig({
        INVENTORY_PROVIDER: ' stub ',
        INVENTORY_API_BASE_URL: 'https://inventory.example.invalid///',
        INVENTORY_API_KEY: ' placeholder ',
        INVENTORY_TIMEOUT_MS: '999999',
      }),
    ).toEqual({
      provider: 'stub',
      baseUrl: 'https://inventory.example.invalid',
      apiKey: 'placeholder',
      timeoutMs: 20_000,
    });
  });
});

describe('credential-free example adapter', () => {
  it('maps injected fixtures and watermarks them as not bookable', async () => {
    const provider = createExampleInventoryProvider({
      runtime: 'test',
      transport: async () => ({
        results: [
          {
            supplierReference: 'fixture',
            propertyName: 'Example Property',
            roomName: 'Example Room',
            mealPlan: 'Example Board',
            amount: 100,
            cancellationText: 'Example only.',
          },
        ],
      }),
    });

    const result = await provider.searchHotels(query);

    expect(result.available).toBe(true);
    expect(result.provider).toBe(RESERVED_EXAMPLE_INVENTORY_PROVIDER);
    expect(result.offers[0]?.supplier).toBe('EXAMPLE-NOT-BOOKABLE:fixture');
  });

  it('cannot be constructed for production', () => {
    expect(() =>
      createExampleInventoryProvider({ runtime: 'production', transport: vi.fn() }),
    ).toThrow(/cannot run in production/);
  });
});
