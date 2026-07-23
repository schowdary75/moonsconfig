export function jsonReplacer(_key: string, value: unknown) {
  if (typeof value !== 'bigint') {
    return value;
  }

  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) ? numericValue : value.toString();
}
