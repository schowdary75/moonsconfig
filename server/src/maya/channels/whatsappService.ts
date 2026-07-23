import { logger } from '../../logger/index.js';
import { smsService } from '../../services/smsService.js';
import type { MessageDelivery } from '../types.js';

/**
 * WhatsApp delivery for Maya, with an automatic SMS fallback.
 *
 * The channel goes "live" the moment the WhatsApp Cloud API credentials are
 * present in the environment; until then (and on any WhatsApp failure) messages
 * transparently fall back to the existing local SMS gateway so nothing is ever
 * silently dropped — and, crucially, nothing fake is ever sent to a customer.
 *
 * Required env for live WhatsApp:
 *   WHATSAPP_PHONE_NUMBER_ID   Cloud API phone-number id
 *   WHATSAPP_ACCESS_TOKEN      permanent/system-user token
 *   WHATSAPP_API_VERSION       optional, defaults to v21.0
 */
export class WhatsAppService {
  private get phoneNumberId(): string {
    return (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim();
  }

  private get accessToken(): string {
    return (process.env.WHATSAPP_ACCESS_TOKEN ?? '').trim();
  }

  private get apiVersion(): string {
    return (process.env.WHATSAPP_API_VERSION ?? 'v21.0').trim();
  }

  get configured(): boolean {
    return Boolean(this.phoneNumberId && this.accessToken);
  }

  /** Normalise to the digits-only form the Cloud API expects (no leading +). */
  private toWaRecipient(to: string): string {
    return to.replace(/[^\d]/g, '');
  }

  /**
   * Send a free-form text message. Prefers WhatsApp; falls back to SMS on any
   * misconfiguration or delivery error. Never throws.
   */
  async sendText(to: string, message: string): Promise<MessageDelivery> {
    if (this.configured) {
      const delivered = await this.sendViaCloudApi(to, message);
      if (delivered.ok) return delivered;
      logger.warn('WhatsApp send failed; falling back to SMS', { to, error: delivered.error });
    }
    return this.sendViaSms(to, message);
  }

  private async sendViaCloudApi(to: string, message: string): Promise<MessageDelivery> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: this.toWaRecipient(to),
          type: 'text',
          text: { preview_url: false, body: message },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return {
          ok: false,
          channel: 'whatsapp',
          provider: 'whatsapp_cloud',
          error: `HTTP ${response.status}: ${body.slice(0, 300)}`,
        };
      }
      logger.info('WhatsApp message accepted by Cloud API', { to });
      return { ok: true, channel: 'whatsapp', provider: 'whatsapp_cloud' };
    } catch (error) {
      return {
        ok: false,
        channel: 'whatsapp',
        provider: 'whatsapp_cloud',
        error: error instanceof Error ? error.message : 'unknown error',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sendViaSms(to: string, message: string): Promise<MessageDelivery> {
    const ok = await smsService.sendSMS(to, message);
    return {
      ok,
      channel: 'sms',
      provider: 'sms_gateway',
      error: ok ? undefined : 'SMS gateway delivery failed or not configured',
    };
  }
}

export const whatsappService = new WhatsAppService();
