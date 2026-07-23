import { logger } from '../../logger/index.js';

/**
 * Flight-status feed for the disruption shield.
 *
 * Live status comes from a real provider (AeroDataBox via RapidAPI) when its key
 * is configured; otherwise the provider reports `unknown` and the shield simply
 * stays quiet. It never fabricates a delay — a false "your flight is cancelled"
 * alert is worse than none.
 *
 * Env for live status:
 *   AERODATABOX_API_KEY   RapidAPI key for aerodatabox.p.rapidapi.com
 */

export type FlightState = 'on_time' | 'delayed' | 'cancelled' | 'unknown';

export interface FlightStatus {
  flightNumber: string;
  state: FlightState;
  /** Positive minutes of delay when known; 0 otherwise. */
  delayMinutes: number;
  scheduledDeparture: Date;
}

export interface FlightStatusProvider {
  readonly configured: boolean;
  getStatus(flightNumber: string, departureDate: Date): Promise<FlightStatus>;
}

const UNKNOWN = (flightNumber: string, scheduledDeparture: Date): FlightStatus => ({
  flightNumber,
  state: 'unknown',
  delayMinutes: 0,
  scheduledDeparture,
});

export class AeroDataBoxProvider implements FlightStatusProvider {
  get configured(): boolean {
    return Boolean((process.env.AERODATABOX_API_KEY ?? '').trim());
  }

  async getStatus(flightNumber: string, departureDate: Date): Promise<FlightStatus> {
    if (!this.configured) return UNKNOWN(flightNumber, departureDate);
    const key = (process.env.AERODATABOX_API_KEY ?? '').trim();
    const dateStr = departureDate.toISOString().slice(0, 10);
    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(
      flightNumber,
    )}/${dateStr}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': key,
          'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        logger.warn('Flight-status provider returned non-OK', {
          flightNumber,
          status: response.status,
        });
        return UNKNOWN(flightNumber, departureDate);
      }
      const body = (await response.json()) as unknown;
      return this.parse(flightNumber, departureDate, body);
    } catch (error) {
      logger.warn('Flight-status lookup failed', { flightNumber, error });
      return UNKNOWN(flightNumber, departureDate);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Extract a normalised status from AeroDataBox's flight array response. */
  private parse(flightNumber: string, scheduledDeparture: Date, body: unknown): FlightStatus {
    const flights = Array.isArray(body) ? body : [];
    const flight = flights[0] as
      | {
          status?: string;
          departure?: { scheduledTime?: { utc?: string }; revisedTime?: { utc?: string } };
        }
      | undefined;
    if (!flight) return UNKNOWN(flightNumber, scheduledDeparture);

    const status = (flight.status ?? '').toLowerCase();
    if (status.includes('cancel')) {
      return { flightNumber, state: 'cancelled', delayMinutes: 0, scheduledDeparture };
    }

    const scheduled = flight.departure?.scheduledTime?.utc;
    const revised = flight.departure?.revisedTime?.utc;
    let delayMinutes = 0;
    if (scheduled && revised) {
      delayMinutes = Math.max(
        0,
        Math.round((new Date(revised).getTime() - new Date(scheduled).getTime()) / 60_000),
      );
    }
    return {
      flightNumber,
      state: delayMinutes > 0 ? 'delayed' : 'on_time',
      delayMinutes,
      scheduledDeparture,
    };
  }
}

export const flightStatusProvider: FlightStatusProvider = new AeroDataBoxProvider();
