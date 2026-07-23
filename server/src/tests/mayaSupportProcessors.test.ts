import { describe, expect, it, vi } from 'vitest';
import {
  createGovernedGlobalChatProcessor,
  type GlobalChatProcessorContext,
  type GlobalChatReplyProvider,
  type GovernedGlobalChatRepository,
} from '../maya/support/globalChatProcessor.js';
import {
  createGovernedSupportChatProcessor,
  type GovernedSupportChatRepository,
  type SupportChatProcessorContext,
  type SupportChatReplyProvider,
} from '../maya/support/supportChatProcessor.js';

function createSupportHarness(message = 'What time is my pickup tomorrow?', mayaMode = 'copilot') {
  const context: SupportChatProcessorContext = {
    chat: {
      id: 7,
      customer_id: 42,
      guest_name: 'Sample Traveller',
      guest_phone: '+10000000000',
    },
    messages: [{ id: 101, sender_id: 42, content: message }],
    customer: { id: 42, name: 'Sample Traveller', phone: '+10000000000' },
    conversation: { id: 'support-conversation', mayaMode },
  };
  const reserved = new Set<number>();
  const replies: string[] = [];
  const inboundBodies: string[] = [];
  const staffEvents: Array<{ action: string; category?: string; input?: string }> = [];
  const repository: GovernedSupportChatRepository = {
    acquire: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(context),
    reserveInbound: vi.fn(async (_context, messageId, body) => {
      inboundBodies.push(body);
      if (reserved.has(messageId)) return false;
      reserved.add(messageId);
      return true;
    }),
    escalate: vi.fn(async (_context, triage, safeInput) => {
      context.conversation.mayaMode = 'human_only';
      staffEvents.push({
        action: 'urgent_support_escalation',
        category: triage.category,
        input: safeInput,
      });
      return "I've alerted our on-trip team immediately. Please stay somewhere safe.";
    }),
    saveReply: vi.fn(async (_context, reply) => {
      replies.push(reply);
    }),
    recordProviderFailure: vi.fn(async () => {
      staffEvents.push({ action: 'support_reply_provider_failure' });
    }),
  };
  const replyProvider: SupportChatReplyProvider = {
    respond: vi.fn().mockResolvedValue('Your pickup is scheduled for 9:00 AM.'),
  };

  return {
    context,
    inboundBodies,
    process: createGovernedSupportChatProcessor({ repository, replyProvider }),
    replies,
    replyProvider,
    repository,
    staffEvents,
  };
}

function createGlobalHarness(message = 'What time is my pickup tomorrow?', mayaMode = 'copilot') {
  const context: GlobalChatProcessorContext = {
    request: {
      id: 9,
      customer_id: 'sample-lead',
      customer_name: 'Sample Traveller',
    },
    messages: [
      {
        id: 201,
        sender_id: 'sample-lead',
        sender_type: 'lead',
        message_text: message,
      },
    ],
    conversation: { id: 'global-conversation', mayaMode },
  };
  const reserved = new Set<number>();
  const replies: string[] = [];
  const inboundBodies: string[] = [];
  const staffEvents: Array<{ action: string; category?: string }> = [];
  const repository: GovernedGlobalChatRepository = {
    isEnabled: () => true,
    acquire: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(context),
    reserveInbound: vi.fn(async (_context, messageId, _customerId, body) => {
      inboundBodies.push(body);
      if (reserved.has(messageId)) return false;
      reserved.add(messageId);
      return true;
    }),
    escalate: vi.fn(async (_context, triage) => {
      context.conversation.mayaMode = 'human_only';
      staffEvents.push({
        action: 'urgent_global_chat_escalation',
        category: triage.category,
      });
      return "I've alerted our on-trip team immediately. Please stay somewhere safe.";
    }),
    saveReply: vi.fn(async (_context, _customerId, reply) => {
      replies.push(reply);
    }),
    recordProviderFailure: vi.fn(async () => {
      staffEvents.push({ action: 'global_chat_reply_provider_failure' });
    }),
  };
  const replyProvider: GlobalChatReplyProvider = {
    respond: vi.fn().mockResolvedValue('Your pickup is scheduled for 9:00 AM.'),
  };

  return {
    context,
    inboundBodies,
    process: createGovernedGlobalChatProcessor({ repository, replyProvider }),
    replies,
    replyProvider,
    repository,
    staffEvents,
  };
}

describe('governed legacy support chat processor', () => {
  it('sends a normal reply through the governed provider path', async () => {
    const harness = createSupportHarness();

    await expect(harness.process(7)).resolves.toBe(true);

    expect(harness.replyProvider.respond).toHaveBeenCalledWith(
      expect.objectContaining({ safeInput: 'What time is my pickup tomorrow?' }),
    );
    expect(harness.replies).toEqual(['Your pickup is scheduled for 9:00 AM.']);
    expect(harness.repository.release).toHaveBeenCalledWith(7);
  });

  it('redacts sensitive identifiers before persistence and provider prompts', async () => {
    const harness = createSupportHarness('Please check passport number A1234567.');
    harness.context.messages.unshift({
      id: 100,
      sender_id: 42,
      content: 'My Aadhaar number is 1234 5678 9012.',
    });

    await harness.process(7);

    expect(harness.inboundBodies).toEqual(['Please check passport number [REDACTED].']);
    expect(harness.replyProvider.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        safeInput: 'Please check passport number [REDACTED].',
        history: [{ role: 'user', parts: [{ text: 'My Aadhaar number is [REDACTED ID].' }] }],
      }),
    );
    expect(JSON.stringify(vi.mocked(harness.replyProvider.respond).mock.calls)).not.toContain(
      'A1234567',
    );
    expect(JSON.stringify(vi.mocked(harness.replyProvider.respond).mock.calls)).not.toContain(
      '1234 5678 9012',
    );
  });

  it('acknowledges an urgent traveller and creates a staff-visible escalation', async () => {
    const harness = createSupportHarness('I lost passport number A1234567 and I am stranded.');

    await expect(harness.process(7)).resolves.toBe(true);

    expect(harness.replyProvider.respond).not.toHaveBeenCalled();
    expect(harness.replies[0]).toContain('alerted our on-trip team');
    expect(harness.context.conversation.mayaMode).toBe('human_only');
    expect(harness.staffEvents).toEqual([
      {
        action: 'urgent_support_escalation',
        category: 'emergency',
        input: 'I lost passport number [REDACTED] and I am stranded.',
      },
    ]);
  });

  it('leaves a human-owned conversation untouched', async () => {
    const harness = createSupportHarness('Can someone help?', 'human_only');

    await expect(harness.process(7)).resolves.toBe(false);

    expect(harness.repository.reserveInbound).not.toHaveBeenCalled();
    expect(harness.replyProvider.respond).not.toHaveBeenCalled();
    expect(harness.replies).toEqual([]);
  });

  it('records a provider failure for staff without sending a reply', async () => {
    const harness = createSupportHarness();
    vi.mocked(harness.replyProvider.respond).mockRejectedValueOnce(
      new Error('provider unavailable'),
    );

    await expect(harness.process(7)).resolves.toBe(false);

    expect(harness.replies).toEqual([]);
    expect(harness.staffEvents).toEqual([{ action: 'support_reply_provider_failure' }]);
    expect(harness.repository.release).toHaveBeenCalledWith(7);
  });

  it('does not send a duplicate reply when the latest message is reprocessed', async () => {
    const harness = createSupportHarness();

    await expect(harness.process(7)).resolves.toBe(true);
    await expect(harness.process(7)).resolves.toBe(false);

    expect(harness.replyProvider.respond).toHaveBeenCalledOnce();
    expect(harness.repository.saveReply).toHaveBeenCalledOnce();
  });
});

describe('governed website chat processor', () => {
  it('sends a normal reply through the governed provider path', async () => {
    const harness = createGlobalHarness();

    await expect(harness.process(9, 'sample-lead')).resolves.toEqual({
      processed: true,
      disabled: false,
    });

    expect(harness.replyProvider.respond).toHaveBeenCalledWith(
      expect.objectContaining({ safeInput: 'What time is my pickup tomorrow?' }),
    );
    expect(harness.replies).toEqual(['Your pickup is scheduled for 9:00 AM.']);
    expect(harness.repository.release).toHaveBeenCalledWith(9);
  });

  it('redacts sensitive identifiers before persistence and provider prompts', async () => {
    const harness = createGlobalHarness('Please check visa number B7654321.');
    harness.context.messages.unshift({
      id: 200,
      sender_id: 'sample-lead',
      sender_type: 'lead',
      message_text: 'My Aadhaar is 1234 5678 9012.',
    });

    await harness.process(9, 'sample-lead');

    expect(harness.inboundBodies).toEqual(['Please check visa number [REDACTED].']);
    expect(harness.replyProvider.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        safeInput: 'Please check visa number [REDACTED].',
        history: [{ role: 'user', parts: [{ text: 'My Aadhaar is [REDACTED ID].' }] }],
      }),
    );
    expect(JSON.stringify(vi.mocked(harness.replyProvider.respond).mock.calls)).not.toContain(
      'B7654321',
    );
    expect(JSON.stringify(vi.mocked(harness.replyProvider.respond).mock.calls)).not.toContain(
      '1234 5678 9012',
    );
  });

  it('acknowledges an urgent traveller and creates a staff-visible escalation', async () => {
    const harness = createGlobalHarness('I am stranded after losing my passport.');

    await expect(harness.process(9, 'sample-lead')).resolves.toEqual({
      processed: true,
      disabled: false,
    });

    expect(harness.replyProvider.respond).not.toHaveBeenCalled();
    expect(harness.replies[0]).toContain('alerted our on-trip team');
    expect(harness.context.conversation.mayaMode).toBe('human_only');
    expect(harness.staffEvents).toEqual([
      { action: 'urgent_global_chat_escalation', category: 'emergency' },
    ]);
  });

  it('leaves a human-owned conversation untouched', async () => {
    const harness = createGlobalHarness('Can someone help?', 'human_only');

    await expect(harness.process(9, 'sample-lead')).resolves.toEqual({
      processed: false,
      disabled: false,
    });

    expect(harness.repository.reserveInbound).not.toHaveBeenCalled();
    expect(harness.replyProvider.respond).not.toHaveBeenCalled();
    expect(harness.replies).toEqual([]);
  });

  it('records a provider failure for staff without sending a reply', async () => {
    const harness = createGlobalHarness();
    vi.mocked(harness.replyProvider.respond).mockRejectedValueOnce(
      new Error('provider unavailable'),
    );

    await expect(harness.process(9, 'sample-lead')).resolves.toEqual({
      processed: false,
      disabled: false,
    });

    expect(harness.replies).toEqual([]);
    expect(harness.staffEvents).toEqual([{ action: 'global_chat_reply_provider_failure' }]);
    expect(harness.repository.release).toHaveBeenCalledWith(9);
  });

  it('does not send a duplicate reply when the latest message is reprocessed', async () => {
    const harness = createGlobalHarness();

    await expect(harness.process(9, 'sample-lead')).resolves.toMatchObject({ processed: true });
    await expect(harness.process(9, 'sample-lead')).resolves.toMatchObject({ processed: false });

    expect(harness.replyProvider.respond).toHaveBeenCalledOnce();
    expect(harness.repository.saveReply).toHaveBeenCalledOnce();
  });
});
