import type { PrismaClient } from '@prisma/client';
import type { ZodTypeAny } from 'zod';

/**
 * Shared types for Maya's transport-agnostic action layer.
 *
 * The same tool registry and "brain" (tool-calling loop) back every Maya
 * surface — the inbound voice agent, WhatsApp, live chat and SMS. Nothing here
 * knows about Asterisk or any specific channel; callers pass a
 * {@link MayaChannelContext} describing where the conversation is happening.
 */

export type MayaChannel = 'voice' | 'whatsapp' | 'chat' | 'sms';

/** Where a conversation is happening and who (if known) is on the other end. */
export interface MayaChannelContext {
  channel: MayaChannel;
  /** E.164 phone of the person Maya is talking to, when the channel exposes it. */
  callerPhone?: string | null;
  /** Display name, if already known (e.g. a recognised returning caller). */
  callerName?: string | null;
  /** Stable per-conversation id (e.g. the Asterisk channel id). */
  sessionId: string;
  /** Preferred locale/language code, when known up front. */
  locale?: string | null;
}

/** Outbound message delivery result from a channel adapter. */
export interface MessageDelivery {
  ok: boolean;
  /** Channel the message actually went out on (may differ after fallback). */
  channel: MayaChannel;
  provider: string;
  error?: string;
}

/**
 * Effectful dependencies Maya's tools need, injected so the tools stay pure and
 * unit-testable. Production wires real Prisma + channel adapters; tests pass
 * fakes.
 */
export interface MayaDeps {
  prisma: PrismaClient;
  /** Send a message to a phone, preferring WhatsApp and falling back to SMS. */
  sendWhatsApp: (to: string, message: string) => Promise<MessageDelivery>;
  /** Append a row to maya_activity_log (best-effort; never throws). */
  logActivity: (
    area: string,
    action: string,
    refId: number | null,
    summary: string,
    status?: MayaActivityStatus,
  ) => Promise<void>;
  /** Injectable clock for deterministic tests. */
  now: () => Date;
}

export type MayaActivityStatus = 'done' | 'attention' | 'error';

/** Everything a tool's `execute` receives: the request context plus deps. */
export interface MayaToolContext extends MayaChannelContext {
  deps: MayaDeps;
}

/** Uniform result every tool returns; `message` is what the model reads back. */
export interface MayaToolResult {
  ok: boolean;
  /** Short natural-language summary the LLM uses to continue the conversation. */
  message: string;
  /** Structured payload (ids, matches, etc.) for callers and logging. */
  data?: Record<string, unknown>;
}

/**
 * A single Maya capability. `parameters` is a Gemini function-declaration schema
 * (OpenAPI-subset, lowercase types); `validate` is the matching Zod schema used
 * to harden the arguments the model produces before they touch the database.
 */
export interface MayaTool {
  name: string;
  description: string;
  parameters: GeminiSchema;
  validate: ZodTypeAny;
  execute: (args: unknown, ctx: MayaToolContext) => Promise<MayaToolResult>;
}

/** Minimal Gemini/OpenAPI schema shape used for function declarations. */
export interface GeminiSchema {
  type: 'object';
  properties: Record<string, GeminiProperty>;
  required?: string[];
}

export interface GeminiProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  /** Element schema for `array` types (may itself be an object schema). */
  items?: GeminiProperty;
  /** Field schemas for `object` types. */
  properties?: Record<string, GeminiProperty>;
  required?: string[];
}

/** One turn of durable conversation history (text only — audio is never stored). */
export interface MayaTurn {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

/** Audio or text the user just produced this turn. */
export type MayaInput = { text: string } | { audioBase64: string; mimeType: string };

/** A tool the brain executed while producing a reply. */
export interface ExecutedToolCall {
  name: string;
  args: Record<string, unknown>;
  result: MayaToolResult;
}

/** What the brain returns after a full turn (including any tool rounds). */
export interface MayaResponse {
  /** ISO 639-1 language code of the reply, for TTS/routing. */
  language: string;
  /** Final spoken/written reply. */
  text: string;
  /** Updated durable history to carry into the next turn. */
  history: MayaTurn[];
  /** Tools executed this turn, in order. */
  toolCalls: ExecutedToolCall[];
}
