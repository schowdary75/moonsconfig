import { logger } from '../logger/index.js';
import { env } from '../config/env.js';

/**
 * Sends SMS through the capcom6 "SMS Gate" Android app running in Local Server mode
 * (https://sms-gate.app). The app exposes an HTTP API on the phone over the LAN:
 *
 *   POST {SMS_GATEWAY_URL}/message
 *   Authorization: Basic base64(username:password)
 *   { "message": "...", "phoneNumbers": ["+9199..."] }
 *
 * This keeps SMS fully local (no cloud provider) — the phone sends from its own SIM.
 */
export class SMSService {
  private get configured(): boolean {
    return Boolean(env.smsGateway.url && env.smsGateway.username && env.smsGateway.password);
  }

  private authHeader(): string {
    const raw = `${env.smsGateway.username}:${env.smsGateway.password}`;
    return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
  }

  /**
   * Send an SMS via the Android gateway.
   * @param to Recipient phone number (E.164 preferred, e.g. +9199...).
   * @param message Text body.
   * @returns true on success, false on any failure (never throws).
   */
  async sendSMS(to: string, message: string): Promise<boolean> {
    if (!this.configured) {
      logger.error('SMS gateway is not configured (SMS_GATEWAY_URL/USERNAME/PASSWORD)');
      return false;
    }

    const url = `${env.smsGateway.url}/message`;
    try {
      logger.info('Sending SMS via Android gateway', { to, url });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.authHeader(),
          },
          body: JSON.stringify({ message, phoneNumbers: [to] }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error('SMS gateway rejected message', {
          status: response.status,
          statusText: response.statusText,
          body: body.slice(0, 300),
        });
        return false;
      }

      logger.info('SMS accepted by gateway', { to });
      return true;
    } catch (error) {
      logger.error('Error sending SMS via gateway', { error });
      return false;
    }
  }

  /** Handle an incoming SMS webhook forwarded by the Android device. */
  async handleIncomingSMS(reqBody: { from?: string; message?: string }) {
    logger.info('Received incoming SMS', { from: reqBody.from, message: reqBody.message });
    return { status: 'received' };
  }
}

export const smsService = new SMSService();
