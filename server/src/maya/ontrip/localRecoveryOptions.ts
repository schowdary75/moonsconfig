export interface LocalRecoveryOption {
  name: string;
  kind: 'transport' | 'hotel';
  bookingUrl: string;
  note: string;
}

const HOTEL_OPTIONS: LocalRecoveryOption[] = [
  {
    name: 'Booking.com',
    kind: 'hotel',
    bookingUrl: 'https://www.booking.com/',
    note: 'Search nearby properties and confirm the final price before booking.',
  },
  {
    name: 'Agoda',
    kind: 'hotel',
    bookingUrl: 'https://www.agoda.com/',
    note: 'Search nearby properties and confirm the cancellation terms before booking.',
  },
];

const UBER: LocalRecoveryOption = {
  name: 'Uber',
  kind: 'transport',
  bookingUrl: 'https://www.uber.com/global/en/cities/',
  note: 'Check service availability in your current city before requesting a ride.',
};

const DESTINATION_TRANSPORT: Array<{ match: RegExp; options: LocalRecoveryOption[] }> = [
  {
    match: /\b(uae|united arab emirates|dubai|abu dhabi|sharjah|ajman)\b/i,
    options: [
      {
        name: 'Careem',
        kind: 'transport',
        bookingUrl: 'https://www.careem.com/en-AE/ride/',
        note: 'Book a local ride and retain the itemized receipt.',
      },
      {
        name: 'Dubai Taxi Company',
        kind: 'transport',
        bookingUrl: 'https://www.dubaitaxi.ae/en/our-services/taxi',
        note: 'Official taxi option for Dubai; confirm service coverage for your pickup.',
      },
    ],
  },
  {
    match: /\b(india|delhi|mumbai|hyderabad|bengaluru|bangalore|chennai|kolkata|pune|goa)\b/i,
    options: [
      {
        ...UBER,
        bookingUrl: 'https://www.uber.com/global/en/r/india/cities/',
      },
    ],
  },
  {
    match: /\b(singapore|malaysia|thailand|vietnam|philippines|cambodia|myanmar)\b/i,
    options: [
      {
        name: 'Grab',
        kind: 'transport',
        bookingUrl: 'https://www.grab.com/sg/locations/',
        note: 'Check that Grab operates in your current city before booking.',
      },
    ],
  },
  {
    match: /\b(indonesia|bali|jakarta|singapore)\b/i,
    options: [
      {
        name: 'Gojek',
        kind: 'transport',
        bookingUrl: 'https://www.gojek.com/',
        note: 'Check service availability at your pickup location before booking.',
      },
    ],
  },
];

export function localRecoveryOptions(
  issueType: string,
  destination?: string | null,
): LocalRecoveryOption[] {
  if (/hotel/i.test(issueType)) return HOTEL_OPTIONS.map((option) => ({ ...option }));

  const matches = DESTINATION_TRANSPORT.filter((entry) => entry.match.test(destination ?? ''))
    .flatMap((entry) => entry.options)
    .concat(UBER);
  return Array.from(new Map(matches.map((option) => [option.name, option])).values()).map(
    (option) => ({ ...option }),
  );
}
