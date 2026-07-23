import { z } from 'zod';
import { logger } from '../../logger/index.js';

/**
 * Live-inventory adapter seam. `available: false` means the provider was not
 * queried or did not return a trustworthy response. Callers must use the real
 * package catalogue fallback and must not interpret it as "zero rooms".
 */

export interface HotelQuery {
  destination: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
}

export interface HotelOffer {
  supplier: string;
  hotelName: string;
  roomType: string;
  boardBasis: string;
  totalPriceInr: number;
  cancellationPolicy: string;
}

export interface InventoryResult<T> {
  available: boolean;
  provider: string;
  offers: T[];
}

export interface LiveInventoryProvider {
  readonly configured: boolean;
  searchHotels(query: HotelQuery): Promise<InventoryResult<HotelOffer>>;
}

export interface InventoryProviderConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export interface InventoryHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type InventoryTransport = (url: string, init: RequestInit) => Promise<InventoryHttpResponse>;

export interface InventoryWarningLogger {
  warn(message: string, metadata?: Record<string, unknown>): unknown;
}

export interface InventoryProviderOptions {
  config?: InventoryProviderConfig;
  transport?: InventoryTransport;
  warningLogger?: InventoryWarningLogger;
}

export const RESERVED_EXAMPLE_INVENTORY_PROVIDER = 'example-only';

const hotelOfferSchema = z.object({
  supplier: z.string().trim().min(1).max(160),
  hotelName: z.string().trim().min(1).max(240),
  roomType: z.string().trim().min(1).max(160),
  boardBasis: z.string().trim().min(1).max(160),
  totalPriceInr: z.number().finite().nonnegative(),
  cancellationPolicy: z.string().trim().min(1).max(2_000),
});

const hotelResponseSchema = z.object({
  offers: z.array(hotelOfferSchema).max(1_000),
});

function fallback(provider = 'fallback'): InventoryResult<HotelOffer> {
  return { available: false, provider, offers: [] };
}

function validHotelQuery(query: HotelQuery): boolean {
  return (
    query.destination.trim().length > 0 &&
    Number.isFinite(query.checkIn.getTime()) &&
    Number.isFinite(query.checkOut.getTime()) &&
    query.checkOut > query.checkIn &&
    Number.isInteger(query.guests) &&
    query.guests > 0
  );
}

export function readInventoryProviderConfig(
  environment: NodeJS.ProcessEnv = process.env,
): InventoryProviderConfig {
  const parsedTimeout = Number(environment.INVENTORY_TIMEOUT_MS ?? 20_000);
  return {
    provider: (environment.INVENTORY_PROVIDER ?? '').trim(),
    baseUrl: (environment.INVENTORY_API_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    apiKey: (environment.INVENTORY_API_KEY ?? '').trim(),
    timeoutMs:
      Number.isFinite(parsedTimeout) && parsedTimeout >= 100 && parsedTimeout <= 60_000
        ? parsedTimeout
        : 20_000,
  };
}

class ConfigurableInventoryProvider implements LiveInventoryProvider {
  readonly #config: InventoryProviderConfig;
  readonly #transport: InventoryTransport;
  readonly #warningLogger: InventoryWarningLogger;

  constructor(options: InventoryProviderOptions = {}) {
    this.#config = options.config ?? readInventoryProviderConfig();
    this.#transport =
      options.transport ?? ((url, init) => fetch(url, init) as Promise<InventoryHttpResponse>);
    this.#warningLogger = options.warningLogger ?? logger;
  }

  get configured(): boolean {
    return Boolean(
      this.#config.provider &&
      this.#config.provider !== RESERVED_EXAMPLE_INVENTORY_PROVIDER &&
      this.#config.baseUrl &&
      this.#config.apiKey,
    );
  }

  async searchHotels(query: HotelQuery): Promise<InventoryResult<HotelOffer>> {
    if (!this.configured) return fallback();
    const provider = this.#config.provider;

    if (!validHotelQuery(query)) {
      this.#warningLogger.warn('Inventory search rejected invalid query', {
        provider,
        reason: 'invalid_query',
      });
      return fallback(provider);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.timeoutMs);
    const complete = (result: InventoryResult<HotelOffer>) => {
      clearTimeout(timeout);
      return result;
    };
    let response: InventoryHttpResponse;
    try {
      response = await this.#transport(`${this.#config.baseUrl}/hotels/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#config.apiKey}`,
        },
        body: JSON.stringify({
          destination: query.destination.trim(),
          checkIn: query.checkIn.toISOString().slice(0, 10),
          checkOut: query.checkOut.toISOString().slice(0, 10),
          guests: query.guests,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      this.#warningLogger.warn('Live inventory search failed; falling back to catalogue', {
        provider,
        reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network',
      });
      return complete(fallback(provider));
    }

    if (!response.ok) {
      this.#warningLogger.warn('Inventory provider returned non-OK', {
        provider,
        status: response.status,
      });
      return complete(fallback(provider));
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      const timedOut = controller.signal.aborted;
      this.#warningLogger.warn(
        timedOut
          ? 'Live inventory search failed; falling back to catalogue'
          : 'Inventory provider returned malformed JSON',
        {
          provider,
          reason: timedOut ? 'timeout' : 'invalid_json',
        },
      );
      return complete(fallback(provider));
    }

    const parsed = hotelResponseSchema.safeParse(body);
    if (!parsed.success) {
      this.#warningLogger.warn('Inventory provider response failed validation', {
        provider,
        reason: 'invalid_payload',
      });
      return complete(fallback(provider));
    }

    return complete({ available: true, provider, offers: parsed.data.offers });
  }
}

export function createInventoryProvider(
  options: InventoryProviderOptions = {},
): LiveInventoryProvider {
  return new ConfigurableInventoryProvider(options);
}

export const inventoryProvider: LiveInventoryProvider = createInventoryProvider();
