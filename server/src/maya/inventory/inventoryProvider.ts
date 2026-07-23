import { logger } from '../../logger/index.js';

/**
 * Live-inventory adapter — the seam where a real GDS / hotel bedbank
 * (Amadeus, Sabre, TBO, etc.) plugs in to replace hallucinated "GDS simulator"
 * results. Until a real provider is configured it reports `available: false`,
 * and Maya falls back to the genuine package catalogue via the `find_packages`
 * tool rather than inventing fares. Nothing fake is ever quoted.
 *
 * Env for a live provider:
 *   INVENTORY_PROVIDER        e.g. "amadeus" | "tbo" (unset = fallback)
 *   INVENTORY_API_BASE_URL
 *   INVENTORY_API_KEY
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
  /** False when no live provider is configured — callers must not fabricate. */
  available: boolean;
  provider: string;
  offers: T[];
}

export interface LiveInventoryProvider {
  readonly configured: boolean;
  searchHotels(query: HotelQuery): Promise<InventoryResult<HotelOffer>>;
}

class ConfigurableInventoryProvider implements LiveInventoryProvider {
  get configured(): boolean {
    return Boolean(
      (process.env.INVENTORY_PROVIDER ?? '').trim() &&
      (process.env.INVENTORY_API_BASE_URL ?? '').trim() &&
      (process.env.INVENTORY_API_KEY ?? '').trim(),
    );
  }

  private get provider(): string {
    return (process.env.INVENTORY_PROVIDER ?? 'none').trim();
  }

  async searchHotels(query: HotelQuery): Promise<InventoryResult<HotelOffer>> {
    if (!this.configured) {
      return { available: false, provider: 'fallback', offers: [] };
    }
    const base = (process.env.INVENTORY_API_BASE_URL ?? '').replace(/\/+$/, '');
    const url = `${base}/hotels/search`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(process.env.INVENTORY_API_KEY ?? '').trim()}`,
        },
        body: JSON.stringify({
          destination: query.destination,
          checkIn: query.checkIn.toISOString().slice(0, 10),
          checkOut: query.checkOut.toISOString().slice(0, 10),
          guests: query.guests,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        logger.warn('Inventory provider returned non-OK', { status: response.status });
        return { available: false, provider: this.provider, offers: [] };
      }
      const body = (await response.json()) as { offers?: HotelOffer[] };
      return { available: true, provider: this.provider, offers: body.offers ?? [] };
    } catch (error) {
      logger.warn('Live inventory search failed; falling back to catalogue', { error });
      return { available: false, provider: this.provider, offers: [] };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const inventoryProvider: LiveInventoryProvider = new ConfigurableInventoryProvider();
