const DAY_MS = 86_400_000;

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

export function tripDayNumber(travelDate: Date, timeZone: string, now: Date = new Date()): number {
  let today: { year: number; month: number; day: number };
  try {
    today = datePartsInTimeZone(now, timeZone);
  } catch {
    today = datePartsInTimeZone(now, 'Asia/Kolkata');
  }
  const start = Date.UTC(
    travelDate.getUTCFullYear(),
    travelDate.getUTCMonth(),
    travelDate.getUTCDate(),
  );
  const current = Date.UTC(today.year, today.month - 1, today.day);
  return Math.floor((current - start) / DAY_MS) + 1;
}

export function tripPhase(
  bookingStatus: string | null,
  dayNumber: number,
  totalDays: number | null,
): 'inactive' | 'upcoming' | 'active' | 'completed' {
  if (bookingStatus !== 'confirmed') return 'inactive';
  if (dayNumber < 1) return 'upcoming';
  if (totalDays != null && dayNumber > totalDays) return 'completed';
  return 'active';
}
