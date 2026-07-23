import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  ensureRedis: vi.fn<() => Promise<void>>(),
  getTenantRuntime: vi.fn<() => { tenantId: string } | undefined>(),
  publish: vi.fn<(channel: string, message: string) => Promise<number>>(),
  warn: vi.fn(),
}));

vi.mock('../config/redis.js', () => ({
  ensureRedis: fakes.ensureRedis,
  redis: { publish: fakes.publish },
}));

vi.mock('../config/tenantContext.js', () => ({
  getTenantRuntime: fakes.getTenantRuntime,
}));

vi.mock('../logger/index.js', () => ({
  logger: { warn: fakes.warn },
}));

import {
  CHAT_EVENTS_CHANNEL,
  publishChatEvent,
  type ChatEventMessage,
} from '../services/chatEventService.js';

const baseMessage: ChatEventMessage = {
  event: 'chat:global-message',
  payload: { messageId: 42, preview: 'Fictional itinerary update' },
};

beforeEach(() => {
  vi.resetAllMocks();
  fakes.ensureRedis.mockResolvedValue(undefined);
  fakes.publish.mockResolvedValue(1);
  fakes.getTenantRuntime.mockReturnValue(undefined);
});

describe('chat event publisher contract', () => {
  it('preserves an explicit tenant and publishes once on the chat channel', async () => {
    fakes.getTenantRuntime.mockReturnValue({ tenantId: 'runtime-tenant' });

    await publishChatEvent({ ...baseMessage, tenantId: 'explicit-tenant' });

    expect(fakes.ensureRedis).toHaveBeenCalledOnce();
    expect(fakes.publish).toHaveBeenCalledOnce();
    expect(fakes.publish).toHaveBeenCalledWith(
      CHAT_EVENTS_CHANNEL,
      JSON.stringify({ ...baseMessage, tenantId: 'explicit-tenant' }),
    );
    expect(fakes.warn).not.toHaveBeenCalled();
  });

  it('uses the active runtime tenant when the message omits one', async () => {
    fakes.getTenantRuntime.mockReturnValue({ tenantId: 'active-tenant' });

    await publishChatEvent(baseMessage);

    expect(JSON.parse(fakes.publish.mock.calls[0]![1])).toEqual({
      ...baseMessage,
      tenantId: 'active-tenant',
    });
  });

  it('serializes routing and payload fields without mutating the caller message', async () => {
    const message: ChatEventMessage = {
      recipients: ['staff-7', 'guest-sample'],
      staffBroadcast: true,
      event: 'chat:support-message',
      payload: {
        chatId: 17,
        attachment: { name: 'sample-itinerary.pdf', available: true },
      },
    };
    const original = structuredClone(message);
    fakes.getTenantRuntime.mockReturnValue({ tenantId: 'active-tenant' });

    await publishChatEvent(message);

    expect(JSON.parse(fakes.publish.mock.calls[0]![1])).toEqual({
      ...original,
      tenantId: 'active-tenant',
    });
    expect(message).toEqual(original);
    expect(Object.hasOwn(message, 'tenantId')).toBe(false);
  });

  it('logs and swallows a Redis connection failure without publishing', async () => {
    fakes.ensureRedis.mockRejectedValueOnce(new Error('connection unavailable'));

    await expect(publishChatEvent(baseMessage)).resolves.toBeUndefined();

    expect(fakes.publish).not.toHaveBeenCalled();
    expect(fakes.warn).toHaveBeenCalledOnce();
    expect(fakes.warn).toHaveBeenCalledWith('Chat event publish failed', {
      event: 'chat:global-message',
      error: 'connection unavailable',
    });
  });

  it('logs and swallows a publish failure without retrying or changing the payload', async () => {
    fakes.publish.mockRejectedValueOnce(new Error('publish unavailable'));

    await expect(publishChatEvent(baseMessage)).resolves.toBeUndefined();

    expect(fakes.ensureRedis).toHaveBeenCalledOnce();
    expect(fakes.publish).toHaveBeenCalledOnce();
    expect(fakes.warn).toHaveBeenCalledOnce();
    expect(fakes.warn).toHaveBeenCalledWith('Chat event publish failed', {
      event: 'chat:global-message',
      error: 'publish unavailable',
    });
  });
});
