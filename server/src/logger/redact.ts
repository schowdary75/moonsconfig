const sensitivePattern =
  /(password|pass|secret|token|authorization|cookie|api[-_]?key|access[-_]?code|otp|pin|prompt)/i;

export function redact(value: unknown, key = ''): unknown {
  if (sensitivePattern.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redact(entryValue, entryKey),
      ]),
    );
  }
  return value;
}
