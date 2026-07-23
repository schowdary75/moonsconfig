import { withMayaGeminiRotation } from '../legacy/api/db.functions.server.js';
import { logger } from '../logger/index.js';
import { dispatchTool, toGeminiTools } from './tools.js';
import type {
  ExecutedToolCall,
  MayaChannelContext,
  MayaDeps,
  MayaInput,
  MayaResponse,
  MayaTurn,
} from './types.js';

const DEFAULT_MODEL = (process.env.MAYA_BRAIN_MODEL ?? 'gemini-2.5-flash').trim();
const MAX_TOOL_ROUNDS = 6;

const SYSTEM_INSTRUCTION = `You are Maya, the phone and chat agent for MooNs Travel, an Indian travel company.
Speak like a warm, natural human on a call: contractions, short sentences, one thought at a time.
Your replies may be read aloud, so never use lists, markdown, emojis or headings in your final reply.

You can take real actions with tools. Use them proactively instead of only talking:
- Call recognize_caller at the start when a phone number is known.
- Call find_packages before mentioning any package or price — NEVER invent a package, price or availability. If nothing matches, say so and offer a custom itinerary.
- Use get_package_quote for indicative pricing.
- Call capture_lead once you know the traveller's name and destination, so nothing is lost.
- When you promise to "send details on WhatsApp", you MUST actually call send_whatsapp_summary — do not claim you sent something you did not.
- Use schedule_callback when they want a human to call back, and escalate_to_human for complaints or anything beyond you.

If the caller asks whether you are a human or a bot, be honest: you're Maya, MooNs Travel's virtual assistant.
Always reply in the SAME language and script style the traveller used. If they write Telugu or Hindi in Latin letters, reply in Latin letters too; do not unexpectedly switch to Telugu or Devanagari script. For mixed-language text, use simple English with the same familiar words they used.
Understand obvious spelling mistakes and destination abbreviations (for example, UEA means UAE). Never ask the traveller to repeat a clear text request just because its grammar or spelling is imperfect.
When the traveller asks you to suggest places or packages and gives a country or city, call find_packages immediately. If they mention family, honeymoon, couple, friends, solo or adventure, pass that as the keyword. Recommend only the real inventory returned by the tool.

When you are NOT calling a tool, output ONLY a JSON object on a single line with exactly two fields:
{"language":"<ISO 639-1 code>","text":"<your spoken reply in that language>"}
Output nothing else around the JSON.`;

const TURN_HINT =
  'The traveller just spoke (audio attached). Respond per your instructions — call tools as needed, then give your JSON reply.';

interface ParsedReply {
  language: string;
  text: string;
}

/** Lenient parse of the model's final reply; tolerates non-JSON output. */
export function parseReply(raw: string, fallbackText?: string): ParsedReply {
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj.text === 'string') {
      return {
        language: typeof obj.language === 'string' && obj.language ? obj.language : 'en',
        text: obj.text,
      };
    }
  } catch {
    // Gemini occasionally puts literal newlines inside its JSON string. Recover
    // the fields without ever exposing the JSON wrapper in customer chat.
    const language = cleaned.match(/"language"\s*:\s*"([^"]+)"/i)?.[1] || 'en';
    const malformedText = cleaned.match(/"text"\s*:\s*"([\s\S]*)"\s*}\s*$/i)?.[1];
    if (malformedText !== undefined) {
      try {
        return {
          language,
          text: JSON.parse(`"${malformedText.replace(/\r?\n/g, '\\n')}"`),
        };
      } catch {
        return {
          language,
          text: malformedText.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim(),
        };
      }
    }
  }
  return {
    language: 'en',
    text:
      cleaned ||
      fallbackText ||
      "I understood your request, but I couldn't complete it just now. Let me try that again.",
  };
}

function toolFallback(executed: ExecutedToolCall[]): string | undefined {
  const last =
    [...executed].reverse().find((call) => call.name === 'find_packages') ?? executed.at(-1);
  if (!last) return undefined;
  if (last.name === 'find_packages') {
    const packages = last.result.data?.packages;
    if (Array.isArray(packages) && packages.length > 0) {
      const options = packages.slice(0, 3).map((item) => {
        const pkg = item as Record<string, unknown>;
        const duration =
          typeof pkg.days === 'number' && typeof pkg.nights === 'number'
            ? ` (${pkg.days}D/${pkg.nights}N)`
            : '';
        const price =
          typeof pkg.price === 'number'
            ? ` from ₹${Math.round(pkg.price).toLocaleString('en-IN')} per person`
            : '';
        return `${String(pkg.name ?? 'Package')}${duration}${price}`;
      });
      return `I found these matching options: ${options.join('; ')}. Which one would you like to explore?`;
    }
    return "I couldn't find a matching ready-made package, but I can have our team build a custom itinerary for you.";
  }
  if (last.name === 'get_package_quote' && last.result.message) return last.result.message;
  return undefined;
}

function containsIndicScript(text: string) {
  return /[\u0900-\u0d7f]/u.test(text);
}

function isLatinScriptMessage(text: string) {
  return /[a-z]/iu.test(text) && !containsIndicScript(text);
}

function safeResponseText(result: { response: { text: () => string } }) {
  try {
    return result.response.text().trim();
  } catch {
    return '';
  }
}

function instructionForChannel(ctx: MayaChannelContext, input: MayaInput) {
  const scriptInstruction =
    'text' in input && isLatinScriptMessage(input.text)
      ? '\nThe latest traveller message uses Latin letters. The text field in your final JSON MUST also use Latin letters only, even when the language is Telugu or Hindi.'
      : '';
  if (ctx.channel !== 'chat') return `${SYSTEM_INSTRUCTION}${scriptInstruction}`;
  return `${SYSTEM_INSTRUCTION}${scriptInstruction}

This conversation is a live TEXT CHAT, not a phone call. Say "message" or "type", never "calling", "heard", or "say that again". Give a useful answer in one or two short paragraphs, and ask at most one necessary follow-up question.`;
}

function inferPackageLookup(input: MayaInput, history: MayaTurn[]) {
  if (!('text' in input)) return null;
  const text = input.text.trim();
  if (!/\b(package|packages|place|places|suggest|trip|travel)\b/i.test(text)) return null;

  const knownDestination = text.match(/\b(uae|uea|united arab emirates|dubai|abu dhabi)\b/i)?.[1];
  const trailingDestination = text.match(/\b(?:in|to|for)\s+([a-z][a-z ]{1,35})[?.!]*$/i)?.[1];
  const destination = (knownDestination ?? trailingDestination)?.trim();
  if (!destination) return null;

  const context = [
    ...history
      .filter((turn) => turn.role === 'user')
      .slice(-3)
      .map((turn) => turn.parts[0]?.text),
    text,
  ]
    .filter(Boolean)
    .join(' ');
  const keyword = context.match(/\b(family|honeymoon|couple|friends|solo|adventure)\b/i)?.[1];
  return {
    destination: /^(?:uea|uae)$/i.test(destination) ? 'UAE' : destination,
    ...(keyword ? { keyword: keyword.toLowerCase() } : {}),
  };
}

/**
 * Maya's brain: one turn of conversation, running a full tool-calling loop over
 * the registry. Channel-agnostic — voice, WhatsApp and chat all call this the
 * same way, differing only in whether the input is audio or text.
 */
export class MayaBrain {
  constructor(
    private readonly deps: MayaDeps,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async respond(params: {
    input: MayaInput;
    history: MayaTurn[];
    ctx: MayaChannelContext;
  }): Promise<MayaResponse> {
    const { input, history, ctx } = params;
    const toolCtx = { ...ctx, deps: this.deps };
    const executed: ExecutedToolCall[] = [];
    const inferredPackageArgs = inferPackageLookup(input, history);
    if (inferredPackageArgs) {
      const result = await dispatchTool('find_packages', inferredPackageArgs, toolCtx);
      executed.push({ name: 'find_packages', args: inferredPackageArgs, result });
    }

    const userParts =
      'audioBase64' in input
        ? [
            { inlineData: { mimeType: input.mimeType, data: input.audioBase64 } },
            { text: TURN_HINT },
          ]
        : [
            { text: input.text },
            ...(inferredPackageArgs
              ? [
                  {
                    text: `Application-provided VERIFIED inventory result: ${executed.at(-1)?.result.message}\nAnswer the traveller directly from this result. Do not ask for the destination again and do not invent alternatives.`,
                  },
                ]
              : []),
          ];

    const reply = await withMayaGeminiRotation<ParsedReply>(this.model, async (model) => {
      const chat = model.startChat({
        history,
        tools: toGeminiTools(),
        systemInstruction: { role: 'system', parts: [{ text: instructionForChannel(ctx, input) }] },
      });

      let result = await chat.sendMessage(userParts);
      const completedCalls = new Map<string, ExecutedToolCall['result']>();
      for (const call of executed)
        completedCalls.set(`${call.name}:${JSON.stringify(call.args)}`, call.result);
      let emptyRetries = 0;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const calls = safeFunctionCalls(result);
        if (calls.length === 0) {
          if (!safeResponseText(result) && emptyRetries < 1) {
            emptyRetries += 1;
            result = await chat.sendMessage([
              {
                text: 'Your previous response was empty. Complete the traveller request now: call the appropriate tool if needed, then return the required JSON reply.',
              },
            ]);
            continue;
          }
          break;
        }

        const responses = [];
        for (const call of calls) {
          const args = (call.args ?? {}) as Record<string, unknown>;
          const callKey = `${call.name}:${JSON.stringify(args)}`;
          const previous = completedCalls.get(callKey);
          const toolResult = previous
            ? {
                ...previous,
                message: `${previous.message} This exact lookup already ran; use its result and answer the traveller now.`,
              }
            : await dispatchTool(call.name, args, toolCtx);
          if (!previous) {
            completedCalls.set(callKey, toolResult);
            executed.push({ name: call.name, args, result: toolResult });
          }
          responses.push({
            functionResponse: { name: call.name, response: toolResult },
          });
        }
        result = await chat.sendMessage(responses);
      }

      let parsed = parseReply(safeResponseText(result), toolFallback(executed));
      if ('text' in input && isLatinScriptMessage(input.text) && containsIndicScript(parsed.text)) {
        const rewrite = model.startChat({
          systemInstruction: {
            role: 'system',
            parts: [
              {
                text: 'Rewrite the supplied reply in natural Latin-script wording. If it is Telugu, use Roman Telugu; if it is Hindi, use Roman Hindi. Preserve meaning and facts. Output only JSON with language and text fields, and do not use any Indic-script characters.',
              },
            ],
          },
        });
        const rewritten = await rewrite.sendMessage([{ text: parsed.text }]);
        parsed = parseReply(safeResponseText(rewritten), parsed.text);
      }
      if (inferredPackageArgs) {
        const packages = executed[0]?.result.data?.packages;
        const mentionsRealPackage =
          Array.isArray(packages) &&
          packages.some((item) => {
            const name = (item as { name?: unknown }).name;
            return (
              typeof name === 'string' && parsed.text.toLowerCase().includes(name.toLowerCase())
            );
          });
        if (Array.isArray(packages) && packages.length > 0 && !mentionsRealPackage) {
          parsed = { language: 'en', text: toolFallback(executed) ?? parsed.text };
        }
      }
      return parsed;
    });

    const nextHistory: MayaTurn[] = [
      ...history,
      {
        role: 'user',
        parts: [{ text: 'audioBase64' in input ? `[spoke in ${reply.language}]` : input.text }],
      },
      { role: 'model', parts: [{ text: reply.text }] },
    ];

    if (executed.length) {
      logger.info('Maya executed tools this turn', {
        channel: ctx.channel,
        session: ctx.sessionId,
        tools: executed.map((e) => e.name),
      });
    }

    return {
      language: reply.language,
      text: reply.text,
      history: nextHistory,
      toolCalls: executed,
    };
  }
}

/** SDK `functionCalls()` can be absent or throw when there are no calls. */
function safeFunctionCalls(result: {
  response: { functionCalls?: () => Array<{ name: string; args?: unknown }> | undefined };
}): Array<{ name: string; args?: unknown }> {
  try {
    return result.response.functionCalls?.() ?? [];
  } catch {
    return [];
  }
}
