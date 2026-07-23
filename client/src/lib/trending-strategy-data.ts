export type TravelVertical = 'outbound' | 'inbound' | 'domestic';

export type DestinationGroup = {
  region: string;
  places: string[];
  score: number;
  momentum: 'Scale now' | 'Grow' | 'Test';
  signal: string;
  sell: string;
  season: string;
};

export type MarketRow = {
  market: string;
  destinations: string;
  audience: string;
  play: string;
};

export type AudienceRow = {
  segment: string;
  age: string;
  profile: string;
  behavior: string;
  message: string;
};

export type StrategyDemand = 'explosive' | 'very_high' | 'high' | 'rising';
export type StrategyConfidence = 'proven' | 'confirmed' | 'breakout';

export type StrategyDestination = {
  id: string;
  vertical: TravelVertical;
  name: string;
  region: string;
  cities: string[];
  score: number;
  momentum: DestinationGroup['momentum'];
  demand: StrategyDemand;
  confidence: StrategyConfidence;
  trajectory: string;
  growthSignal: string;
  sourceLabel: string;
  sourceUrl: string;
  entry?: string;
  bestMonths: string;
  adWindow: string;
  budget: string;
  targetMarkets: string[];
  languages: string[];
  audience: string;
  angle: string;
  themes: string[];
  googleKeywords: string[];
  metaInterests: string[];
};

export const verticalMeta = {
  outbound: {
    label: 'Outbound',
    eyebrow: 'Indians travelling abroad',
    summary:
      'Lead with easy-entry short haul, protect premium Europe and long-haul demand, and merchandise by origin airport.',
    budget: 45,
  },
  inbound: {
    label: 'Inbound',
    eyebrow: 'Foreign travellers visiting India',
    summary:
      'USA (1.81M) and UK (1.07M) led 2025 arrivals; ex-Bangladesh inbound grew 4.25%. Sell trusted multi-city circuits by source market, with localised proof, guides, transfers and response-time SLAs.',
    budget: 20,
  },
  domestic: {
    label: 'Domestic',
    eyebrow: 'Indians travelling within India',
    summary:
      'Own regional departure markets with weekend, family, honeymoon and pilgrimage products built around access mode.',
    budget: 35,
  },
} satisfies Record<
  TravelVertical,
  { label: string; eyebrow: string; summary: string; budget: number }
>;

export const destinations: Record<TravelVertical, DestinationGroup[]> = {
  outbound: [
    {
      region: 'Middle East',
      places: ['Dubai / UAE', 'Abu Dhabi', 'Oman', 'Qatar', 'Saudi Arabia'],
      score: 96,
      momentum: 'Scale now',
      signal:
        'Dense air access, short breaks, shopping and VFR demand keep the Gulf always-on; Muscat is a 2026 breakout with searches up 211% (Skyscanner Travel Trends 2026).',
      sell: '3–5 night city breaks, family attractions, Muscat road trips, stopovers, premium shopping and Umrah extensions.',
      season: 'Oct–Mar; pulse around school breaks and event weekends',
    },
    {
      region: 'Southeast Asia',
      places: [
        'Thailand · Bangkok / Phuket / Pattaya / Krabi',
        'Bali / Indonesia',
        'Singapore',
        'Malaysia · Kuala Lumpur / Langkawi / Penang',
        'Vietnam · Hanoi / Ho Chi Minh City / Da Nang',
        'Philippines',
        'Cambodia',
      ],
      score: 95,
      momentum: 'Scale now',
      signal:
        'Thailand’s 60-day visa-free entry and Malaysia’s visa waiver (extended to 31 Dec 2026) keep the region booming; Bangkok, Phuket, Kuala Lumpur and Ho Chi Minh City all rank in India’s top summer-2026 searches, with Chiang Rai up 133%.',
      sell: 'Visa-free first international trip, twin-city bundles, honeymoon villas and family attraction passes.',
      season: 'Year-round by coast; strongest Oct–Apr and summer holidays',
    },
    {
      region: 'South Asia & Indian Ocean',
      places: ['Sri Lanka', 'Maldives', 'Nepal', 'Bhutan', 'Mauritius', 'Seychelles'],
      score: 90,
      momentum: 'Scale now',
      signal:
        'Sri Lanka’s free ETA and the Maldives’ free visa-on-arrival keep entry frictionless; Jaffna is India’s #2 trending 2026 search (+325%) and Colombo and Kathmandu sit in the summer top 10.',
      sell: 'Drive-and-stay Sri Lanka (add Jaffna), all-inclusive islands, Nepal value breaks and Bhutan slow travel.',
      season: 'Oct–Apr; Maldives and Mauritius honeymoon bursts year-round',
    },
    {
      region: 'East Asia',
      places: ['Japan', 'South Korea', 'Hong Kong', 'Macau', 'China'],
      score: 81,
      momentum: 'Grow',
      signal:
        'Tokyo and Seoul rank in India’s top-10 summer-2026 searches on culture, food and screen-led discovery; India–China direct flights resumed in 2026 (Delhi–Beijing, Kolkata–Shanghai/Kunming), reopening a dormant circuit.',
      sell: 'Cherry blossom / autumn departures, K-culture, theme parks, guided first-timer circuits and relaunched China itineraries on the new nonstops.',
      season: 'Mar–Apr and Oct–Nov; launch 90–150 days ahead',
    },
    {
      region: 'Caucasus, Turkey & Central Asia',
      places: [
        'Turkey · Istanbul / Cappadocia',
        'Azerbaijan · Baku',
        'Georgia · Tbilisi / Batumi',
        'Kazakhstan · Almaty',
        'Uzbekistan',
        'Armenia',
      ],
      score: 91,
      momentum: 'Scale now',
      signal:
        'Kazakhstan’s 14-day visa-free entry, quick e-visas elsewhere, strong visuals and direct/one-stop access make these high-conversion alternatives to Europe.',
      sell: '5–8 day “Europe feel, closer to home” bundles, snow, nightlife and small-group departures.',
      season: 'Apr–Jun and Sep–Dec; snow creative from Oct',
    },
    {
      region: 'MENA heritage & leisure',
      places: ['Egypt', 'Jordan', 'Israel'],
      score: 64,
      momentum: 'Test',
      signal:
        'Iconic heritage supports intent, but the June-2026 MEA advisory (avoid non-essential travel to Israel; refrain from Iran) gates all spend to Egypt and Jordan.',
      sell: 'Expert-led Egypt and Jordan heritage circuits with flexible terms; keep Israel fully paused under the live MEA advisory.',
      season: 'Oct–Apr; deploy only after weekly risk review',
    },
    {
      region: 'Europe',
      places: [
        'UK',
        'France',
        'Switzerland',
        'Italy',
        'Spain',
        'Germany',
        'Netherlands',
        'Austria',
        'Czech Republic',
        'Greece',
        'Portugal',
        'Scandinavia · Norway / Sweden / Finland / Denmark',
      ],
      score: 84,
      momentum: 'Grow',
      signal:
        'High-value family, honeymoon and group demand remains durable; visas and price require earlier lead capture.',
      sell: 'Schengen-ready guided circuits, mono-country depth, rail itineraries and Northern Lights departures.',
      season: 'Apr–Jun, Sep–Oct, Dec; capture 120–180 days ahead',
    },
    {
      region: 'Americas',
      places: ['USA', 'Canada', 'Mexico'],
      score: 69,
      momentum: 'Test',
      signal:
        'VFR and long-stay demand is valuable but visa-led; Mexico works as a niche premium add-on.',
      sell: 'VFR extensions, East/West Coast modules, escorted groups and cruise add-ons.',
      season: 'May–Sep and Dec; long consideration window',
    },
    {
      region: 'Oceania',
      places: ['Australia', 'New Zealand', 'Fiji'],
      score: 71,
      momentum: 'Grow',
      signal:
        'VFR, education-linked family travel and bucket-list self-drive support high average order value; Queenstown is a 2026 breakout with searches up 151%.',
      sell: 'Australia family circuits, New Zealand self-drive (lead with Queenstown), and Fiji honeymoon extensions.',
      season: 'Nov–Mar and May–Jul; 120+ day nurture',
    },
    {
      region: 'Africa',
      places: ['South Africa', 'Kenya', 'Tanzania · safari circuits'],
      score: 76,
      momentum: 'Grow',
      signal:
        'Safari is an experience-led premium category with strong family, honeymoon and milestone appeal.',
      sell: 'Migration windows, safari + beach, private game drives and Indian-meal reassurance.',
      season: 'Jun–Oct; sell 4–6 months ahead',
    },
  ],
  inbound: [
    {
      region: 'Golden Triangle & Rajasthan',
      places: ['Delhi', 'Agra', 'Jaipur', 'Udaipur', 'Jodhpur', 'Jaisalmer', 'Pushkar', 'Bikaner'],
      score: 97,
      momentum: 'Scale now',
      signal:
        'India’s clearest first-visit proposition combines global icons, heritage hotels and easy circuit design.',
      sell: '6–12 day private tours, palace stays, expert guides and Rajasthan extensions.',
      season: 'Oct–Mar; sell 3–8 months ahead',
    },
    {
      region: 'Kerala & Goa',
      places: ['Kochi', 'Munnar', 'Alleppey / Kumarakom', 'Kovalam', 'Thekkady', 'Wayanad', 'Goa'],
      score: 94,
      momentum: 'Scale now',
      signal:
        'Wellness, winter sun, beaches and backwaters translate strongly across Europe, Russia, GCC and Anglosphere markets.',
      sell: 'Ayurveda, private houseboats, slow travel, beach extensions and responsible stays.',
      season: 'Oct–Mar; wellness shoulder season Jun–Sep',
    },
    {
      region: 'Himalayas',
      places: [
        'Srinagar / Gulmarg / Pahalgam',
        'Leh / Nubra Valley',
        'Manali / Shimla',
        'Dharamshala / McLeodganj',
        'Kasol',
        'Rishikesh / Haridwar',
        'Nainital',
        'Jim Corbett',
      ],
      score: 86,
      momentum: 'Grow',
      signal: 'Adventure, Buddhism, yoga and mountain cooling create multiple high-intent niches.',
      sell: 'Acclimatised Ladakh circuits, yoga stays, trekking, rafting and wildlife combinations.',
      season: 'Mar–Jun and Sep–Nov; Ladakh May–Sep',
    },
    {
      region: 'Spiritual & Buddhist India',
      places: [
        'Varanasi',
        'Lucknow',
        'Ayodhya',
        'Bodh Gaya',
        'Nalanda',
        'Rajgir',
        'Puri',
        'Konark',
        'Bhubaneswar',
      ],
      score: 84,
      momentum: 'Grow',
      signal:
        'Faith, living culture and Buddhist circuits support country-specific journeys and longer stays.',
      sell: 'Varanasi with sensitive guiding, Buddhist pilgrimage, temple architecture and festival departures.',
      season: 'Oct–Mar; country-language landing pages year-round',
    },
    {
      region: 'Western & Central heritage / wildlife',
      places: [
        'Mumbai',
        'Ajanta & Ellora / Aurangabad',
        'Khajuraho',
        'Bandhavgarh / Kanha / Pench',
        'Kutch',
        'Statue of Unity',
        'Gir National Park',
      ],
      score: 80,
      momentum: 'Grow',
      signal:
        'Strong add-on value for repeat visitors, architecture buyers and high-spend wildlife travellers.',
      sell: 'Tiger safaris with naturalists, UNESCO trails, Mumbai gateways and Gujarat craft/wildlife circuits.',
      season: 'Oct–Mar; tiger parks Oct–Jun',
    },
    {
      region: 'Southern culture circuit',
      places: [
        'Bengaluru / Mysore / Hampi / Coorg',
        'Chennai / Mahabalipuram / Madurai / Ooty',
        'Hyderabad · Golconda / Charminar',
        'Puducherry',
      ],
      score: 82,
      momentum: 'Grow',
      signal:
        'Temple, Deccan, culinary and living-culture itineraries reward repeat and slow travellers.',
      sell: 'Dravidian architecture, Hampi, Deccan food, French-quarter stays and private guides.',
      season: 'Oct–Mar; hill extensions Apr–Jun',
    },
    {
      region: 'East, Northeast & islands',
      places: [
        'Kolkata',
        'Darjeeling',
        'Sundarbans',
        'Sikkim',
        'Meghalaya',
        'Assam · Kaziranga',
        'Arunachal Pradesh',
        'Andaman & Nicobar Islands',
      ],
      score: 75,
      momentum: 'Test',
      signal:
        'High differentiation and nature appeal, with access, permits and weather requiring specialist positioning.',
      sell: 'Tea and culture, rhino/wildlife, community-led Northeast journeys and island diving.',
      season: 'Oct–Apr; island and permit information prominent',
    },
  ],
  domestic: [
    {
      region: 'Beaches & islands',
      places: ['Goa', 'Andaman & Nicobar Islands', 'Kerala · Alleppey / Wayanad'],
      score: 96,
      momentum: 'Scale now',
      signal:
        'Dependable couple, group and family demand; short-form content and fare-led bursts drive response.',
      sell: 'Flights + stay, private transfers, water sports, houseboats and long-weekend departures.',
      season: 'Oct–Mar; monsoon value Jun–Sep',
    },
    {
      region: 'Himalayas & North',
      places: [
        'Kashmir / Ladakh',
        'Manali / Shimla / Dharamshala / Kasol',
        'Rishikesh / Nainital / Mussoorie / Jim Corbett',
      ],
      score: 95,
      momentum: 'Scale now',
      signal:
        'Heat escape, snow, honeymoon and road-trip intent create separate summer and winter peaks.',
      sell: 'Snow certainty messaging, family vehicles, honeymoon inclusions and safe adventure.',
      season: 'Mar–Jun and Dec–Jan; Ladakh May–Sep',
    },
    {
      region: 'Rajasthan & Gujarat',
      places: ['Jaipur / Udaipur / Jaisalmer / Jodhpur', 'Kutch / Statue of Unity / Dwarka'],
      score: 91,
      momentum: 'Scale now',
      signal:
        'Drive, rail and flight access supports short breaks, weddings, families and culture-led winter travel.',
      sell: 'Royal weekends, desert camps, self-drive circuits and pilgrimage combinations.',
      season: 'Oct–Mar; launch festive creative in Aug',
    },
    {
      region: 'South India hills & heritage',
      places: ['Coorg / Chikmagalur / Hampi', 'Ooty / Kodaikanal', 'Munnar / Alleppey / Wayanad'],
      score: 89,
      momentum: 'Scale now',
      signal:
        'Strong road-trip and short-flight catchments make these reliable regional performance products.',
      sell: 'Weekend villas, coffee trails, family cabs, houseboats and workation extensions.',
      season: 'Year-round; hills peak Apr–Jun and Sep–Jan',
    },
    {
      region: 'Northeast & East',
      places: ['Meghalaya', 'Sikkim', 'Arunachal Pradesh', 'Assam', 'Darjeeling', 'Sundarbans'],
      score: 83,
      momentum: 'Grow',
      signal:
        'Jorhat (Assam) is India’s #1 trending 2026 search (+493%, Skyscanner); scenic road journeys and less-crowded discovery are rising with young professionals and repeat travellers.',
      sell: 'Permit-managed circuits, local drivers, fixed departures and monsoon waterfalls.',
      season: 'Mar–May and Oct–Dec; Meghalaya Jun–Sep niche',
    },
    {
      region: 'Central & Western escapes',
      places: [
        'Khajuraho / Pachmarhi / Bandhavgarh / Kanha / Pench',
        'Lonavala / Mahabaleshwar / Ajanta–Ellora',
      ],
      score: 78,
      momentum: 'Grow',
      signal:
        'Weekend drive and wildlife demand converts best from nearby metros with exact travel-time promises.',
      sell: '2–4 night drive breaks, tiger safaris, monsoon villas and heritage extensions.',
      season: 'Wildlife Oct–Jun; Western Ghats Jun–Sep',
    },
    {
      region: 'Spiritual & heritage North/East',
      places: ['Varanasi', 'Ayodhya', 'Agra', 'Puri', 'Konark'],
      score: 90,
      momentum: 'Scale now',
      signal:
        'Pilgrimage, family groups and improved infrastructure sustain high-frequency intent.',
      sell: 'Senior-friendly departures, darshan support, clean hotels and rail/flight options.',
      season: 'Year-round; festival and winter peaks',
    },
  ],
};

export const marketRows: Record<TravelVertical, MarketRow[]> = {
  outbound: [
    [
      'Hyderabad / Telangana',
      'Dubai, Bali, Singapore, Malaysia, Thailand, Vietnam',
      '25–44 · IT, pharma · couples/families',
      'Direct-flight and easy-visa Telugu/English creative',
    ],
    [
      'Mumbai / Maharashtra',
      'Dubai, Europe, Turkey, Maldives, Singapore, Bali',
      'Affluent families, couples, groups',
      'Premium departures + EMI + visa concierge',
    ],
    [
      'Delhi NCR / Haryana',
      'Dubai, Turkey, Azerbaijan, Georgia, Kazakhstan, Europe',
      'Young professionals, families, groups',
      'Novelty short-haul + escorted Europe',
    ],
    [
      'Bengaluru / Karnataka',
      'Bali, Vietnam, Thailand, Singapore, Japan, Europe',
      'Tech professionals, DINKs, solo',
      'Experience-led reels + flexible itineraries',
    ],
    [
      'Chennai / Tamil Nadu',
      'Singapore, Malaysia, Sri Lanka, Dubai, Bali',
      'Families, VFR, honeymoon',
      'Tamil/English, food and direct-access reassurance',
    ],
    [
      'Kochi / Kerala',
      'Dubai, Oman, Qatar, Saudi Arabia, Malaysia, Singapore, Sri Lanka',
      'VFR, family, senior',
      'Gulf frequency + family reunion extensions',
    ],
    [
      'Ahmedabad / Gujarat',
      'Dubai, Azerbaijan, Georgia, Turkey, Singapore',
      'Families, groups, vegetarian travellers',
      'Fixed departures + Indian meals + visa ease',
    ],
    [
      'Kolkata / West Bengal',
      'Thailand, Vietnam, Singapore, Bali, Bhutan, Europe',
      'Young couples, families, culture',
      'Short-haul fare + Durga Puja departure bursts',
    ],
    [
      'Chandigarh / Punjab',
      'Dubai, Europe, Canada, Thailand, Bali',
      'Families, honeymoon, VFR',
      'Delhi-connect packages + Punjabi creator proof',
    ],
    [
      'Jaipur / Rajasthan',
      'Dubai, Thailand, Bali, Singapore, Europe',
      'Couples, SMEs, families',
      'Ex-Jaipur where viable; compare ex-Delhi options',
    ],
    [
      'Lucknow / Uttar Pradesh',
      'Dubai, Thailand, Singapore, Saudi Arabia, Europe',
      'Family, honeymoon, pilgrimage',
      'Ex-Lucknow convenience + assisted visa',
    ],
    [
      'Visakhapatnam / Andhra Pradesh',
      'Singapore, Malaysia, Thailand, Bali, Dubai',
      'IT, families, honeymoon',
      'Connection clarity + Telugu consultation funnel',
    ],
  ].map(([market, destinations, audience, play]) => ({ market, destinations, audience, play })),
  inbound: [
    [
      'USA',
      'Golden Triangle, Rajasthan, Kerala, Varanasi, wildlife',
      'Heritage, luxury, VFR; 10–18 nights',
      '#1 source market (1.81M arrivals 2025) — USD pricing, private guide proof, 90–180 day nurture',
    ],
    [
      'UK',
      'Golden Triangle, Rajasthan, Kerala, Goa',
      'Culture, rail, family roots; 10–16 nights',
      '#2 source (1.07M arrivals 2025) — GBP pages, ATOL-safe partner cues, heritage storytelling',
    ],
    [
      'Bangladesh',
      'Kolkata, Delhi, Agra — medical extensions only',
      'Medical companion + essential family travel',
      'Leisure visas restricted since Aug 2024; arrivals fell 73% in 2025 — hold paid spend, serve medical/organic demand only',
    ],
    [
      'Sri Lanka',
      'Buddhist circuit, Chennai, Kerala, Delhi–Agra',
      'Pilgrimage, family, culture',
      'Compact 4–8 night circuits and group quotes',
    ],
    [
      'Canada',
      'Golden Triangle, Rajasthan, Punjab, Kerala',
      'VFR + leisure, family groups',
      'CAD pages and VFR extension packages',
    ],
    [
      'Australia',
      'Rajasthan, Kerala, MP/Karnataka wildlife',
      'Long-stay culture, wildlife, seniors',
      '14–21 night modular journeys, naturalist proof',
    ],
    [
      'Germany',
      'Kerala Ayurveda, Himalayas, Rajasthan, wildlife',
      'Wellness, active, responsible travel',
      'German pages, sustainability and transparent inclusions',
    ],
    [
      'France',
      'Rajasthan, Kerala, Puducherry, Himalayas',
      'Culture, food, boutique luxury',
      'French landing pages and expert-led slow travel',
    ],
    [
      'Russia',
      'Goa, Kerala, Rajasthan',
      'Winter sun, beach, family',
      'Russian pages, 16-day India e-Visa ease, long-stay rates and charter/DMC partnerships',
    ],
    [
      'Nepal',
      'Varanasi, Ayodhya, Buddhist circuit, Delhi',
      'Pilgrimage, family, education',
      'Hindi/Nepali assistance and overland options',
    ],
    [
      'Malaysia',
      'Kashmir, Kerala, Golden Triangle, Buddhist circuit',
      'Family, Muslim-friendly, culture',
      'Malay/English, halal cues and compact circuits',
    ],
    [
      'China',
      'Buddhist circuit, Golden Triangle, Kerala',
      'Culture, pilgrimage, business-leisure',
      'Mandarin assets via partners; Delhi/Kolkata–China direct flights resumed 2026 — rebuild circuits now',
    ],
    [
      'Japan',
      'Buddhist circuit, Delhi–Agra, Rajasthan, Ajanta–Ellora',
      'Culture, spiritual, senior',
      'Japanese itinerary detail, punctuality and guide quality',
    ],
    [
      'South Korea',
      'Buddhist circuit, Rajasthan, Delhi–Agra, wellness',
      'Young culture seekers, spiritual, business-leisure',
      'Korean creator/OTA partnerships and concise circuits',
    ],
    [
      'Singapore',
      'Kashmir, Rajasthan, Kerala, Northeast',
      'Affluent families, repeat visitors',
      'Short premium modules and school-holiday flights',
    ],
    [
      'Italy',
      'Rajasthan, Kerala, Goa, Hampi',
      'Art, architecture, food, couples',
      'Italian pages and boutique heritage stays',
    ],
    [
      'Spain',
      'Rajasthan, Varanasi, Kerala, Goa',
      'Culture, spirituality, backpackers',
      'Spanish pages and small-group departures',
    ],
    [
      'Netherlands',
      'Kerala, Rajasthan, Himalayas, Northeast',
      'Independent, active, responsible',
      'Cycling/walking depth and sustainable stays',
    ],
    [
      'Israel',
      'Himachal, Goa, Rajasthan, Kerala',
      'Backpacker, wellness, long-stay',
      'Hebrew support; June-2026 conflict advisory — pause paid acquisition, keep organic/repeat channels only',
    ],
    [
      'GCC · UAE / Saudi Arabia / Oman',
      'Kerala, Hyderabad, Mumbai, Kashmir, Goa',
      'Family, shopping, wellness, monsoon escape',
      'Arabic/English, halal, privacy, premium vehicles',
    ],
  ].map(([market, destinations, audience, play]) => ({ market, destinations, audience, play })),
  domestic: [
    [
      'Hyderabad / Telangana',
      'Goa, Kerala, Andaman, Himachal, Kashmir',
      'Couples, IT families, groups',
      'Flight bundles + Telugu WhatsApp advisors',
    ],
    [
      'Visakhapatnam / Andhra Pradesh',
      'Araku, Odisha, Telangana, Goa, Kerala, Kashmir',
      'Families, rail-led groups, honeymoon',
      'Rail/flight comparisons and regional departures',
    ],
    [
      'Mumbai / Maharashtra',
      'Goa, Kerala, Rajasthan, Himachal, Kashmir',
      'Weekend groups, affluent family, honeymoon',
      'Drive breaks + nonstop flight bundles',
    ],
    [
      'Delhi NCR / Haryana',
      'Himachal, Uttarakhand, Kashmir, Rajasthan, Goa',
      'Weekend, road trip, family',
      'Travel-time-led ads by NCR pin code',
    ],
    [
      'Bengaluru / Karnataka',
      'Goa, Kerala, Coorg, Chikmagalur, Andaman',
      'Tech couples, pet-friendly, workation',
      'Drive + villa products and long-weekend urgency',
    ],
    [
      'Chennai / Tamil Nadu',
      'Ooty, Kodaikanal, Kerala, Andaman, Goa, Kashmir',
      'Families, honeymoon, seniors',
      'Tamil/English, train/flight choice and food cues',
    ],
    [
      'Kochi / Kerala',
      'Goa, Andaman, Himachal, Kashmir, Northeast',
      'Couples, family, groups',
      'Ex-Kochi air bundles and summer snow',
    ],
    [
      'Ahmedabad / Gujarat',
      'Kashmir, Himachal, Goa, Kerala, Rajasthan',
      'Families, seniors, groups',
      'Vegetarian/Jain meals and fixed departures',
    ],
    [
      'Kolkata / West Bengal',
      'Sikkim, Darjeeling, Northeast, Odisha, Andaman',
      'Family, culture, young groups',
      'Rail/road circuits + Puja holiday calendar',
    ],
    [
      'Chandigarh / Punjab',
      'Himachal, Uttarakhand, Kashmir, Goa, Rajasthan',
      'Road trip, family, honeymoon',
      'Ex-Chandigarh cabs + short snow breaks',
    ],
    [
      'Jaipur / Rajasthan',
      'Udaipur/Jaisalmer, Gujarat, Goa, Himachal, Kashmir',
      'Drive, family, couples',
      'In-state weekends + ex-Jaipur flight bundles',
    ],
    [
      'Lucknow / Uttar Pradesh',
      'Ayodhya, Varanasi, Agra, Uttarakhand, Kashmir, Goa',
      'Pilgrimage, family, honeymoon',
      'Senior-safe circuits + ex-Lucknow fares',
    ],
  ].map(([market, destinations, audience, play]) => ({ market, destinations, audience, play })),
};

const toAudienceRows = (rows: string[][]): AudienceRow[] =>
  rows.map(([segment, age, profile, behavior, message]) => ({
    segment,
    age,
    profile,
    behavior,
    message,
  }));

export const audiences: Record<TravelVertical, AudienceRow[]> = {
  outbound: toAudienceRows([
    [
      'First passport / Gen Z',
      '18–24',
      'Students and early earners; solo or friends; budget-led',
      'Mobile research, social proof, late booking, visa-easy bias',
      'Your first international trip—simple, social and under control',
    ],
    [
      'Young professionals / honeymoon',
      '25–34',
      'DINKs, couples, solo; mid-income to affluent',
      'Reels to Search to WhatsApp; flexible dates; experience-led',
      'Private moments, smart value and zero itinerary stress',
    ],
    [
      'Family planners',
      '35–44',
      'Parents with children; upper-middle income',
      'School-calendar led; compares inclusions and food/access',
      'Direct flights, kid-friendly stays and one accountable planner',
    ],
    [
      'Premium / milestone',
      '45–54',
      'Business owners and senior professionals',
      'Consultation-led; values comfort, visa help and upgrades',
      'Curated comfort, private transfers and better-located hotels',
    ],
    [
      'Senior / escorted',
      '55+',
      'Retired couples, family groups, pilgrimage',
      'Long lead time; phone/branch trust; assisted documentation',
      'Paced itineraries, Indian meals and a tour manager throughout',
    ],
  ]),
  inbound: toAudienceRows([
    [
      'Backpacker & independent',
      '18–34',
      'Hostels, trains, food, nightlife, trekking; 2–6 weeks',
      'Search, YouTube, OTA activities, direct chat',
      'Local depth, safe logistics and flexible modules',
    ],
    [
      'Couples & honeymoon',
      '25–44',
      'Boutique stays, beaches, culture, privacy; 8–14 nights',
      'Instagram inspiration, reviews, specialist comparison',
      'A private India journey with memorable stays',
    ],
    [
      'Culture & heritage',
      '35–64',
      'Expert guides, UNESCO, food, photography; 10–18 nights',
      'Long research window; DMC/specialist-led',
      'Context-rich India, not a checklist tour',
    ],
    [
      'Luxury & wildlife',
      '35–64',
      'Private vehicles, palace hotels, safaris; high spend',
      'Advisor-led, proof-heavy, 4–9 months ahead',
      'Seamless access, exceptional guides and rare experiences',
    ],
    [
      'Senior / wellness / spiritual',
      '55+',
      'Ayurveda, yoga, pilgrimage, slow travel; 14–28 nights',
      'Trust, medical detail, accessibility and phone support',
      'Restorative India with a comfortable pace and clear care',
    ],
  ]),
  domestic: toAudienceRows([
    [
      'Students & first-job groups',
      '18–24',
      'Budget, nightlife, adventure, rail/bus',
      'Social-first; splits cost; books late',
      'More trip, less spend—everything your group needs',
    ],
    [
      'Couples / solo / honeymoon',
      '25–34',
      'Short flights, boutique stays, experiences',
      'Reels + Search + WhatsApp; 2–6 week lead',
      'A beautiful break built around the two of you',
    ],
    [
      'Family decision-makers',
      '35–44',
      'Children, parents, school holidays; mid/high income',
      'Compares hotel quality, transport and cancellation',
      'Comfort for everyone, with no hidden planning work',
    ],
    [
      'Affluent family / groups',
      '45–54',
      'Premium vehicles, villas, religious and leisure mixes',
      'Advisor-led and referral-sensitive',
      'Better stays, smoother transfers, dependable support',
    ],
    [
      'Senior & pilgrimage',
      '55+',
      'Temple circuits, relaxed sightseeing, rail/flight groups',
      'Calls and WhatsApp; early booking; trust-led',
      'Senior-friendly pacing, clean stays and assisted travel',
    ],
  ]),
};

export const keywords: Record<
  TravelVertical,
  { cluster: string; intent: string; terms: string[] }[]
> = {
  outbound: [
    {
      cluster: 'Short-haul value',
      intent: 'Package / transactional',
      terms: [
        'Dubai packages from Hyderabad',
        'Thailand tour package from Delhi',
        'Vietnam Da Nang package from Bangalore',
        'Malaysia budget tour package',
        'Singapore family holiday package',
        'Muscat Oman tour package from India',
      ],
    },
    {
      cluster: 'Couples & honeymoon',
      intent: 'High-intent theme',
      terms: [
        'Bali honeymoon package from India',
        'Maldives honeymoon with flights',
        'Turkey Cappadocia honeymoon package',
        'Mauritius couple package',
        'Seychelles honeymoon from Mumbai',
      ],
    },
    {
      cluster: 'Emerging circuits',
      intent: 'Discovery → lead',
      terms: [
        'Kazakhstan visa free trip from Delhi',
        'Almaty winter package from India',
        'Georgia family package from Mumbai',
        'Azerbaijan budget trip from India',
        'Uzbekistan group tour from India',
        'Baku Tbilisi combo package',
      ],
    },
    {
      cluster: 'Premium long-haul',
      intent: 'Consultation',
      terms: [
        'Europe tour package from India with visa',
        'Japan cherry blossom tour from India',
        'South Africa safari package from India',
        'Australia family package from India',
        'Northern Lights package from India',
      ],
    },
    {
      cluster: 'Friction reducers',
      intent: 'Problem / eligibility',
      terms: [
        'visa free countries for Indians 2026',
        'Thailand 60 day visa free rules for Indians',
        'Malaysia visa free for Indians 2026',
        'international packages with EMI',
        'tour package including visa and flights',
        'direct international flights from Hyderabad',
        'best foreign trip under 1 lakh',
      ],
    },
  ],
  inbound: [
    {
      cluster: 'Classic India',
      intent: 'Private tour / quote',
      terms: [
        'India tour package from USA',
        'Golden Triangle private tour',
        'Rajasthan luxury tour from UK',
        'Taj Mahal Jaipur tour with driver',
        'best India itinerary 14 days',
      ],
    },
    {
      cluster: 'Wellness & spiritual',
      intent: 'Program / stay',
      terms: [
        'India Ayurveda retreat for Europeans',
        'Kerala yoga retreat package',
        'Varanasi spiritual tour with guide',
        'Buddhist circuit India tour',
        'luxury wellness retreat India',
      ],
    },
    {
      cluster: 'Nature & adventure',
      intent: 'Specialist',
      terms: [
        'Ladakh tour for foreign tourists',
        'India tiger safari package',
        'Kerala backwaters private tour',
        'Northeast India guided tour',
        'Himalayan trekking tour India',
      ],
    },
    {
      cluster: 'Trust & logistics',
      intent: 'Validation',
      terms: [
        'reliable India tour operator',
        'private driver India itinerary',
        'English speaking guide India tour',
        'India eVisa tour package',
        'safe solo female tour India',
      ],
    },
    {
      cluster: 'Source-localised',
      intent: 'Country + product',
      terms: [
        'India tour from Australia',
        'voyage Rajasthan depuis France',
        'Indien Rundreise Kerala Rajasthan',
        'India halal family tour from Dubai',
        'Goa long stay package from Russia',
      ],
    },
  ],
  domestic: [
    {
      cluster: 'Origin + destination',
      intent: 'Package / fare',
      terms: [
        'Goa trip from Hyderabad',
        'Kashmir package from Delhi',
        'Manali family tour from Mumbai',
        'Andaman package from Chennai',
        'Kerala package from Bangalore',
        'Kaziranga Jorhat package from Kolkata',
      ],
    },
    {
      cluster: 'Couples & family',
      intent: 'High-intent theme',
      terms: [
        'Kashmir honeymoon package with flights',
        'Goa family package 4 days',
        'Kerala houseboat honeymoon package',
        'Rajasthan family tour with car',
        'Andaman couple package under 50000',
      ],
    },
    {
      cluster: 'Weekend / access',
      intent: 'Near-me planning',
      terms: [
        'weekend trips from Bangalore by car',
        '2 day trips from Delhi',
        'monsoon getaways near Mumbai',
        'long weekend packages from Hyderabad',
        'best hill station near Chennai',
      ],
    },
    {
      cluster: 'Pilgrimage & senior',
      intent: 'Assisted package',
      terms: [
        'Ayodhya Varanasi tour package',
        'senior citizen pilgrimage tour India',
        'Puri Konark package from Kolkata',
        'Dwarka Somnath tour package',
        'Char Dham package with helicopter',
      ],
    },
    {
      cluster: 'Season & budget',
      intent: 'Planning / conversion',
      terms: [
        'summer holiday packages in India',
        'snow packages December India',
        'domestic trip under 30000',
        'Diwali vacation packages India',
        'best places for monsoon trip India',
      ],
    },
  ],
};

export const competitors = [
  {
    name: 'MakeMyTrip / EaseMyTrip / Yatra',
    focus: 'Fare + inventory breadth',
    strength: 'Always-on Search, app offers, urgency and price anchors',
    opening: 'Win on advisor support, curated inclusions and transparent comparison.',
  },
  {
    name: 'Thomas Cook / SOTC / Veena World',
    focus: 'Escorted groups + trust',
    strength: 'Fixed departures, tour managers, visa support and branches',
    opening: 'Offer smaller groups, flexible modules and faster WhatsApp consultation.',
  },
  {
    name: 'TravelTriangle / Thrillophilia',
    focus: 'Lead marketplace + experiences',
    strength: 'Programmatic destination SEO, listicles and aggressive retargeting',
    opening: 'Use verified single-owner fulfilment, sharper proof and fewer hand-offs.',
  },
  {
    name: 'PickYourTrail',
    focus: 'Custom outbound holidays',
    strength: 'Itinerary productisation, calculators and modern social creative',
    opening: 'Compete through origin-city expertise, human concierge and regional language.',
  },
  {
    name: 'Akbar / regional agencies',
    focus: 'Visas, Gulf, local trust',
    strength: 'Community referrals, branch/phone support and ticketing depth',
    opening: 'Add polished landing pages, CRM speed and post-lead nurture.',
  },
  {
    name: 'Incredible India + state boards',
    focus: 'Inbound inspiration',
    strength: 'Destination authority, iconic storytelling and campaign reach',
    opening: 'Capture demand with bookable circuits, dates, proof and rapid quotes.',
  },
  {
    name: 'Inbound DMCs + Viator / GetYourGuide sellers',
    focus: 'Ground handling + activities',
    strength: 'Distribution, multilingual reviews and instant activity inventory',
    opening: 'Bundle end-to-end private journeys and partner where activity supply is stronger.',
  },
  {
    name: 'IRCTC Tourism',
    focus: 'Domestic rail + pilgrimage',
    strength: 'Trust, packaged departures and mass-market pricing',
    opening: 'Differentiate on hotel quality, smaller groups, cabs and custom pacing.',
  },
];

export const mediaPlans = {
  outbound: {
    meta: '40% prospecting video/carousel · 25% destination lead ads · 20% retargeting · 15% creator/offer tests',
    google:
      '55% exact/phrase destination packages · 20% origin-city terms · 15% brand/RLSA · 10% discovery/video assist',
    structure:
      'One campaign per destination cluster × origin airport; split visa-easy short haul from Schengen/long-haul nurture.',
    targeting:
      '25–54 core; layer honeymoon, parents, frequent international travellers, premium devices and airport catchments. Seed value-based lookalikes from past outbound converters by destination/AOV; keep interests broad enough for learning.',
    retarget:
      '0–7 day WhatsApp/open-lead urgency; 8–30 day itinerary/review proof; 31–90 day fare/season nurture. Exclude booked travellers and cross-sell next trip.',
    funnel:
      'Ad → destination-specific landing page → 6-field qualifier → WhatsApp in under 5 minutes → itinerary within 30 minutes → call task → payment link.',
  },
  inbound: {
    meta: '30% source-market video · 25% lead/WhatsApp-equivalent messaging · 25% retargeting · 20% language/creative tests',
    google:
      '60% Search by country/language · 15% high-value circuit pages · 15% remarketing · 10% YouTube inspiration',
    structure:
      'Separate campaigns and landing pages by source country, language, currency and circuit; avoid mixing cheap-click and high-AOV geographies.',
    targeting:
      'Foreign IP/geo only; exclude India except remarketing/operations QA. Build country-level converter lists, tour-page engagers and CRM value-based lookalikes.',
    retarget:
      '7-day itinerary CTA; 30-day guide/review/hotel proof; 180-day seasonal nurture. Optimise to qualified itinerary request, not raw form fill.',
    funnel:
      'Localised ad → currency/language page → trip-length/budget/country qualifier → email + WhatsApp/phone preference → named specialist → 24-hour proposal SLA.',
  },
  domestic: {
    meta: '45% geo prospecting · 20% long-weekend bursts · 20% retargeting · 15% UGC/offer tests',
    google:
      '50% origin-destination Search · 20% theme/season · 15% call ads/local · 15% remarketing/performance assist',
    structure:
      'State/city × access mode × theme: drive markets, rail groups and flight packages need different price anchors and landing pages.',
    targeting:
      '18–54 with age-specific creative; pin-code/radius targeting for drive markets; separate family, couple, group, pilgrimage and weekend forms. Build destination- and value-based lookalikes from domestic converters, excluding outbound/inbound pools.',
    retarget:
      '0–3 day availability/price; 4–14 day itinerary and hotel proof; 15–45 day next long weekend. Suppress converted dates and rotate destination.',
    funnel:
      'Ad → exact departure-city page → dates/travellers/budget → click-to-WhatsApp → instant template + human handoff → UPI/payment link → referral ask.',
  },
} satisfies Record<TravelVertical, Record<string, string>>;

export const creativeThemes = [
  {
    theme: 'Solo',
    hook: 'Go alone, never unsupported',
    visual: 'POV movement, hostels/cafes, maps and real solo UGC',
    offer: 'Flexible modules + safety check-ins',
    cta: 'Plan my solo trip',
  },
  {
    theme: 'Couples',
    hook: 'Less rushing. More us.',
    visual: 'Quiet scenic moments, boutique stays, cafes and private transfers',
    offer: 'Private itinerary + stay upgrade',
    cta: 'Build our escape',
  },
  {
    theme: 'Honeymoon',
    hook: 'The trip your wedding deserves',
    visual: 'Premium rooms, villas, candlelight and one hero experience',
    offer: 'Flights + transfers + romantic inclusions',
    cta: 'Get honeymoon options',
  },
  {
    theme: 'Adventure',
    hook: 'Collect stories, not checklists',
    visual: 'Fast-cut safari, ski, trek, road and water action',
    offer: 'Certified experiences + gear/logistics',
    cta: 'Find my adventure',
  },
  {
    theme: 'Family',
    hook: 'Easy for parents. Exciting for everyone.',
    visual: 'Real multi-generation moments, spacious rooms and simple routes',
    offer: 'Kid/senior-friendly plan + direct access',
    cta: 'Plan a family holiday',
  },
  {
    theme: 'Heritage / culture',
    hook: 'See the landmark. Understand the story.',
    visual: 'Cinematic texture, artisans, food and expert-guided details',
    offer: 'Private guide + curated multi-city circuit',
    cta: 'Design my India journey',
  },
  {
    theme: 'Wellness / spiritual',
    hook: 'Return with more than photographs',
    visual: 'Natural light, slow pacing, ritual, yoga and credible practitioners',
    offer: 'Curated retreat or pilgrimage support',
    cta: 'Find the right retreat',
  },
];

export const calendar = [
  [
    'Jan',
    'Republic Day / winter',
    'Dubai, Thailand, Maldives · Rajasthan, Goa · Golden Triangle',
    'Scale winter sun, snow and premium inbound; capture Apr–Jun Europe leads',
  ],
  [
    'Feb',
    'Valentine + spring intent',
    'Bali, Maldives, Vietnam · Kashmir, Andaman · Rajasthan',
    'Couples/honeymoon bursts; Japan blossom and summer family nurture',
  ],
  [
    'Mar',
    'Holi / Easter planning',
    'Singapore, Thailand, Sri Lanka · Goa, Rishikesh · Golden Triangle',
    'Long-weekend urgency; inbound shoulder pricing; summer Search expansion',
  ],
  [
    'Apr',
    'School summer begins',
    'Dubai, Singapore, Europe · Himachal, Kashmir, Kerala',
    'Family creative, direct flights and kid-friendly proof; retarget abandoned summer leads',
  ],
  [
    'May',
    'Peak family travel',
    'Europe, Bali, Vietnam · Kashmir, Northeast, hills',
    'Protect high-intent Search; use availability-led Meta and rapid WhatsApp SLAs',
  ],
  [
    'Jun',
    'Monsoon transition',
    'Malaysia, Singapore, Bali · Meghalaya, Kerala, Western Ghats',
    'Monsoon value, waterfalls and wellness; seed festive outbound audiences',
  ],
  [
    'Jul',
    'Value + early festive',
    'Vietnam, Thailand, Central Asia · Kerala, Coorg, Ladakh',
    'Price-led short haul; Independence/Onam/Puja audience building',
  ],
  [
    'Aug',
    'Independence Day / Onam',
    'Dubai, Sri Lanka, Baku · Kerala, Goa, Rajasthan',
    'Long-weekend packages; launch Oct–Dec inbound and Diwali departures',
  ],
  [
    'Sep',
    'Festive booking window',
    'Turkey, Georgia, Europe · Kashmir, Rajasthan, Northeast',
    'High share of Search; fixed departures, early-bird and visa-deadline content',
  ],
  [
    'Oct',
    'Dussehra / Puja',
    'Dubai, Thailand, Vietnam · Rajasthan, Kashmir, Sikkim',
    'Regional holiday calendars; winter inbound scale and December retargeting',
  ],
  [
    'Nov',
    'Diwali / wedding season',
    'Dubai, Bali, Maldives · Goa, Rajasthan, Andaman',
    'Honeymoon and family peaks; premium bundles and review-led remarketing',
  ],
  [
    'Dec',
    'Christmas / New Year',
    'Dubai, Thailand, Europe · Goa, snow, Kerala · India inbound',
    'Availability urgency, gala clarity, live pricing; collect next-summer intent',
  ],
].map(([month, moment, focus, action]) => ({ month, moment, focus, action }));

export const researchSources = [
  {
    label: 'Ministry of Tourism · Annual Tourism Snapshot 2025 (Feb 2026)',
    url: 'https://tourism.gov.in/sites/default/files/2026-02/Annual%20Tourism%20Snapshot%202025.pdf',
  },
  {
    label: 'Ministry of Tourism · India Tourism Data Compendium 2025',
    url: 'https://tourism.gov.in/sites/default/files/2025-09/India%20Tourism%20Data%20Compendium%202025.pdf',
  },
  {
    label: 'MakeMyTrip · India travel trends report',
    url: 'https://promos.makemytrip.com/mmt-travel-trends-report-apr24.pdf',
  },
  {
    label: 'Agoda · Indian travel to Southeast Asia',
    url: 'https://www.agoda.com/press/agoda-reports-rise-in-indian-travel-to-southeast-asia-as-visa-restrictions-ease-across-region/',
  },
  {
    label: 'Skyscanner · India Travel Trends 2026',
    url: 'https://www.skyscanner.co.in/travel-trends',
  },
  {
    label: 'Thomas Cook / SOTC · India Holiday Report 2025',
    url: 'https://resources.thomascook.in/downloads/SEINTIMATION28052025.pdf',
  },
  {
    label: 'MEA · Travel advisory for Iran and Israel (Jun 2026)',
    url: 'https://www.mea.gov.in/press-releases.htm?dtl/37777/Travel_advisory_for_Iran_and_Israel',
  },
];

const DEFAULT_TARGET_MARKETS: Record<TravelVertical, string[]> = {
  outbound: ['Delhi NCR', 'Mumbai', 'Hyderabad', 'Bengaluru'],
  inbound: ['USA', 'UK', 'Australia', 'Germany', 'France'],
  domestic: ['Delhi NCR', 'Mumbai', 'Hyderabad', 'Bengaluru'],
};

const DEFAULT_LANGUAGES: Record<TravelVertical, string[]> = {
  outbound: ['English', 'Hindi'],
  inbound: ['English'],
  domestic: ['English', 'Hindi'],
};

function sourceFor(vertical: TravelVertical, region: string) {
  if (vertical === 'inbound') return researchSources[0];
  if (vertical === 'outbound' && /MENA/i.test(region)) return researchSources[6];
  if (vertical === 'outbound' && /Southeast Asia/i.test(region)) return researchSources[3];
  if (vertical === 'outbound' && /Europe|East Asia|Oceania|Africa/i.test(region)) {
    return researchSources[4];
  }
  return researchSources[2];
}

function strategyId(vertical: TravelVertical, name: string) {
  return `${vertical}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cityNames(name: string) {
  const cleanName = name.replace(/\([^)]*\)/g, '');
  const dotParts = cleanName.split(/\s*·\s*/);
  const cityText = dotParts.length > 1 ? dotParts.slice(1).join(' / ') : cleanName;
  const parts = cityText
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [];
}

function demandFor(score: number): StrategyDemand {
  if (score >= 94) return 'explosive';
  if (score >= 88) return 'very_high';
  if (score >= 78) return 'high';
  return 'rising';
}

function confidenceFor(score: number, momentum: DestinationGroup['momentum']): StrategyConfidence {
  if (score >= 90 && momentum === 'Scale now') return 'proven';
  if (score >= 76 && momentum !== 'Test') return 'confirmed';
  return 'breakout';
}

function entryFor(vertical: TravelVertical, region: string) {
  if (vertical === 'domestic') return undefined;
  if (vertical === 'inbound') return 'India e-Visa for eligible passports · verify nationality';
  if (/South Asia|Indian Ocean/i.test(region)) {
    return 'Nepal open · Maldives free VOA · Sri Lanka free ETA · Mauritius/Seychelles visa-free';
  }
  if (/Southeast Asia/i.test(region)) {
    return 'Thailand 60-day & Malaysia visa-free (to Dec 2026) · e-Visa/VOA elsewhere';
  }
  if (/Middle East|MENA/i.test(region)) {
    return 'e-Visa · UAE VOA with valid US/UK/Schengen visa · check live advisories';
  }
  if (/Caucasus|Central Asia/i.test(region)) {
    return 'Kazakhstan visa-free 14 days · quick e-Visa elsewhere';
  }
  if (/East Asia/i.test(region)) {
    return 'Japan eVisa via accredited agency · China embassy visa · HK PAR';
  }
  if (/Europe/i.test(region)) return 'Schengen / UK visa · apply 8–12 weeks early';
  if (/Americas/i.test(region)) return 'Pre-arranged visitor visa · long US appointment waits';
  return 'Visa / entry rules vary · verify before advertising';
}

function budgetFor(vertical: TravelVertical, momentum: DestinationGroup['momentum']) {
  if (vertical === 'inbound') {
    return momentum === 'Scale now'
      ? 'US$900–2,800 pp · indicative land-only'
      : 'US$1,200–3,800 pp · indicative land-only';
  }
  if (vertical === 'domestic') {
    return momentum === 'Scale now' ? '₹18k–₹55k pp · indicative' : '₹25k–₹75k pp · indicative';
  }
  if (momentum === 'Scale now') return '₹45k–₹1.2L pp · indicative';
  if (momentum === 'Grow') return '₹75k–₹2.4L pp · indicative';
  return '₹90k–₹3L pp · test live pricing';
}

function themesFor(name: string, region: string) {
  const text = `${name} ${region}`.toLowerCase();
  const themes = new Set<string>();
  if (/maldives|bali|goa|island|seychelles|mauritius|andaman|beach|phuket|krabi/.test(text)) {
    themes.add('Beach');
    themes.add('Honeymoon');
  }
  if (/himalaya|ladakh|manali|rishikesh|safari|wildlife|kaziranga|corbett|nubra/.test(text)) {
    themes.add('Adventure');
  }
  if (/rajasthan|triangle|heritage|europe|japan|egypt|jordan|hampi|varanasi|buddhist/.test(text)) {
    themes.add('Heritage');
  }
  if (/kerala|ayurveda|yoga|spiritual|pilgrimage|ayodhya|puri|bodh|haridwar/.test(text)) {
    themes.add('Wellness / spiritual');
  }
  if (/dubai|singapore|malaysia|thailand|kashmir|rajasthan|goa/.test(text)) themes.add('Family');
  if (themes.size === 0) themes.add('Culture & leisure');
  return [...themes].slice(0, 3);
}

function matchingMarkets(vertical: TravelVertical, name: string, region: string) {
  const needles = [...cityNames(name), name.split(/[·/]/)[0], region]
    .map((value) => value.toLowerCase().trim())
    .filter((value) => value.length > 2);
  const matches = marketRows[vertical]
    .filter((row) => needles.some((needle) => row.destinations.toLowerCase().includes(needle)))
    .map((row) => row.market.replace(/\s*\/.*$/, ''));
  return [...new Set(matches)].slice(0, 6).length
    ? [...new Set(matches)].slice(0, 6)
    : DEFAULT_TARGET_MARKETS[vertical];
}

function keywordsFor(vertical: TravelVertical, name: string, targetMarkets: string[]) {
  const cleanName = name.replace(/\s*·\s*/g, ' ').replace(/\s*\/\s*/g, ' ');
  const market = targetMarkets[0];
  if (vertical === 'inbound') {
    return [
      `${cleanName} private tour India`,
      `${cleanName} tour package from ${market}`,
      `${cleanName} tour with English speaking guide`,
      `luxury ${cleanName} itinerary`,
      `trusted India tour operator for ${cleanName}`,
    ];
  }
  if (vertical === 'domestic') {
    return [
      `${cleanName} tour package from ${market}`,
      `${cleanName} family package`,
      `${cleanName} honeymoon package`,
      `${cleanName} trip cost per person`,
      `best time to visit ${cleanName}`,
    ];
  }
  return [
    `${cleanName} tour package from ${market}`,
    `${cleanName} package from India with flights`,
    `${cleanName} honeymoon package`,
    `${cleanName} family holiday package`,
    `${cleanName} visa for Indians`,
  ];
}

function languagesFor(vertical: TravelVertical, targets: string[]) {
  const languages = new Set(DEFAULT_LANGUAGES[vertical]);
  if (vertical === 'inbound') {
    if (targets.some((target) => /Germany/i.test(target))) languages.add('German');
    if (targets.some((target) => /France/i.test(target))) languages.add('French');
    if (targets.some((target) => /Russia/i.test(target))) languages.add('Russian');
    if (targets.some((target) => /GCC|UAE|Saudi|Oman/i.test(target))) languages.add('Arabic');
  }
  return [...languages];
}

function buildStrategyDestination(
  vertical: TravelVertical,
  group: DestinationGroup,
  name: string,
): StrategyDestination {
  const targetMarkets = matchingMarkets(vertical, name, group.region);
  const themes = themesFor(name, group.region);
  const source = sourceFor(vertical, group.region);
  const buyerLabel = vertical === 'inbound' ? 'source markets' : 'origin markets';
  return {
    id: strategyId(vertical, name),
    vertical,
    name,
    region: group.region,
    cities: cityNames(name),
    score: group.score,
    momentum: group.momentum,
    demand: demandFor(group.score),
    confidence: confidenceFor(group.score, group.momentum),
    trajectory: `2024: category demand established → 2025: ${group.signal} → 2026: ${
      group.momentum === 'Scale now'
        ? 'scale with live price and capacity controls'
        : group.momentum === 'Grow'
          ? 'expand through measured destination tests'
          : 'validate weekly before increasing spend'
    }`,
    growthSignal: group.signal,
    sourceLabel: source.label,
    sourceUrl: source.url,
    entry: entryFor(vertical, group.region),
    bestMonths: group.season.split(';')[0],
    adWindow: group.season.includes(';')
      ? group.season.split(';').slice(1).join(';').trim()
      : 'Launch 6–12 weeks before peak travel',
    budget: budgetFor(vertical, group.momentum),
    targetMarkets,
    languages: languagesFor(vertical, targetMarkets),
    audience: `Priority ${buyerLabel}: ${targetMarkets.join(', ')}. Best matched to ${themes.join(', ').toLowerCase()} travellers.`,
    angle: group.sell,
    themes,
    googleKeywords: keywordsFor(vertical, name, targetMarkets),
    metaInterests: [...new Set([name.split(/[·/]/)[0].trim(), ...themes, 'Travel'])].slice(0, 6),
  };
}

export const strategyDestinations: Record<TravelVertical, StrategyDestination[]> = {
  outbound: destinations.outbound.flatMap((group) =>
    group.places.map((name) => buildStrategyDestination('outbound', group, name)),
  ),
  inbound: destinations.inbound.flatMap((group) =>
    group.places.map((name) => buildStrategyDestination('inbound', group, name)),
  ),
  domestic: destinations.domestic.flatMap((group) =>
    group.places.map((name) => buildStrategyDestination('domestic', group, name)),
  ),
};

// --- Trending-2 inventory matching -----------------------------------------
// Shared helpers that let catalogue screens (packages, cars, stays, cruises,
// experiences) surface inventory matching the Trending-2 strategy data.

export type Trending2SubTab = 'all' | 'international' | 'india';

const TRENDING2_MONTHS: string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Generic / directional words that would create false inventory matches.
const TRENDING2_STOP_WORDS = new Set([
  'and',
  'the',
  'with',
  'from',
  'south',
  'north',
  'east',
  'west',
  'new',
  'republic',
  'national',
  'park',
  'island',
  'islands',
  'valley',
  'safari',
  'circuit',
  'circuits',
]);

// Real place names that would otherwise be dropped by the min-length filter.
const TRENDING2_SHORT_PLACES = new Set(['goa', 'leh', 'uae', 'usa']);

// Names whose useful search terms are not derivable from the name itself.
const TRENDING2_NAME_ALIASES: Record<string, string[]> = {
  UK: ['united kingdom', 'london', 'england', 'scotland'],
  USA: ['united states', 'america', 'new york'],
};

function trending2MonthIndexes(seasonText: string): Set<number> {
  const months = new Set<number>();
  if (/year[\s-]?round/i.test(seasonText)) {
    for (let index = 0; index < 12; index += 1) months.add(index);
    return months;
  }
  const monthPattern = TRENDING2_MONTHS.join('|');
  const ranges = seasonText.matchAll(
    new RegExp(`(${monthPattern})\\s*[–—-]\\s*(${monthPattern})`, 'g'),
  );
  for (const [, start, end] of ranges) {
    const endIndex = TRENDING2_MONTHS.indexOf(end);
    for (let index = TRENDING2_MONTHS.indexOf(start); ; index = (index + 1) % 12) {
      months.add(index);
      if (index === endIndex) break;
    }
  }
  for (const [single] of seasonText.matchAll(new RegExp(monthPattern, 'g'))) {
    months.add(TRENDING2_MONTHS.indexOf(single));
  }
  return months;
}

function trending2KeywordsFor(destination: StrategyDestination): string[] {
  const tokens = [destination.name, ...destination.cities]
    .join(' ')
    .toLowerCase()
    .replace(/[()·,/&–—-]/g, ' ')
    .split(/\s+/)
    .filter(
      (token) =>
        !TRENDING2_STOP_WORDS.has(token) && (token.length > 3 || TRENDING2_SHORT_PLACES.has(token)),
    );
  return [...tokens, ...(TRENDING2_NAME_ALIASES[destination.name] ?? [])];
}

/**
 * Destinations worth surfacing right now: every explosive / very-high demand
 * pick, plus anything whose best-season window covers the current month.
 */
export function getTrending2Destinations(
  subTab: Trending2SubTab = 'all',
  now: Date = new Date(),
): StrategyDestination[] {
  const month = now.getMonth();
  const inDemandNow = (destination: StrategyDestination) =>
    destination.demand === 'explosive' ||
    destination.demand === 'very_high' ||
    trending2MonthIndexes(destination.bestMonths).has(month);
  const international = strategyDestinations.outbound.filter(inDemandNow);
  const india = [...strategyDestinations.inbound, ...strategyDestinations.domestic].filter(
    inDemandNow,
  );
  if (subTab === 'international') return international;
  if (subTab === 'india') return india;
  return [...international, ...india];
}

export function getTrending2Keywords(
  subTab: Trending2SubTab = 'all',
  now: Date = new Date(),
): string[] {
  return [...new Set(getTrending2Destinations(subTab, now).flatMap(trending2KeywordsFor))];
}

export function matchesTrending2(text: string | null | undefined, keywords: string[]): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}
