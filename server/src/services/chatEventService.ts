import { ensureRedis, redis } from '../config/redis.js';
import { logger } from '../logger/index.js';
import { getTenantRuntime } from '../config/tenantContext.js';

export const CHAT_EVENTS_CHANNEL = 'moonsconfig:chat';

export interface ChatEventMessage {
  tenantId?: string;
  /** Global-chat entity ids (crm user id / guest id) whose room should receive the event. */
  recipients?: string[];
  /** Deliver to every connected staff socket (support-queue updates). */
  staffBroadcast?: boolean;
  event: 'chat:global-message' | 'chat:support-message';
  payload: Record<string, unknown>;
}

/**
 * Publish a chat event over Redis so the socket server (which may live in a
 * different process than the sender — API vs worker) can push it to connected
 * clients instantly. Chat still works without sockets: clients poll as a
 * fallback, so publish failures are logged and swallowed.
 */
export async function publishChatEvent(message: ChatEventMessage): Promise<void> {
  try {
    await ensureRedis();
    const tenantId = message.tenantId ?? getTenantRuntime()?.tenantId;
    await redis.publish(CHAT_EVENTS_CHANNEL, JSON.stringify({ ...message, tenantId }));
  } catch (error) {
    logger.warn('Chat event publish failed', {
      event: message.event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
