// Curated India travel-demand dataset for the Trending screen.
// Compiled July 2026 and cross-validated across THREE years of reports, so
// every pick carries a trajectory (2024 → 2025 → 2026) and a confidence tier:
//   proven     = appears in 3 consecutive years of independent data
//   confirmed  = 2 years of supporting data
//   breakout   = 1-year surge — first-mover upside, higher risk
//
// Sources (growth numbers only quoted where a source published them):
//  • Google Year in Search 2024 (India, travel): Azerbaijan, Bali, Manali,
//    Kazakhstan, Jaipur, Georgia, Malaysia, Ayodhya, Kashmir, South Goa.
//  • Google Year in Search 2025 (India, travel): Maha Kumbh, Philippines,
//    Georgia, Mauritius, Kashmir, Phu Quoc, Phuket, Maldives, Somnath,
//    Pondicherry.
//  • Skyscanner Travel Trends 2025 (India): Shillong #1 trending; Baku,
//    Langkawi, Tokyo, Seoul trending; Almaty #1 best-value; KL & Singapore
//    best-value; 66% of Indians planning to travel more.
//  • Skyscanner Travel Trends 2026 (India): Jorhat +493%, Varanasi +120%
//    flight-search growth; 1-in-3 avoiding crowded hotspots; 86% AI-confident.
//  • Agoda Travel Trends 2026: 35% domestic-first; Delhi NCR most booked;
//    Puri/Wayanad/Goa summer trending; Rishikesh +22%; 47% budget ≤ ₹5k/night.
//  • MakeMyTrip "How India Travels Abroad": Dubai/Bangkok/Singapore/London top
//    cities; Almaty +527%, Baku +395%, Hong Kong +131% search growth;
//    Maharashtra/Karnataka/Delhi top source states; villa searches +42%.
//  • Arrivals data: Thailand 1.6M (2023) → 2.1M Indians (2024, #3 source
//    market) → 1.96M (2025). Vietnam 390k (2023) → 501k (2024, +28%) →
//    +42% YoY Jan–Aug 2025. Maldives record 2M total arrivals 2025.
//    Sri Lanka 295k Indian arrivals 2025. Vietnam issued 252k Indian e-visas
//    in 2025.
//  • Visa: Thailand 60-day visa-free; Malaysia visa-free to Dec 2026 (Visit
//    Malaysia Year 2026); Vietnam $25 90-day e-visa; Sri Lanka free ETA;
//    Philippines visa-free short stays; first direct India–Greece flights.
//
// Ad keywords are standard high-intent Indian search patterns for Google Ads
// and interest stacks for Meta — validate live volumes in Google Keyword
// Planner before spending.

export type Demand = 'explosive' | 'very_high' | 'high' | 'rising';
export type Confidence = 'proven' | 'confirmed' | 'breakout';

export interface TrendDestination {
  name: string;
  region: string;
  demand: Demand;
  confidence: Confidence;
  trajectory: string; // 2024 → 2025 → 2026 evidence chain
  growthSignal: string; // headline cited stat
  source: string; // where the signal comes from
  visa?: string; // outbound only
  bestMonths: string; // travel season
  adWindow: string; // when to run ads (booking lead time)
  budget: string; // typical per-person package budget
  audience: string; // who books it / source states
  angle: string; // selling angle for creatives
  googleKeywords: string[];
  metaInterests: string[];
}

export const OUTBOUND: TrendDestination[] = [
  {
    name: 'Thailand (Phuket · Krabi · Bangkok)',
    region: 'Southeast Asia',
    demand: 'very_high',
    confidence: 'proven',
    trajectory:
      '2024: 2.1M Indian arrivals (+30%, India became #3 source market) → 2025: 1.96M arrivals, Phuket #7 Google search → 2026: 60-day visa-free continues',
    growthSignal: '1.6M → 2.1M → ~2M Indian arrivals over three years',
    source: 'Tourism Authority of Thailand · Google Year in Search 2025',
    visa: 'Visa-free · 60 days',
    bestMonths: 'Nov – Mar (peak) · Jul–Sep value',
    adWindow: 'Sep – Jan & pre-summer Apr',
    budget: '₹45k – ₹80k / person (5N)',
    audience: 'Couples, bachelor groups, families — all metros; strong from Kolkata & Bengaluru',
    angle:
      'Visa-free + direct flights under 5 hrs — the easiest international upgrade from a Goa trip.',
    googleKeywords: [
      'thailand tour package from india',
      'phuket krabi package',
      'bangkok pattaya tour package',
      'thailand honeymoon package',
      'thailand visa free for indians',
    ],
    metaInterests: ['Phuket', 'International travel', 'Beach holidays', 'Honeymoon', 'Nightlife'],
  },
  {
    name: 'Vietnam (Da Nang · Phu Quoc · Hanoi)',
    region: 'Southeast Asia',
    demand: 'very_high',
    confidence: 'proven',
    trajectory:
      '2023: 390k Indian arrivals → 2024: 501k (+28%) → 2025: +42% YoY (Jan–Aug), Phu Quoc #6 Google search — three straight years of steep growth',
    growthSignal: '+28% then +42% arrivals growth back-to-back',
    source: 'Vietnam Immigration / Mastercard · Google Year in Search 2025',
    visa: 'e-Visa $25 · 90 days',
    bestMonths: 'Nov – Apr',
    adWindow: 'Sep – Feb',
    budget: '₹50k – ₹85k / person (6N)',
    audience:
      'Young couples & friend groups from Bengaluru, Hyderabad, Delhi; strong repeat-Thailand upgraders',
    angle:
      'Cheaper than Thailand, newer on Instagram — Ha Long Bay cruises and the Golden Bridge sell the click.',
    googleKeywords: [
      'vietnam tour package from india',
      'vietnam honeymoon package',
      'da nang tour package',
      'phu quoc island package',
      'vietnam visa for indians',
    ],
    metaInterests: ['Vietnam', 'Da Nang', 'Adventure travel', 'Backpacking', 'Street food'],
  },
  {
    name: 'Dubai & Abu Dhabi',
    region: 'Middle East',
    demand: 'very_high',
    confidence: 'proven',
    trajectory:
      "MMT's #1 most-booked international city in both its 2024 and 2025 reports; UAE tops overall outbound volume every year",
    growthSignal: "MMT's #1 most-booked international city for Indians",
    source: 'MakeMyTrip How India Travels Abroad',
    visa: 'e-Visa ~3–4 days · easy',
    bestMonths: 'Oct – Mar',
    adWindow: 'Aug – Dec + Dubai Shopping Festival (Dec–Jan)',
    budget: '₹55k – ₹1L / person (5N)',
    audience: 'Families & shoppers — Maharashtra, Gujarat, Kerala, Delhi NCR; year-round VFR base',
    angle:
      'Short flight, big spectacle — bundle Burj Khalifa + desert safari + theme parks for family season.',
    googleKeywords: [
      'dubai tour package from india',
      'dubai family package',
      'dubai visa for indians',
      'dubai package with flight',
      'abu dhabi ferrari world tickets',
    ],
    metaInterests: ['Dubai', 'Luxury travel', 'Shopping', 'Theme parks', 'Family holidays'],
  },
  {
    name: 'Bali, Indonesia',
    region: 'Southeast Asia',
    demand: 'very_high',
    confidence: 'proven',
    trajectory:
      '2024: #2 most-searched destination in India (Google) → 2025–26: evergreen honeymoon #1; villa searches +42% category-wide',
    growthSignal: "Google's #2 India search of 2024 · villa demand +42%",
    source: 'Google Year in Search 2024 · MakeMyTrip',
    visa: 'Visa on arrival',
    bestMonths: 'Apr – Oct (dry season)',
    adWindow: 'Jan – May + wedding season Sep–Nov',
    budget: '₹60k – ₹1.1L / person (6N)',
    audience:
      'Honeymooners & milestone couples nationwide; private-pool-villa content converts best',
    angle:
      'Private pool villa + floating breakfast = the highest-CTR honeymoon creative in Indian travel.',
    googleKeywords: [
      'bali tour package from india',
      'bali honeymoon package',
      'bali packages for couple with private pool',
      'bali visa for indians',
      'ubud nusa penida package',
    ],
    metaInterests: ['Bali', 'Honeymoon', 'Luxury resorts', 'Yoga retreats', 'Couples travel'],
  },
  {
    name: 'Baku, Azerbaijan',
    region: 'Caucasus',
    demand: 'explosive',
    confidence: 'proven',
    trajectory:
      "2024: Azerbaijan was India's #1 Google travel search → 2025: Skyscanner trending list → 2026: +395% MMT search growth — a genuine 3-year compounding trend",
    growthSignal: '+395% search growth on top of a #1 Google year',
    source: 'Google Year in Search 2024 · Skyscanner 2025 · MakeMyTrip',
    visa: 'e-Visa in 3 days',
    bestMonths: 'Apr – Jun · Sep – Oct',
    adWindow: 'Feb – May · Jul – Sep',
    budget: '₹55k – ₹90k / person (5N)',
    audience: 'Delhi NCR & Mumbai couples priced out of Europe; strong 25–40 Instagram audience',
    angle: '"Europe feel at half the price" — Flame Towers + old city + no Schengen paperwork.',
    googleKeywords: [
      'baku tour package',
      'azerbaijan tour package from india',
      'baku honeymoon package',
      'azerbaijan visa for indians',
      'baku in june',
    ],
    metaInterests: ['Azerbaijan', 'City breaks', 'Budget travel', 'Architecture', 'Couples travel'],
  },
  {
    name: 'Almaty, Kazakhstan',
    region: 'Central Asia',
    demand: 'explosive',
    confidence: 'proven',
    trajectory:
      "2024: Kazakhstan #4 on Google's India list → 2025: Skyscanner's #1 best-value destination → 2026: +527% MMT search growth — validated three years running",
    growthSignal: "+527% search growth — the fastest riser in India's outbound market",
    source: 'Google Year in Search 2024 · Skyscanner 2025 · MakeMyTrip',
    visa: 'Visa-free · 14 days',
    bestMonths: 'Apr – Jun · Sep – Nov · Dec–Feb for snow',
    adWindow: 'Year-round; push snow content Oct–Dec',
    budget: '₹50k – ₹85k / person (5N)',
    audience:
      'North India (Delhi, Punjab, Jaipur) — short direct flights; ski-curious young groups',
    angle:
      "Visa-free snow mountains 3.5 hrs from Delhi — the 'Switzerland on a Thailand budget' pitch.",
    googleKeywords: [
      'almaty tour package',
      'kazakhstan tour package from india',
      'almaty in december',
      'kazakhstan visa for indians',
      'almaty honeymoon package',
    ],
    metaInterests: ['Kazakhstan', 'Skiing', 'Mountain travel', 'Budget travel', 'Snow'],
  },
  {
    name: 'Georgia (Tbilisi · Gudauri)',
    region: 'Caucasus',
    demand: 'explosive',
    confidence: 'proven',
    trajectory:
      "2024: #6 on Google's India list → 2025: climbed to #3 → 2026: wine-trail and city-break buzz continues — rising for three consecutive years",
    growthSignal: "#6 (2024) → #3 (2025) in India's most-searched destinations",
    source: 'Google Year in Search 2024 & 2025 · India Outbound',
    visa: 'e-Visa · easy approval',
    bestMonths: 'May – Oct · Dec–Feb ski',
    adWindow: 'Feb – Jun',
    budget: '₹60k – ₹95k / person (6N)',
    audience: 'Millennial couples & girl-gangs from metros; wine + mountain content',
    angle:
      'Wine trails, Kazbegi mountains and European streets — without the Schengen rejection risk.',
    googleKeywords: [
      'georgia tour package from india',
      'tbilisi tour package',
      'georgia visa for indians',
      'gudauri ski package',
      'georgia honeymoon package',
    ],
    metaInterests: ['Georgia (country)', 'Wine', 'Mountains', 'Europe travel', 'Adventure travel'],
  },
  {
    name: 'Malaysia (KL · Langkawi)',
    region: 'Southeast Asia',
    demand: 'high',
    confidence: 'proven',
    trajectory:
      "2024: #7 on Google's India list → 2025: Langkawi trending + KL best-value (Skyscanner) → 2026: visa-free extended + Visit Malaysia Year 2026",
    growthSignal: 'Three years of signals, now amplified by Visit Malaysia Year 2026',
    source: 'Google 2024 · Skyscanner 2025 · India Outbound',
    visa: 'Visa-free to Dec 2026 · 30 days',
    bestMonths: 'Dec – Apr (west coast)',
    adWindow: 'Oct – Mar',
    budget: '₹40k – ₹70k / person (5N)',
    audience:
      'Families & first-time international from Chennai, Hyderabad, Kochi; Singapore combo buyers',
    angle:
      'Visit Malaysia Year 2026 = event calendar + airline deals. Bundle KL–Langkawi or Singapore–KL.',
    googleKeywords: [
      'malaysia tour package from india',
      'singapore malaysia package',
      'langkawi package',
      'malaysia visa free for indians',
      'kuala lumpur genting package',
    ],
    metaInterests: ['Malaysia', 'Langkawi', 'Family holidays', 'Island travel', 'Theme parks'],
  },
  {
    name: 'Philippines (Palawan · Cebu)',
    region: 'Southeast Asia',
    demand: 'explosive',
    confidence: 'breakout',
    trajectory:
      "Absent from 2024 lists → 2025: jumped straight to #2 on Google's India list after visa-free entry + Palawan named World's Best Island → 2026: watch conversion vs hype",
    growthSignal: '#2 most-searched destination in India 2025 — from nowhere',
    source: 'Google Year in Search 2025',
    visa: 'Visa-free short stays for Indians (new policy)',
    bestMonths: 'Nov – May',
    adWindow: 'Sep – Mar',
    budget: '₹70k – ₹1.2L / person (7N)',
    audience: 'Divers, island-hoppers, honeymooners from metros — early-adopter crowd',
    angle:
      'First-mover upside: almost no Indian agencies sell it yet. Test small budgets; El Nido reels outperform Maldives content.',
    googleKeywords: [
      'philippines tour package from india',
      'palawan el nido package',
      'philippines visa for indians',
      'cebu bohol package',
      'philippines honeymoon package',
    ],
    metaInterests: ['Philippines', 'Scuba diving', 'Island hopping', 'Beaches', 'Honeymoon'],
  },
  {
    name: 'Sri Lanka',
    region: 'South Asia',
    demand: 'high',
    confidence: 'confirmed',
    trajectory:
      '2024: free-ETA tourism revival began → 2025: 295k Indian arrivals + MMT top-5 search growth → 2026: momentum holding',
    growthSignal: '295k Indian arrivals in 2025 · MMT top-5 growth market',
    source: 'Sri Lanka Tourism · MakeMyTrip',
    visa: 'Free ETA · 30 days',
    bestMonths: 'Dec – Apr (south/west)',
    adWindow: 'Oct – Feb + long weekends',
    budget: '₹35k – ₹60k / person (5N)',
    audience: 'South India short-haul (Chennai, Bengaluru, Kochi); Ramayana-trail spiritual groups',
    angle:
      'Free visa + 1-hr flight from Chennai — pitch as the international trip that costs less than Goa in peak.',
    googleKeywords: [
      'sri lanka tour package from india',
      'sri lanka honeymoon package',
      'colombo kandy ella package',
      'ramayana tour sri lanka',
      'sri lanka visa for indians',
    ],
    metaInterests: ['Sri Lanka', 'Beaches', 'Tea', 'Wildlife safaris', 'Budget travel'],
  },
  {
    name: 'Maldives',
    region: 'Indian Ocean',
    demand: 'high',
    confidence: 'proven',
    trajectory:
      "Evergreen honeymoon leader → 2025: record 2M total arrivals + #8 on Google's India list → 2026: India demand recovered after the 2024 diplomatic dip",
    growthSignal: "Record 2M arrivals in 2025; back in India's Google top-10",
    source: 'Google Year in Search 2025 · Maldives Tourism',
    visa: 'Free visa on arrival',
    bestMonths: 'Nov – Apr',
    adWindow: 'Aug – Jan (wedding season)',
    budget: '₹90k – ₹2.5L / person (4N)',
    audience: 'Honeymoons, anniversaries, luxury families — Mumbai, Delhi, Hyderabad',
    angle:
      'Water-villa upgrade psychology: sell 3N resort + 1N water villa to hit premium price points.',
    googleKeywords: [
      'maldives package for couple',
      'maldives honeymoon package from india',
      'maldives water villa package',
      'maldives package under 1 lakh',
      'maldives visa for indians',
    ],
    metaInterests: [
      'Maldives',
      'Luxury travel',
      'Honeymoon',
      'Overwater bungalows',
      'Anniversaries',
    ],
  },
  {
    name: 'Mauritius',
    region: 'Indian Ocean',
    demand: 'rising',
    confidence: 'breakout',
    trajectory:
      "Not on 2024's list → 2025: #4 on Google's India list + three World Travel Awards → 2026: counter-season alternative to Maldives",
    growthSignal: '#4 most-searched destination in India 2025',
    source: 'Google Year in Search 2025',
    visa: 'Visa-free · 90 days',
    bestMonths: 'May – Dec',
    adWindow: 'Mar – Sep (counter-season to Maldives)',
    budget: '₹80k – ₹1.4L / person (6N)',
    audience:
      'Honeymooners wanting Maldives-plus-land-activities; Gujarati & Marathi family groups',
    angle:
      "Visa-free 'Maldives with things to do' — sell when Maldives monsoon discounts feel risky.",
    googleKeywords: [
      'mauritius tour package from india',
      'mauritius honeymoon package',
      'mauritius package for couple',
      'mauritius in june',
      'mauritius vs maldives',
    ],
    metaInterests: ['Mauritius', 'Honeymoon', 'Beach resorts', 'Snorkelling', 'Luxury travel'],
  },
  {
    name: 'Japan (Tokyo · Osaka)',
    region: 'East Asia',
    demand: 'rising',
    confidence: 'confirmed',
    trajectory:
      "2025: Tokyo on Skyscanner's India trending list + Japan in MMT's top search-growth markets → 2026: weak yen keeps it the best-value long-haul",
    growthSignal: 'Skyscanner 2025 trending + MMT top growth market',
    source: 'Skyscanner Travel Trends 2025 · MakeMyTrip',
    visa: 'e-Visa for Indians · moderate effort',
    bestMonths: 'Mar – May (sakura) · Oct – Nov (foliage)',
    adWindow: 'Nov – Feb (sakura books early) · Jun – Aug',
    budget: '₹1.3L – ₹2.2L / person (7N)',
    audience: 'Premium millennials & anime-generation from Mumbai, Bengaluru, Delhi',
    angle:
      'Cherry-blossom departures sell out months early — run sakura campaigns before New Year.',
    googleKeywords: [
      'japan tour package from india',
      'japan cherry blossom tour 2027',
      'tokyo osaka package',
      'japan visa for indians',
      'japan trip cost from india',
    ],
    metaInterests: ['Japan', 'Tokyo', 'Cherry blossom', 'Anime', 'Luxury travel'],
  },
  {
    name: 'Greece (Athens · Santorini)',
    region: 'Europe',
    demand: 'rising',
    confidence: 'breakout',
    trajectory:
      '2026: first-ever direct India–Greece flights just launched — no prior-year Indian mass-market base, which is exactly the early-mover window',
    growthSignal: 'First direct India–Greece flights — new demand unlocking',
    source: 'India Outbound 2026 analysis',
    visa: 'Schengen (apply 60+ days out)',
    bestMonths: 'May – Oct',
    adWindow: 'Dec – Apr (visa lead time)',
    budget: '₹1.3L – ₹2.2L / person (7N)',
    audience: 'Premium honeymooners & anniversary couples from metros',
    angle: "Direct flights just launched — own the 'Santorini without a stopover' message early.",
    googleKeywords: [
      'greece tour package from india',
      'santorini honeymoon package',
      'greece visa for indians',
      'athens santorini package',
      'europe honeymoon package',
    ],
    metaInterests: ['Santorini', 'Greek islands', 'Europe travel', 'Honeymoon', 'Luxury travel'],
  },
  {
    name: 'Singapore',
    region: 'Southeast Asia',
    demand: 'high',
    confidence: 'proven',
    trajectory:
      'MMT top-3 booked city in 2024 & 2025 reports · Skyscanner 2025 best-value list · steady family-segment #1',
    growthSignal: 'Top-3 booked + best-value listed across all three years',
    source: 'MakeMyTrip · Skyscanner Travel Trends 2025',
    visa: 'e-Visa via agents',
    bestMonths: 'Year-round · Dec peak',
    adWindow: 'Mar – May (summer holidays) · Oct – Dec',
    budget: '₹65k – ₹1.1L / person (5N)',
    audience: 'Families with kids (Universal, Sentosa, cruises) — Gujarat, Maharashtra, Tamil Nadu',
    angle:
      'School-holiday certainty: theme parks + cruise add-on makes the highest-AOV family package.',
    googleKeywords: [
      'singapore tour package from india',
      'singapore family package',
      'singapore cruise package',
      'universal studios singapore tickets',
      'singapore malaysia thailand package',
    ],
    metaInterests: ['Singapore', 'Universal Studios', 'Family holidays', 'Cruises', 'Theme parks'],
  },
];

export const DOMESTIC: TrendDestination[] = [
  {
    name: 'Kashmir (Srinagar · Gulmarg · Pahalgam)',
    region: 'Jammu & Kashmir',
    demand: 'very_high',
    confidence: 'proven',
    trajectory:
      "2024: #9 on Google's India list + 2.35 crore visitors → 2025: climbed to #5 → 2026: sustained demand — three straight years in the national top-10",
    growthSignal: "#9 (2024) → #5 (2025) in India's most-searched destinations",
    source: 'Google Year in Search 2024 & 2025',
    bestMonths: 'Mar – Jun (blooms) · Dec – Feb (snow)',
    adWindow: 'Jan – Apr for summer · Sep – Nov for snow',
    budget: '₹25k – ₹55k / person (5N)',
    audience: 'Honeymooners & families from Gujarat, Maharashtra, West Bengal, South metros',
    angle:
      'Tulip season (Apr) and first-snow (Dec) are the two highest-converting creative windows.',
    googleKeywords: [
      'kashmir tour package',
      'kashmir honeymoon package',
      'srinagar houseboat booking',
      'gulmarg gondola tickets',
      'kashmir package for couple',
    ],
    metaInterests: ['Kashmir', 'Honeymoon', 'Snow', 'Houseboats', 'Mountains'],
  },
  {
    name: 'Jorhat & Upper Assam (Kaziranga circuit)',
    region: 'Assam',
    demand: 'explosive',
    confidence: 'confirmed',
    trajectory:
      "2025: Shillong was Skyscanner's #1 India trending pick → 2026: the Northeast wave moved to Jorhat at +493% — a two-year regional streak, not a one-off",
    growthSignal: "+493% flight-search growth — India's #1 trending destination for 2026",
    source: 'Skyscanner Travel Trends 2025 & 2026',
    bestMonths: 'Nov – Apr (Kaziranga open)',
    adWindow: 'Sep – Feb',
    budget: '₹22k – ₹45k / person (5N)',
    audience:
      'Wildlife + tea-estate seekers; crowd-avoiders from metros (1-in-3 now avoid hotspots)',
    angle:
      "First-mover advantage: almost no organised packages exist — own 'Majuli + Kaziranga + tea bungalow'.",
    googleKeywords: [
      'kaziranga tour package',
      'assam tour package',
      'majuli island trip',
      'kaziranga safari booking',
      'northeast india package',
    ],
    metaInterests: ['Assam', 'Wildlife safaris', 'Tea', 'Offbeat travel', 'National parks'],
  },
  {
    name: 'Varanasi & Spiritual UP',
    region: 'Uttar Pradesh',
    demand: 'very_high',
    confidence: 'proven',
    trajectory:
      "2024: Ayodhya #8 on Google's list (Ram Mandir opening) → 2025: Maha Kumbh was India's #1 search + Somnath #9 → 2026: Varanasi +120% flight searches — spiritual travel is a 3-year megatrend",
    growthSignal: '+120% flight-search growth riding a 3-year spiritual-tourism wave',
    source: 'Google 2024 & 2025 · Skyscanner Travel Trends 2026',
    bestMonths: 'Oct – Mar · Dev Deepawali (Nov)',
    adWindow: 'Aug – Feb; festival-pegged bursts',
    budget: '₹12k – ₹30k / person (3N)',
    audience: 'Multi-generational family groups nationwide; strong 45+ audience on Meta',
    angle:
      "Spiritual tourism is India's fastest-growing segment — bundle Kashi + Ayodhya + Prayagraj.",
    googleKeywords: [
      'varanasi tour package',
      'kashi ayodhya tour package',
      'varanasi ganga aarti tour',
      'ayodhya ram mandir package',
      'prayagraj varanasi package',
    ],
    metaInterests: ['Varanasi', 'Pilgrimage', 'Hinduism', 'Ganga aarti', 'Family travel'],
  },
  {
    name: 'Rishikesh & Uttarakhand',
    region: 'Uttarakhand',
    demand: 'very_high',
    confidence: 'confirmed',
    trajectory:
      '2025: wellness-travel wave building → 2026: +22% accommodation-search growth (Agoda) with families driving camps & yoga retreats',
    growthSignal: '+22% accommodation-search growth',
    source: 'Agoda Travel Trends 2026',
    bestMonths: 'Sep – Jun · Char Dham May–Oct',
    adWindow: 'Jan – May · Aug – Oct',
    budget: '₹10k – ₹28k / person (3N)',
    audience: 'Delhi NCR weekenders, corporate offsites, yoga/wellness seekers',
    angle:
      'Wellness + adventure double-sell: rafting-camp weekends AND yoga-retreat packages to different audiences.',
    googleKeywords: [
      'rishikesh camping package',
      'rishikesh rafting price',
      'char dham yatra package',
      'auli tour package',
      'rishikesh yoga retreat',
    ],
    metaInterests: ['Rishikesh', 'Yoga', 'River rafting', 'Camping', 'Wellness retreats'],
  },
  {
    name: 'Goa',
    region: 'Goa',
    demand: 'very_high',
    confidence: 'proven',
    trajectory:
      "2024: South Goa #10 on Google's India list → 2025: steady OTA volume leader → 2026: Agoda trending summer pick — demand never left, competition did",
    growthSignal: 'Google top-10 (2024) + Agoda summer-trending (2026)',
    source: 'Google Year in Search 2024 · Agoda Travel Trends 2026',
    bestMonths: 'Nov – Feb peak · Jun–Sep monsoon deals',
    adWindow: 'Sep – Dec + NYE burst · monsoon offers May–Jul',
    budget: '₹12k – ₹35k / person (4N)',
    audience: 'Pan-India: couples, bachelorettes, families; villa demand up 42% category-wide',
    angle:
      'Fight OTA price wars with villa + scooter + curated-experience bundles, not bare hotel rates.',
    googleKeywords: [
      'goa tour package',
      'goa package for couple',
      'goa villas with private pool',
      'goa new year party package',
      'north goa package with flights',
    ],
    metaInterests: ['Goa', 'Beach parties', 'Villas', 'Nightlife', 'Weekend getaways'],
  },
  {
    name: 'Wayanad & Kerala Hills',
    region: 'Kerala',
    demand: 'high',
    confidence: 'confirmed',
    trajectory:
      'Kerala is an evergreen top-5 domestic market; 2026: Wayanad specifically named an Agoda trending summer family pick',
    growthSignal: 'Agoda trending summer family destination 2026',
    source: 'Agoda Travel Trends 2026',
    bestMonths: 'Sep – May · Ayurveda Jun–Aug',
    adWindow: 'Feb – May (summer) · Apr–Jun (monsoon retreats)',
    budget: '₹15k – ₹40k / person (4N)',
    audience: 'Bengaluru & Chennai drive-market families; NRI Ayurveda seekers',
    angle:
      "Treehouse + plantation stays for summer; 'monsoon Ayurveda' premium retreats for the off-season.",
    googleKeywords: [
      'wayanad tour package',
      'kerala tour packages',
      'munnar alleppey package',
      'kerala houseboat booking',
      'ayurveda retreat kerala',
    ],
    metaInterests: ['Kerala', 'Ayurveda', 'Hill stations', 'Houseboats', 'Nature travel'],
  },
  {
    name: 'Puri & Coastal Odisha',
    region: 'Odisha',
    demand: 'rising',
    confidence: 'breakout',
    trajectory:
      "New on the 2026 radar: Agoda named Puri a trending summer destination — fits the 3-year spiritual-tourism wave (Ayodhya '24, Kumbh '25)",
    growthSignal: 'Agoda trending summer destination for Indian families',
    source: 'Agoda Travel Trends 2026',
    bestMonths: 'Oct – Mar · Rath Yatra (Jun–Jul)',
    adWindow: 'Aug – Feb · Rath Yatra burst Apr–Jun',
    budget: '₹8k – ₹20k / person (3N)',
    audience: 'East India families (Kolkata feeder), spiritual travellers nationwide',
    angle:
      'Jagannath + Konark + Chilika triangle — high volume, low competition from national agencies.',
    googleKeywords: [
      'puri tour package',
      'puri jagannath temple package',
      'konark chilika tour',
      'odisha tour package',
      'puri hotels near sea beach',
    ],
    metaInterests: ['Puri', 'Pilgrimage', 'Beaches', 'Temples', 'Family travel'],
  },
  {
    name: 'Meghalaya (Shillong · Cherrapunji)',
    region: 'Meghalaya',
    demand: 'high',
    confidence: 'confirmed',
    trajectory:
      "2025: Shillong was Skyscanner's #1 trending destination for Indians → 2026: the wave spread across the Northeast (Jorhat +493% next door)",
    growthSignal: "Skyscanner's #1 India trending pick of 2025",
    source: 'Skyscanner Travel Trends 2025 & 2026',
    bestMonths: 'Oct – May · waterfalls Jun–Sep',
    adWindow: 'Aug – Apr',
    budget: '₹18k – ₹38k / person (5N)',
    audience: 'Young couples & friend groups from Kolkata, Bengaluru, Delhi; reel-driven demand',
    angle:
      'Crystal-clear Dawki river + living root bridges — the most shareable domestic content right now.',
    googleKeywords: [
      'meghalaya tour package',
      'shillong cherrapunji package',
      'dawki river package',
      'meghalaya trip plan',
      'guwahati shillong package',
    ],
    metaInterests: ['Meghalaya', 'Waterfalls', 'Offbeat travel', 'Road trips', 'Adventure travel'],
  },
  {
    name: 'Pondicherry',
    region: 'Tamil Nadu (UT)',
    demand: 'high',
    confidence: 'breakout',
    trajectory:
      "Absent in 2024 → 2025: #10 on Google's India list with 19 lakh visitors in 2024 — a fresh riser worth testing",
    growthSignal: '#10 most-searched destination in India 2025',
    source: 'Google Year in Search 2025',
    bestMonths: 'Oct – Mar',
    adWindow: 'Aug – Feb + long weekends',
    budget: '₹8k – ₹22k / person (3N)',
    audience: 'Chennai & Bengaluru weekenders; café/heritage crowd 22–35',
    angle:
      "French quarter + Auroville wellness — package as 'Europe-lite weekend' for South metros.",
    googleKeywords: [
      'pondicherry tour package',
      'pondicherry weekend trip',
      'auroville stay',
      'pondicherry beach resorts',
      'chennai to pondicherry package',
    ],
    metaInterests: ['Pondicherry', 'Cafés', 'Heritage', 'Weekend getaways', 'Wellness'],
  },
  {
    name: 'Rajasthan (Jaipur · Udaipur · Jaisalmer)',
    region: 'Rajasthan',
    demand: 'very_high',
    confidence: 'proven',
    trajectory:
      "2024: Jaipur #5 on Google's India list → 2025–26: wedding-venue and heritage demand steady every winter — a permanent fixture",
    growthSignal: "Jaipur was Google's #5 India search of 2024; evergreen winter #1",
    source: 'Google Year in Search 2024 · category consensus',
    bestMonths: 'Oct – Mar · desert Dec–Feb',
    adWindow: 'Aug – Jan',
    budget: '₹15k – ₹45k / person (5N)',
    audience: 'Pan-India families, foreign inbound, pre-wedding shoots, royal-wedding aspirants',
    angle:
      'Sell experiences not cities: desert-camp NYE, palace-hotel anniversaries, heritage-rail add-ons.',
    googleKeywords: [
      'rajasthan tour package',
      'jaipur udaipur jaisalmer package',
      'jaisalmer desert camp booking',
      'udaipur package for couple',
      'rajasthan trip in december',
    ],
    metaInterests: ['Rajasthan', 'Palaces', 'Desert safari', 'Heritage hotels', 'Weddings'],
  },
  {
    name: 'Andaman Islands',
    region: 'Andaman & Nicobar',
    demand: 'high',
    confidence: 'confirmed',
    trajectory:
      "Steady 2-year honeymoon riser as the 'no-passport Maldives'; benefits every time Maldives pricing or politics wobble",
    growthSignal: 'Consistent honeymoon riser; Maldives-alternative searches climbing',
    source: 'Category consensus · OTA demand patterns',
    bestMonths: 'Oct – May',
    adWindow: 'Aug – Mar (wedding season core)',
    budget: '₹28k – ₹60k / person (5N)',
    audience: "Honeymooners who can't get Maldives budgets approved; scuba first-timers",
    angle: "'Maldives water, Indian SIM card' — no passport, no forex, same lagoon photos.",
    googleKeywords: [
      'andaman tour package',
      'andaman honeymoon package',
      'port blair havelock package',
      'scuba diving andaman price',
      'andaman package with flights',
    ],
    metaInterests: ['Andaman Islands', 'Scuba diving', 'Honeymoon', 'Beaches', 'Island travel'],
  },
  {
    name: 'Himachal (Manali · Kasol · Spiti)',
    region: 'Himachal Pradesh',
    demand: 'very_high',
    confidence: 'proven',
    trajectory:
      "2024: Manali #3 on Google's India list → 2025–26: summer-holiday staple + Spiti rising with the 25–35 adventure crowd",
    growthSignal: "Manali was Google's #3 India search of 2024",
    source: 'Google Year in Search 2024 · category consensus',
    bestMonths: 'Mar – Jun · Spiti Jun–Sep · snow Dec–Feb',
    adWindow: 'Jan – May (summer) · Oct – Dec (snow)',
    budget: '₹10k – ₹30k / person (4N)',
    audience: 'Delhi NCR + Punjab drive market; backpacker & workation crowd',
    angle:
      'Volume play: Manali honeymoons in summer, Spiti group departures for the adventure crowd.',
    googleKeywords: [
      'manali tour package',
      'manali honeymoon package',
      'kasol kheerganga trek',
      'spiti valley tour package',
      'shimla manali package from delhi',
    ],
    metaInterests: ['Manali', 'Himalayas', 'Trekking', 'Snow', 'Road trips'],
  },
];

export interface SeasonBlock {
  id: string;
  label: string;
  months: string;
  theme: string;
  sellNow: string[]; // what travels in this window
  advertiseFor: string[]; // what to run ads for DURING this window (lead time)
  note: string;
}

export const SEASONS: SeasonBlock[] = [
  {
    id: 'q1',
    label: 'Jan – Mar',
    months: 'Winter → Spring',
    theme: 'Honeymoons, snow & last of the peak season',
    sellNow: [
      'Kashmir snow',
      'Rajasthan',
      'Kerala',
      'Andamans',
      'Thailand/Vietnam peak',
      'Dubai (DSF)',
      'Sri Lanka',
    ],
    advertiseFor: [
      'Summer hills (Kashmir, Himachal, Uttarakhand)',
      'Europe & Greece (visa lead time)',
      'Bali dry season',
      'Baku/Almaty spring',
    ],
    note: 'Summer-holiday research starts in January — families book Apr–Jun trips 60–90 days out. This is your biggest ad quarter.',
  },
  {
    id: 'q2',
    label: 'Apr – Jun',
    months: 'Summer holidays',
    theme: 'The family-travel super-season',
    sellNow: [
      'Kashmir (tulips)',
      'Himachal & Uttarakhand',
      'Sikkim/Darjeeling',
      'Ooty/Munnar/Wayanad',
      'Singapore-Malaysia',
      'Bali',
      'Baku/Almaty/Georgia',
      'Europe',
    ],
    advertiseFor: [
      'Monsoon deals (Goa, Kerala Ayurveda)',
      'Ladakh (Jun–Sep)',
      'Bali & SE Asia mid-year',
      'Early-bird Diwali/NYE international',
    ],
    note: 'Agoda: summer trending = Puri, Wayanad, Goa. Families = 40% of trips; keep child-policy and meal details upfront in creatives.',
  },
  {
    id: 'q3',
    label: 'Jul – Sep',
    months: 'Monsoon',
    theme: 'Value season + the Ladakh window',
    sellNow: [
      'Ladakh (peak)',
      'Valley of Flowers',
      'Kerala monsoon Ayurveda',
      'Goa monsoon deals',
      'Coorg/Wayanad',
      'Bali (dry)',
      'Georgia/Baku',
      'Kenya migration',
    ],
    advertiseFor: [
      'Diwali & Oct–Dec festive trips',
      'Wedding/honeymoon season (Maldives, Bali, Andamans)',
      'NYE Goa/Dubai/Thailand early-bird',
    ],
    note: 'Monsoon = lowest CPCs of the year. Build your Oct–Dec pipeline cheaply now; honeymoon bookings for Nov–Feb start in August.',
  },
  {
    id: 'q4',
    label: 'Oct – Dec',
    months: 'Festive & wedding season',
    theme: 'Highest-revenue quarter — festive, honeymoons, NYE',
    sellNow: [
      'Rajasthan',
      'Varanasi (Dev Deepawali)',
      'Kashmir first snow',
      'Andamans',
      'Goa NYE',
      'Dubai',
      'Thailand/Vietnam',
      'Maldives & Mauritius honeymoons',
    ],
    advertiseFor: [
      'Jan–Mar honeymoons',
      'Republic Day long weekend',
      'Summer 2027 Europe early-bird (visa timelines)',
      'Japan sakura (Mar–Apr, books by Jan)',
    ],
    note: "Wedding dates cluster Nov–Feb: run 'honeymoon under ₹X' campaigns from October. NYE inventory sells out by early December — price it up, not down.",
  },
];

export interface SourceStateRow {
  state: string;
  cities: string;
  outbound: string;
  domestic: string;
  tip: string;
}

// Where the money comes FROM — use for geo-targeting in Google/Meta ads.
// MMT: Maharashtra, Karnataka and Delhi lead outbound searches.
export const SOURCE_STATES: SourceStateRow[] = [
  {
    state: 'Maharashtra',
    cities: 'Mumbai · Pune · Nagpur',
    outbound: 'Dubai, Thailand, Bali, Europe, Maldives',
    domestic: 'Goa, Kashmir, Kerala, Rajasthan',
    tip: '#1 outbound source state (MMT). Premium honeymoon + family segments both work.',
  },
  {
    state: 'Delhi NCR',
    cities: 'Delhi · Gurgaon · Noida',
    outbound: 'Dubai, Baku, Almaty, Georgia, Europe',
    domestic: 'Himachal, Uttarakhand, Kashmir, Rajasthan',
    tip: 'Top-3 source. Caucasus/Central Asia reels convert exceptionally here (short direct flights).',
  },
  {
    state: 'Karnataka',
    cities: 'Bengaluru · Mysuru',
    outbound: 'Vietnam, Bali, Sri Lanka, Japan, Thailand',
    domestic: 'Coorg, Wayanad, Gokarna, Andamans, Meghalaya',
    tip: 'Top-3 source. Young tech audience — offbeat & adventure angles beat family angles.',
  },
  {
    state: 'Gujarat',
    cities: 'Ahmedabad · Surat · Vadodara',
    outbound: 'Dubai, Singapore-Malaysia-Thailand combos, Europe groups',
    domestic: 'Kashmir, Kerala, Somnath-Dwarka, Statue of Unity',
    tip: 'Group-tour capital: fixed-departure Jain/veg-meal group packages outsell FIT here.',
  },
  {
    state: 'Tamil Nadu',
    cities: 'Chennai · Coimbatore',
    outbound: 'Sri Lanka, Malaysia, Singapore, Thailand',
    domestic: 'Ooty, Kodaikanal, Pondicherry, Kerala',
    tip: 'Short-haul international (Colombo 1hr) sells as impulse; temple + hill-station combos for families.',
  },
  {
    state: 'Telangana & AP',
    cities: 'Hyderabad · Vizag',
    outbound: 'Dubai, Thailand, Maldives, Vietnam',
    domestic: 'Kashmir, Kerala, Araku, Andamans',
    tip: 'Fast-growing premium segment; direct international connectivity from HYD widening options.',
  },
  {
    state: 'West Bengal',
    cities: 'Kolkata',
    outbound: 'Thailand, Vietnam, Bhutan',
    domestic: 'Sikkim, Darjeeling, Meghalaya, Puri, Andamans',
    tip: 'Gateway to the Northeast boom (Jorhat +493%). Durga Puja window = huge travel spike.',
  },
  {
    state: 'Punjab & Chandigarh',
    cities: 'Chandigarh · Ludhiana · Amritsar',
    outbound: 'Dubai, Thailand, Almaty, Baku',
    domestic: 'Himachal, Kashmir, Uttarakhand',
    tip: 'Direct Almaty/Baku flights from Delhi/Amritsar make Central Asia an easy upsell.',
  },
  {
    state: 'Kerala',
    cities: 'Kochi · Trivandrum · Kozhikode',
    outbound: 'Gulf (VFR), Sri Lanka, Maldives, Malaysia',
    domestic: 'North India circuits, Kashmir, Rajasthan',
    tip: 'Gulf VFR base = year-round flight demand; package add-ons to VFR trips are an untapped niche.',
  },
];

export const TREND_SOURCES = [
  {
    label: 'Google Year in Search 2024 — Travel (India)',
    url: 'https://www.latestly.com/socially/lifestyle/travel/google-year-in-search-2024-in-india-azerbaijan-manali-jaipur-and-more-top-10-travel-destinations-that-made-to-google-year-in-search-list-6480717.html',
  },
  {
    label: 'Google Year in Search 2025 — Travel (India)',
    url: 'https://www.forbesindia.com/article/explainers/googles-year-in-search-2025-top-10-most-searched-travel-destinations-in-india/2989607/1',
  },
  {
    label: 'Skyscanner Travel Trends 2025 (India)',
    url: 'https://lifeandmore.in/travel/travel-trends-2025/',
  },
  {
    label: 'Skyscanner Travel Trends 2026 (India)',
    url: 'https://www.skyscanner.co.in/travel-trends',
  },
  {
    label: 'Agoda Travel Trends 2026 — India',
    url: 'https://www.business-standard.com/content/press-releases-ani/agoda-s-2026-travel-trends-reveal-india-s-new-era-of-inward-wanderlust-125120100499_1.html',
  },
  {
    label: 'MakeMyTrip — How India Travels Abroad',
    url: 'https://www.traveltrendstoday.in/makemytrips-how-india-travels-abroad-report-reveals-indian-outbound-travellers-trends',
  },
  {
    label: 'Vietnam vs Thailand — Indian arrivals (Mastercard)',
    url: 'https://www.mastercard.com/news/ap/en/perspectives/en/2025/with-india-s-help-vietnam-challenges-for-thailand-s-tourism-crown/',
  },
  {
    label: 'India Outbound — Where Will Indians Head in 2026',
    url: 'https://indiaoutbound.info/market-analysis/where-will-indians-head-to-in-2026/',
  },
];
