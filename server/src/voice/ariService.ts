import {
  connect,
  type AriClient,
  type ChannelInstance,
  type ConnectOptions,
  type StasisStartEvent,
} from '@per_moeller/asterisk-ari';
import { logger } from '../logger/index.js';
import { env } from '../config/env.js';
import { withMayaGeminiRotation } from '../legacy/api/db.functions.server.js';
import { MayaBrain } from '../maya/brain.js';
import { createMayaDeps } from '../maya/deps.js';
import type { ExecutedToolCall, MayaTurn } from '../maya/types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { resolveTenantRuntime, runWithTenant } from '../config/tenantContext.js';
import {
  markVendorCallStatus,
  recordVendorResponse,
  vendorCallPrompt,
} from '../services/incidentRecoveryService.js';

// Each model has its own quota; rotate to the next when one is exhausted across all keys.
const TTS_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview'];
const TTS_VOICE = 'Leda';
const GREETING_TEXT =
  'Hi, thanks for calling MooNs Travel! This is Maya. How can I help you today?';
const FILLER_TEXT = 'Mm-hmm, one moment.';

interface SynthesizedAudio {
  buffer: Buffer;
  extension: 'wav' | 'mp3';
}

/** Gemini TTS returns 24kHz mono 16-bit PCM; Asterisk .wav playback needs 8kHz. */
function pcm24kToWav8k(pcm: Buffer): Buffer {
  const inputSamples = Math.floor(pcm.length / 2);
  const outputSamples = Math.floor(inputSamples / 3);
  const data = Buffer.alloc(outputSamples * 2);
  for (let i = 0; i < outputSamples; i++) {
    // Average each group of 3 samples as a crude low-pass filter while decimating.
    const base = i * 3 * 2;
    const avg = Math.round(
      (pcm.readInt16LE(base) + pcm.readInt16LE(base + 2) + pcm.readInt16LE(base + 4)) / 3,
    );
    data.writeInt16LE(avg, i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(8000 * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function synthesizeGeminiSpeech(text: string): Promise<SynthesizedAudio> {
  let lastError: unknown;
  for (const ttsModel of TTS_MODELS) {
    try {
      const base64Audio = await withMayaGeminiRotation<string>(
        ttsModel,
        async (model) => {
          const result = await model.generateContent(
            `Say this in a warm, friendly customer-service voice: ${text}`,
          );
          const parts = result.response.candidates?.[0]?.content?.parts ?? [];
          const audioPart = parts.find((part: any) => part.inlineData?.data);
          if (!audioPart) throw new Error('Gemini TTS returned no audio data');
          return audioPart.inlineData.data as string;
        },
        {
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
          },
        },
      );
      return { buffer: pcm24kToWav8k(Buffer.from(base64Audio, 'base64')), extension: 'wav' };
    } catch (error) {
      lastError = error;
      logger.warn('Gemini TTS model failed, trying next model', { ttsModel, error });
    }
  }
  throw lastError;
}

async function synthesizeGoogleTranslateSpeech(
  text: string,
  requestedLanguage: string,
): Promise<SynthesizedAudio> {
  const language = /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(requestedLanguage) ? requestedLanguage : 'en';
  const url = new URL('https://translate.google.com/translate_tts');
  url.search = new URLSearchParams({
    ie: 'UTF-8',
    client: 'tw-ob',
    tl: language,
    q: text.slice(0, 200),
  }).toString();
  const response = await fetch(url, {
    headers: { 'user-agent': 'MooNsConfig/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Text-to-speech provider returned ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('audio/'))
    throw new Error('Text-to-speech provider returned non-audio data');
  return { buffer: Buffer.from(await response.arrayBuffer()), extension: 'mp3' };
}

async function synthesizeSpeech(text: string, language: string): Promise<SynthesizedAudio> {
  try {
    return await synthesizeGeminiSpeech(text);
  } catch (error) {
    logger.warn('Gemini TTS failed, falling back to Google Translate voice', { error });
    return synthesizeGoogleTranslateSpeech(text, language);
  }
}

export class AriService {
  private ariClient: AriClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private appName = 'moonsconfig_voice';
  private conversationHistory = new Map<string, MayaTurn[]>();
  private cachedSounds = new Map<string, Promise<string>>();
  private recoveryChannels = new Set<string>();
  /** Per-call record of who called and every action Maya took, for the CRM. */
  private callJournal = new Map<
    string,
    { phone: string | null; name: string | null; tools: ExecutedToolCall[] }
  >();
  /** Effectful deps (Prisma + channels), shared with the brain. */
  private readonly deps = createMayaDeps();
  /** Maya's action layer — same tool-calling brain used by chat/WhatsApp. */
  private readonly brain = new MayaBrain(this.deps);

  constructor(
    private readonly connector: (options: ConnectOptions) => Promise<AriClient> = connect,
    autoStart = true,
  ) {
    if (autoStart) void this.init();
  }

  async init() {
    this.stopped = false;
    if (this.ariClient) return;
    try {
      const { url, username, password } = env.asteriskAri;

      logger.info('Connecting to Asterisk ARI...', { url });

      this.ariClient = await this.connector({
        url,
        username,
        password,
        app: this.appName,
      });

      this.ariClient.on('StasisStart', (event, channel) => {
        const start = event as StasisStartEvent;
        if (start.args[0] === 'recovery_vendor') {
          this.recoveryChannels.add(channel.id);
          void this.handleRecoveryVendorCall(channel, start.args[1], start.args[2]);
          return;
        }
        logger.info('Call answered via Bluetooth/Asterisk', { channelId: channel.id });
        this.conversationHistory.set(channel.id, []);
        const caller = (channel as unknown as { caller?: { number?: string; name?: string } })
          .caller;
        this.callJournal.set(channel.id, {
          phone: caller?.number ?? null,
          name: caller?.name ?? null,
          tools: [],
        });
        void this.handleCall(channel);
      });

      this.ariClient.on('StasisEnd', (_event, channel) => {
        if (this.recoveryChannels.delete(channel.id)) return;
        logger.info('Call ended, persisting summary and cleaning up memory', {
          channelId: channel.id,
        });
        // Flush the transcript + Maya's committed actions to the CRM before the
        // in-memory state is discarded, so the human team has a full record.
        void this.persistCallSummary(channel.id).finally(() => {
          this.conversationHistory.delete(channel.id);
          this.callJournal.delete(channel.id);
        });
      });

      logger.info(`Asterisk ARI connected. Listening for Stasis app: ${this.appName}`);
    } catch (error) {
      logger.error('Failed to connect to Asterisk ARI', { error });
      if (!this.stopped && !this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          void this.init();
        }, 5_000);
        this.reconnectTimer.unref();
      }
    }
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ariClient?.stop();
    this.ariClient = null;
  }

  /** Copies synthesized audio into the Asterisk sounds dir and returns the playable sound name. */
  private pushSoundToAsterisk(audio: SynthesizedAudio, soundName: string): string {
    const tempPath = path.join(os.tmpdir(), `${soundName}.${audio.extension}`);
    fs.writeFileSync(tempPath, audio.buffer);

    const astSoundPath = `/var/lib/asterisk/sounds/en/${soundName}.${audio.extension}`;
    if (process.platform === 'win32') {
      const wslMntPath = `/mnt/c/${tempPath.replace('C:\\', '').replace(/\\/g, '/')}`;
      execSync(`wsl cp "${wslMntPath}" "${astSoundPath}"`);
    } else {
      fs.copyFileSync(tempPath, astSoundPath);
    }
    return soundName;
  }

  /** Synthesizes a fixed phrase once per process (greeting, filler) and reuses the sound file. */
  private getCachedSound(soundName: string, text: string): Promise<string> {
    let cached = this.cachedSounds.get(soundName);
    if (!cached) {
      cached = synthesizeSpeech(text, 'en').then((audio) =>
        this.pushSoundToAsterisk(audio, soundName),
      );
      cached.catch(() => this.cachedSounds.delete(soundName));
      this.cachedSounds.set(soundName, cached);
    }
    return cached;
  }

  private async playSound(channel: ChannelInstance, soundName: string): Promise<void> {
    const playback = await channel.play({ media: `sound:${soundName}` });
    await new Promise<void>((resolve) => {
      playback.once('PlaybackFinished', () => resolve());
    });
  }

  private async handleRecoveryVendorCall(
    channel: ChannelInstance,
    tenantId?: string,
    attemptId?: string,
  ) {
    if (!tenantId || !attemptId) {
      logger.error('Recovery call entered Stasis without tenant or attempt identifiers', {
        channelId: channel.id,
      });
      await channel.hangup().catch(() => undefined);
      return;
    }
    try {
      const context = await resolveTenantRuntime(tenantId);
      const { prompt } = await runWithTenant(context, async () => {
        await markVendorCallStatus(attemptId, 'connected', channel.id);
        return vendorCallPrompt(attemptId);
      });
      await channel.answer().catch(() => undefined);
      const decisionPromise = new Promise<'available' | 'unavailable' | 'human' | null>(
        (resolve) => {
          const timeout = setTimeout(() => resolve(null), 45_000);
          const finish = (decision: 'available' | 'unavailable' | 'human' | null) => {
            clearTimeout(timeout);
            resolve(decision);
          };
          channel.on('ChannelDtmfReceived', (event) => {
            if (event.digit === '1') finish('available');
            else if (event.digit === '2') finish('unavailable');
            else if (event.digit === '3') finish('human');
          });
          channel.once('StasisEnd', () => finish(null));
        },
      );
      const audio = await synthesizeSpeech(prompt, 'en');
      const soundName = this.pushSoundToAsterisk(
        audio,
        `maya_recovery_${attemptId.replace(/-/g, '')}_${Date.now()}`,
      );
      await this.playSound(channel, soundName);
      await runWithTenant(context, () => markVendorCallStatus(attemptId, 'awaiting_response'));
      const decision = await decisionPromise;
      if (decision) {
        await runWithTenant(context, () =>
          recordVendorResponse(attemptId, decision, { channel: 'voice_dtmf' }),
        );
        const acknowledgement = await this.getCachedSound(
          `maya_recovery_ack_${decision}`,
          decision === 'available'
            ? 'Thank you. Your availability has been recorded. MooNs operations will coordinate the handoff.'
            : decision === 'unavailable'
              ? 'Thank you. We have recorded that you are unavailable.'
              : 'Thank you. A human operations callback has been requested.',
        );
        await this.playSound(channel, acknowledgement).catch(() => undefined);
      }
      await channel.hangup().catch(() => undefined);
    } catch (error) {
      logger.error('Vendor recovery call handling failed', { tenantId, attemptId, error });
      const context = await resolveTenantRuntime(tenantId).catch(() => null);
      if (context) {
        await runWithTenant(context, () =>
          markVendorCallStatus(attemptId, 'awaiting_response'),
        ).catch(() => undefined);
      }
      await channel.hangup().catch(() => undefined);
    }
  }

  private async handleCall(channel: ChannelInstance) {
    try {
      await channel.answer();
      try {
        const greeting = await this.getCachedSound('maya_greeting', GREETING_TEXT);
        await this.playSound(channel, greeting);
      } catch (error) {
        logger.error('Failed to play greeting, falling back to beep', { error });
        await this.playSound(channel, 'beep');
      }
      void this.processTurn(channel);
    } catch (error) {
      logger.error('Call handling error', { error });
    }
  }

  private async processTurn(channel: ChannelInstance) {
    const recordingName = `maya_input_${channel.id}_${Date.now()}`;
    logger.info('Recording user voice...', { channelId: channel.id });
    let liveRecording;
    try {
      liveRecording = await channel.record({
        name: recordingName,
        format: 'wav',
        maxSilenceSeconds: 2,
        maxDurationSeconds: 15,
        ifExists: 'overwrite',
      });
    } catch (error) {
      logger.error('Failed to start recording (caller might have hung up)', { error });
      return;
    }

    liveRecording.once('RecordingFinished', async () => {
      logger.info('Recording finished, processing with Maya brain (tools enabled)...');
      try {
        const isHybridWsl = process.platform === 'win32';

        let wavBuffer: Buffer;
        if (isHybridWsl) {
          wavBuffer = execSync(`wsl cat /var/spool/asterisk/recording/${recordingName}.wav`);
        } else {
          wavBuffer = fs.readFileSync(`/var/spool/asterisk/recording/${recordingName}.wav`);
        }

        // Cover the model round-trip (which may now include tool calls) with a
        // short acknowledgement so the caller never sits in dead air.
        const fillerPlayed = this.getCachedSound('maya_filler', FILLER_TEXT)
          .then((sound) => this.playSound(channel, sound))
          .catch((error) => {
            logger.warn('Filler playback failed', { error });
          });

        const history = this.conversationHistory.get(channel.id) ?? [];
        const caller = (channel as unknown as { caller?: { number?: string; name?: string } })
          .caller;

        // Maya can now recognise the caller, search real inventory, capture the
        // lead, send WhatsApp and escalate — all via the shared tool registry.
        const result = await this.brain.respond({
          input: { audioBase64: wavBuffer.toString('base64'), mimeType: 'audio/wav' },
          history,
          ctx: {
            channel: 'voice',
            callerPhone: caller?.number ?? null,
            callerName: caller?.name ?? null,
            sessionId: channel.id,
          },
        });

        // Only persist if the caller is still on the line.
        if (this.conversationHistory.has(channel.id)) {
          this.conversationHistory.set(channel.id, result.history);
        }
        // Accumulate the actions Maya took for the end-of-call CRM summary.
        const journal = this.callJournal.get(channel.id);
        if (journal) journal.tools.push(...result.toolCalls);

        logger.info('Maya replied', {
          language: result.language,
          text: result.text,
          tools: result.toolCalls.map((t) => t.name),
        });

        const audio = await synthesizeSpeech(result.text, result.language);
        const astSoundName = this.pushSoundToAsterisk(
          audio,
          `maya_out_${channel.id}_${Date.now()}`,
        );

        // Don't talk over the filler if it's still playing.
        await fillerPlayed;

        const playback2 = await channel.play({ media: `sound:${astSoundName}` });

        // Loop continuously!
        playback2.once('PlaybackFinished', () => {
          if (this.conversationHistory.has(channel.id)) {
            void this.processTurn(channel);
          }
        });
      } catch (aiError) {
        logger.error('Maya brain processing failed', { aiError });
        if (this.conversationHistory.has(channel.id)) {
          void this.processTurn(channel);
        }
      }
    });
  }

  /**
   * On hang-up, write the transcript and everything Maya did during the call
   * into the matching lead's notes so a human can pick up exactly where Maya
   * left off — closing the "will anyone actually follow up?" gap.
   */
  private async persistCallSummary(channelId: string): Promise<void> {
    try {
      const journal = this.callJournal.get(channelId);
      const history = this.conversationHistory.get(channelId) ?? [];
      if (!journal?.phone || history.length === 0) return;

      const transcript = history
        .map(
          (turn) =>
            `${turn.role === 'user' ? 'Caller' : 'Maya'}: ${turn.parts
              .map((p) => p.text)
              .join(' ')}`,
        )
        .join('\n');
      const actions =
        journal.tools.length === 0
          ? '(no actions taken)'
          : journal.tools
              .map((t) => `- ${t.name}: ${t.result.ok ? 'done' : 'FAILED'} — ${t.result.message}`)
              .join('\n');

      const lead = await this.deps.prisma.lead_submissions.findFirst({
        where: { phone: journal.phone },
        orderBy: { created_at: 'desc' },
        select: { id: true, admin_notes: true },
      });

      const note = `\n\n[Maya call — ${this.deps.now().toISOString()}]\n${transcript}\nActions:\n${actions}`;
      if (lead) {
        await this.deps.prisma.lead_submissions.update({
          where: { id: lead.id },
          data: {
            admin_notes: `${lead.admin_notes ?? ''}${note}`.slice(-16000),
            last_contacted_at: this.deps.now(),
          },
        });
      }
      await this.deps.logActivity(
        'voice',
        'call_summary',
        lead?.id ?? null,
        `Maya handled a call with ${journal.phone} — ${journal.tools.length} action(s)` +
          (lead ? ` (lead #${lead.id})` : ' (no matching lead)') +
          '.',
      );
    } catch (error) {
      logger.error('Failed to persist Maya call summary', { channelId, error });
    }
  }

  /**
   * Dial an outbound number through the Bluetooth-connected phone
   */
  async dialOutbound(number: string, callerId: string = 'MooNs Travel') {
    if (!this.ariClient) {
      throw new Error('ARI Client not connected');
    }

    logger.info('Initiating outbound call via Wi-Fi SIP Gateway', { number });

    try {
      const endpoint = `PJSIP/${number}@${env.asteriskAri.outboundEndpoint}`;
      const channel = this.ariClient.Channel();
      await channel.originate({
        endpoint,
        app: this.appName,
        appArgs: 'dialed',
        callerId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to dial outbound call', { error });
      return false;
    }
  }

  async dialRecoveryVendor(input: { tenantId: string; attemptId: string; phone: string }) {
    if (!this.ariClient) return false;
    const number = input.phone.replace(/[^\d+]/g, '');
    if (!number) throw new Error('Recovery vendor phone number is invalid');
    await markVendorCallStatus(input.attemptId, 'dialing');
    const channel = this.ariClient.Channel();
    await channel.originate({
      endpoint: `PJSIP/${number}@${env.asteriskAri.outboundEndpoint}`,
      app: this.appName,
      appArgs: `recovery_vendor,${input.tenantId},${input.attemptId}`,
      callerId: 'MooNs Travel',
      timeout: 30,
    });
    return true;
  }
}

export const ariService = new AriService(connect, false);
