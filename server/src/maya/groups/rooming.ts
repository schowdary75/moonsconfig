/**
 * Group-booking tooling — rooming-list allocation, per-person pricing and
 * partial-payment tracking. These are the three things generic CRMs handle
 * worst, and the three things group organisers ask for constantly.
 */

export interface Room {
  index: number;
  capacity: number;
  occupants: number;
}

/**
 * Allocate `pax` travellers into rooms of `roomCapacity`, filling rooms and
 * leaving at most one partially-filled room. Returns the room plan.
 */
export function allocateRooms(pax: number, roomCapacity: number): Room[] {
  if (pax <= 0) throw new Error('Party size must be positive.');
  if (roomCapacity <= 0) throw new Error('Room capacity must be positive.');
  const rooms: Room[] = [];
  let remaining = pax;
  let index = 0;
  while (remaining > 0) {
    const occupants = Math.min(roomCapacity, remaining);
    rooms.push({ index: index++, capacity: roomCapacity, occupants });
    remaining -= occupants;
  }
  return rooms;
}

/**
 * Split a group total across travellers. The remainder (from integer rupees) is
 * spread one rupee at a time across the first travellers so the shares always
 * sum back to the exact total — nobody is over- or under-charged collectively.
 */
export function perPaxShares(totalInr: number, pax: number): number[] {
  if (pax <= 0) throw new Error('Party size must be positive.');
  if (totalInr < 0) throw new Error('Total cannot be negative.');
  const base = Math.floor(totalInr / pax);
  const remainder = totalInr - base * pax;
  return Array.from({ length: pax }, (_, i) => base + (i < remainder ? 1 : 0));
}

export interface Contribution {
  travelerRef: string;
  amountInr: number;
}

export interface GroupPaymentState {
  totalInr: number;
  paidInr: number;
  remainingInr: number;
  settled: boolean;
  byTraveler: Record<string, number>;
}

/** Fold a list of contributions into the current settlement state of a group. */
export function settlementState(
  totalInr: number,
  contributions: Contribution[],
): GroupPaymentState {
  const byTraveler: Record<string, number> = {};
  let paidInr = 0;
  for (const c of contributions) {
    if (c.amountInr < 0) throw new Error('Contribution cannot be negative.');
    byTraveler[c.travelerRef] = (byTraveler[c.travelerRef] ?? 0) + c.amountInr;
    paidInr += c.amountInr;
  }
  const remainingInr = Math.max(0, totalInr - paidInr);
  return { totalInr, paidInr, remainingInr, settled: paidInr >= totalInr, byTraveler };
}
