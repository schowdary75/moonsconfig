import { withMayaGeminiRotation } from '../../legacy/api/db.functions.server.js';
import { logger } from '../../logger/index.js';

/**
 * Written multi-language comms — extends Maya's spoken multilingual ability to
 * written channels (WhatsApp/email/quotes). Best-effort: if translation is
 * unavailable it returns the original text rather than blocking the message.
 */

const MODEL = (process.env.MAYA_TRANSLATE_MODEL ?? 'gemini-2.5-flash').trim();

/** True only when the target differs from the source and is a real code. */
export function needsTranslation(sourceLang: string, targetLang: string): boolean {
  const s = sourceLang.trim().toLowerCase();
  const t = targetLang.trim().toLowerCase();
  return Boolean(t) && Boolean(s) && s !== t;
}

/**
 * Translate `text` into `targetLang` (ISO 639-1). Returns the original text on
 * any failure so a customer message is never dropped or left blank.
 */
export async function localize(
  text: string,
  targetLang: string,
  sourceLang = 'en',
): Promise<string> {
  if (!text.trim() || !needsTranslation(sourceLang, targetLang)) return text;
  try {
    return await withMayaGeminiRotation<string>(MODEL, async (model) => {
      const prompt =
        `Translate the following travel-company message into the language with ISO 639-1 code "${targetLang}". ` +
        `Keep it natural, warm and professional. Preserve prices, dates and names exactly. ` +
        `Return ONLY the translated text, nothing else.\n\n${text}`;
      const result = await model.generateContent(prompt);
      const out = result.response.text().trim();
      return out || text;
    });
  } catch (error) {
    logger.warn('Maya translation failed; sending original text', { targetLang, error });
    return text;
  }
}
