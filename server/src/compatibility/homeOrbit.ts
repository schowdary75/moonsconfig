export interface HomeFeaturedDestination {
  name: string;
  country: string;
  slug: string;
  imageUrl: string;
  trendReason: string;
  season: string;
  startingPrice: number;
  packageCount: number;
  availablePrices: number[];
  packageUrl: string;
  latitude: number | null;
  longitude: number | null;
}

export interface HomeFeaturedDestinationResponse {
  month: string;
  monthKey: string;
  generatedAt: string;
  destinations: HomeFeaturedDestination[];
}

/** @deprecated Use HomeFeaturedDestination. */
export type HomeOrbitDestination = HomeFeaturedDestination;
/** @deprecated Use HomeFeaturedDestinationResponse. */
export type HomeOrbitResponse = HomeFeaturedDestinationResponse;

export interface OrbitPackageRow {
  destination: string;
  country: string;
  slug: string;
  image_url: string;
  price: number;
}

export interface OrbitTrendRow {
  name: string;
  growth_signal?: string | null;
  best_months?: string | null;
  sort_order?: number | null;
}

export interface OrbitSeasonRow {
  slug: string;
  label: string;
  sell_now: unknown;
}

export interface OrbitEditorialRow {
  name: string;
  season?: string | null;
  description?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
}

export interface OrbitCoordinateRow {
  destination: string;
  latitude: number | string | { toString(): string };
  longitude: number | string | { toString(): string };
}

const DESTINATION_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  dubai: { latitude: 25.2048, longitude: 55.2708 },
  bali: { latitude: -8.4095, longitude: 115.1889 },
  thailand: { latitude: 13.7563, longitude: 100.5018 },
  kazakhstan: { latitude: 43.222, longitude: 76.8512 },
  azerbaijan: { latitude: 40.4093, longitude: 49.8671 },
  georgia: { latitude: 41.7151, longitude: 44.8271 },
  turkey: { latitude: 41.0082, longitude: 28.9784 },
  japan: { latitude: 35.6762, longitude: 139.6503 },
  vietnam: { latitude: 21.0285, longitude: 105.8542 },
  sri_lanka: { latitude: 6.9271, longitude: 79.8612 },
  oman: { latitude: 23.588, longitude: 58.3829 },
  albania: { latitude: 41.3275, longitude: 19.8187 },
  goa: { latitude: 15.2993, longitude: 74.124 },
  kerala: { latitude: 9.9312, longitude: 76.2673 },
  rajasthan: { latitude: 26.9124, longitude: 75.7873 },
  himachal_pradesh: { latitude: 31.1048, longitude: 77.1734 },
  kashmir: { latitude: 34.0837, longitude: 74.7973 },
  andamans: { latitude: 11.7401, longitude: 92.6586 },
  ladakh: { latitude: 34.1526, longitude: 77.5771 },
  sikkim: { latitude: 27.3389, longitude: 88.6065 },
  meghalaya: { latitude: 25.5788, longitude: 91.8933 },
  uttarakhand: { latitude: 30.3165, longitude: 78.0322 },
  maldives: { latitude: 4.1755, longitude: 73.5093 },
  mauritius: { latitude: -20.1609, longitude: 57.5012 },
  malaysia: { latitude: 3.139, longitude: 101.6869 },
  singapore: { latitude: 1.3521, longitude: 103.8198 },
};

const ALIASES: Record<string, string> = {
  abu_dhabi: 'dubai',
  almaty: 'kazakhstan',
  andaman: 'andamans',
  andaman_islands: 'andamans',
  azerbaijan: 'azerbaijan',
  baku: 'azerbaijan',
  bali: 'bali',
  bangkok: 'thailand',
  da_nang: 'vietnam',
  dubai: 'dubai',
  goa: 'goa',
  hanoi: 'vietnam',
  himachal: 'himachal_pradesh',
  himachal_pradesh: 'himachal_pradesh',
  japan: 'japan',
  kashmir: 'kashmir',
  kazakhstan: 'kazakhstan',
  kerala: 'kerala',
  krabi: 'thailand',
  kuala_lumpur: 'malaysia',
  malaysia: 'malaysia',
  maldives: 'maldives',
  mauritius: 'mauritius',
  phuket: 'thailand',
  phu_quoc: 'vietnam',
  singapore: 'singapore',
  sri_lanka: 'sri_lanka',
  thailand: 'thailand',
  tokyo: 'japan',
  uae: 'dubai',
  uttarakhand: 'uttarakhand',
  vietnam: 'vietnam',
  wayanad: 'kerala',
};

function words(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function canonicalDestination(value: string) {
  const normalized = words(value);
  const alias = Object.entries(ALIASES).find(([key]) =>
    new RegExp(`(^|_)${key}(_|$)`).test(normalized),
  );
  return alias?.[1] ?? normalized;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function monthContext(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return {
    month,
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    label: new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'long',
      year: 'numeric',
    }).format(now),
    quarter: `q${Math.ceil(month / 3)}`,
  };
}

function destinationHints(value: string, packageKeys: Set<string>) {
  const normalized = words(value);
  return [...packageKeys].filter((key) => {
    if (normalized.includes(key)) return true;
    return Object.entries(ALIASES).some(
      ([alias, canonical]) => canonical === key && normalized.includes(alias),
    );
  });
}

export function buildHomeFeaturedDestinationsResponse(input: {
  packages: OrbitPackageRow[];
  trends: OrbitTrendRow[];
  season: OrbitSeasonRow | null;
  editorial: OrbitEditorialRow[];
  coordinates?: OrbitCoordinateRow[];
  now?: Date;
}): HomeFeaturedDestinationResponse {
  const now = input.now ?? new Date();
  const context = monthContext(now);
  const grouped = new Map<string, OrbitPackageRow[]>();
  const coordinatesByKey = new Map<string, { latitude: number; longitude: number }>();

  for (const row of input.coordinates ?? []) {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const key = canonicalDestination(row.destination);
    if (
      !coordinatesByKey.has(key) &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      coordinatesByKey.set(key, { latitude, longitude });
    }
  }

  for (const pkg of input.packages) {
    if (!pkg.image_url || !pkg.slug || !Number.isFinite(pkg.price) || pkg.price <= 0) continue;
    const key = canonicalDestination(pkg.destination);
    const rows = grouped.get(key) ?? [];
    rows.push(pkg);
    grouped.set(key, rows);
  }

  const packageKeys = new Set(grouped.keys());
  const priority: string[] = [];
  const add = (key: string) => {
    if (packageKeys.has(key) && !priority.includes(key)) priority.push(key);
  };

  for (const item of parseStringArray(input.season?.sell_now)) {
    for (const key of destinationHints(item, packageKeys)) add(key);
  }
  for (const trend of [...input.trends].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    add(canonicalDestination(trend.name));
  }
  for (const item of [...input.editorial].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  )) {
    if (item.is_active !== false) add(canonicalDestination(item.name));
  }
  for (const key of packageKeys) add(key);

  const trendByKey = new Map(input.trends.map((row) => [canonicalDestination(row.name), row]));
  const editorialByKey = new Map(
    input.editorial.map((row) => [canonicalDestination(row.name), row]),
  );
  const enriched = priority.map((key) => {
    const packages = [...(grouped.get(key) ?? [])].sort((a, b) => a.price - b.price);
    const first = packages[0]!;
    const trend = trendByKey.get(key);
    const editorial = editorialByKey.get(key);
    const coordinates = coordinatesByKey.get(key) ?? DESTINATION_COORDINATES[key] ?? null;
    return {
      key,
      domestic: first.country.trim().toLowerCase() === 'india',
      destination: {
        name: first.destination,
        country: first.country,
        slug: first.slug,
        imageUrl: first.image_url,
        trendReason:
          trend?.growth_signal ||
          editorial?.description ||
          `A strong ${context.label} match from the MooNs travel desk.`,
        season: trend?.best_months || editorial?.season || input.season?.label || context.label,
        startingPrice: first.price,
        packageCount: packages.length,
        availablePrices: [...new Set(packages.map((pkg) => pkg.price))].sort((a, b) => a - b),
        packageUrl: `/packages?destination=${encodeURIComponent(first.destination)}&themes=All`,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
      } satisfies HomeFeaturedDestination,
    };
  });

  const international = enriched.filter((item) => !item.domestic);
  const domestic = enriched.filter((item) => item.domestic);
  const selected = [...international.slice(0, 4), ...domestic.slice(0, 2)];
  for (const item of enriched) {
    if (selected.length >= 6) break;
    if (!selected.some((selectedItem) => selectedItem.key === item.key)) selected.push(item);
  }

  return {
    month: context.label,
    monthKey: context.monthKey,
    generatedAt: now.toISOString(),
    destinations: selected.slice(0, 6).map((item) => item.destination),
  };
}

/** @deprecated Use buildHomeFeaturedDestinationsResponse. */
export const buildHomeOrbitResponse = buildHomeFeaturedDestinationsResponse;

export function quarterForIndiaDate(now = new Date()) {
  return monthContext(now).quarter;
}
