export const RFQ_SCOPE_ORDER = ['full', 'hotels', 'transport', 'cruise'] as const;

export type RfqScope = (typeof RFQ_SCOPE_ORDER)[number];

export interface RfqTravelDateInput {
  from?: Date;
  to?: Date;
}

export interface RfqHotelRequestInput {
  name: string;
  source?: 'catalog' | 'custom';
}

export interface RfqMessageContent {
  subject: string;
  htmlBody: string;
}

export interface BuildRfqPayloadInput {
  packageId: number;
  scopes: readonly string[];
  travelDates?: RfqTravelDateInput;
  hotelRequests?: readonly RfqHotelRequestInput[];
  vendorIds: readonly number[];
  message?: RfqMessageContent;
}

export interface RfqTravelDates {
  from: string;
  to: string;
  label: string;
}

export interface RfqHotelRequest {
  name: string;
  source: 'catalog' | 'custom';
}

export interface RfqPayload {
  packageId: number;
  scope: RfqScope[];
  travelDates: RfqTravelDates;
  hotelRequests: RfqHotelRequest[];
  vendorIds: number[];
  message: RfqMessageContent;
}

export interface RfqComposeRequest {
  packageId: number;
  scope: RfqScope[];
  travelDates: string;
  customHotels: string[];
}

export interface RfqTemplateRequest {
  packageId: number;
  templateId: number;
  travelDates: string;
  customHotels: string[];
}

export interface RfqSendRequest {
  packageId: number;
  vendorIds: number[];
  subject: string;
  htmlBody: string;
}

export class RfqPayloadValidationError extends Error {
  constructor(
    public readonly field: 'packageId' | 'scope' | 'travelDates' | 'hotels' | 'vendors' | 'message',
    message: string,
  ) {
    super(message);
    this.name = 'RfqPayloadValidationError';
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function dateParts(value: Date) {
  const year = value.getFullYear();
  const month = value.getMonth();
  const day = value.getDate();
  return {
    canonical: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    display: `${MONTHS[month]} ${String(day).padStart(2, '0')}, ${year}`,
  };
}

export function normalizeRfqScopes(scopes: readonly string[]): RfqScope[] {
  const requested = new Set<RfqScope>();
  for (const scope of scopes) {
    if (!RFQ_SCOPE_ORDER.includes(scope as RfqScope)) {
      throw new RfqPayloadValidationError('scope', `Unsupported RFQ scope: ${scope}.`);
    }
    requested.add(scope as RfqScope);
  }
  const normalized = RFQ_SCOPE_ORDER.filter((scope) => requested.has(scope));
  if (normalized.length === 0) {
    throw new RfqPayloadValidationError('scope', 'Select at least one quote scope.');
  }
  return normalized;
}

function normalizeTravelDates(input: RfqTravelDateInput | undefined): RfqTravelDates {
  if (!isValidDate(input?.from) || !isValidDate(input?.to)) {
    throw new RfqPayloadValidationError('travelDates', 'Select both travel dates.');
  }
  if (input.to.getTime() < input.from.getTime()) {
    throw new RfqPayloadValidationError(
      'travelDates',
      'The travel end date cannot be before the start date.',
    );
  }
  const from = dateParts(input.from);
  const to = dateParts(input.to);
  return {
    from: from.canonical,
    to: to.canonical,
    label: `${from.display} - ${to.display}`,
  };
}

function normalizeHotelRequests(requests: readonly RfqHotelRequestInput[] = []): RfqHotelRequest[] {
  const seen = new Set<string>();
  return requests.flatMap((request, index) => {
    if (!request || typeof request.name !== 'string') {
      throw new RfqPayloadValidationError(
        'hotels',
        `Hotel request ${index + 1} must include a name.`,
      );
    }
    const name = request.name.trim();
    const hasControlCharacter = [...name].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
    if (!name || name.length > 160 || hasControlCharacter) {
      throw new RfqPayloadValidationError(
        'hotels',
        `Hotel request ${index + 1} has an invalid name.`,
      );
    }
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name, source: request.source === 'catalog' ? 'catalog' : 'custom' }];
  });
}

function normalizeVendorIds(vendorIds: readonly number[]): number[] {
  const normalized = new Set<number>();
  for (const vendorId of vendorIds) {
    if (!Number.isSafeInteger(vendorId) || vendorId <= 0) {
      throw new RfqPayloadValidationError('vendors', 'Vendor IDs must be positive integers.');
    }
    normalized.add(vendorId);
  }
  if (normalized.size === 0) {
    throw new RfqPayloadValidationError('vendors', 'Select at least one vendor.');
  }
  return [...normalized];
}

function normalizeMessage(message: RfqMessageContent | undefined): RfqMessageContent {
  return {
    subject: message?.subject.trim() ?? '',
    htmlBody: message?.htmlBody.trim() ?? '',
  };
}

export function buildRfqPayload(input: BuildRfqPayloadInput): RfqPayload {
  if (!Number.isSafeInteger(input.packageId) || input.packageId <= 0) {
    throw new RfqPayloadValidationError('packageId', 'A valid package is required.');
  }
  return {
    packageId: input.packageId,
    scope: normalizeRfqScopes(input.scopes),
    travelDates: normalizeTravelDates(input.travelDates),
    hotelRequests: normalizeHotelRequests(input.hotelRequests),
    vendorIds: normalizeVendorIds(input.vendorIds),
    message: normalizeMessage(input.message),
  };
}

export function toRfqComposeRequest(payload: RfqPayload): RfqComposeRequest {
  return {
    packageId: payload.packageId,
    scope: payload.scope,
    travelDates: payload.travelDates.label,
    customHotels: payload.hotelRequests.map((hotel) => hotel.name),
  };
}

export function toRfqTemplateRequest(payload: RfqPayload, templateId: number): RfqTemplateRequest {
  if (!Number.isSafeInteger(templateId) || templateId <= 0) {
    throw new RfqPayloadValidationError('message', 'Select a valid RFQ template.');
  }
  return {
    packageId: payload.packageId,
    templateId,
    travelDates: payload.travelDates.label,
    customHotels: payload.hotelRequests.map((hotel) => hotel.name),
  };
}

export function toRfqSendRequest(payload: RfqPayload): RfqSendRequest {
  if (!payload.message.subject || !payload.message.htmlBody) {
    throw new RfqPayloadValidationError('message', 'Subject and message body are required.');
  }
  return {
    packageId: payload.packageId,
    vendorIds: payload.vendorIds,
    subject: payload.message.subject,
    htmlBody: payload.message.htmlBody,
  };
}
