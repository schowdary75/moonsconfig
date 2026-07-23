import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type RegionTab = 'international' | 'india' | 'trending' | 'trending-2';

const indiaCoverageTerms = [
  'india',
  'andaman',
  'andhra',
  'arunachal',
  'assam',
  'bengal',
  'bihar',
  'chandigarh',
  'chennai',
  'delhi',
  'goa',
  'gujarat',
  'himachal',
  'hyderabad',
  'jaipur',
  'jammu',
  'karnataka',
  'kerala',
  'kolkata',
  'ladakh',
  'madhya',
  'maharashtra',
  'mumbai',
  'mysore',
  'odisha',
  'punjab',
  'rajasthan',
  'sikkim',
  'tamil',
  'telangana',
  'uttar',
  'uttarakhand',
  'varanasi',
];

export function RegionTabs({
  value,
  onValueChange,
}: {
  value: RegionTab;
  onValueChange: (value: RegionTab) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as RegionTab)}>
      <TabsList>
        <TabsTrigger value="international">International</TabsTrigger>
        <TabsTrigger value="india">India</TabsTrigger>
        <TabsTrigger
          value="trending"
          className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-600 dark:data-[state=active]:text-orange-400"
        >
          🔥 Trending
        </TabsTrigger>
        <TabsTrigger
          value="trending-2"
          className="data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-600 dark:data-[state=active]:text-violet-400"
        >
          🎯 Trending-2
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function isIndiaCountry(country?: string | null) {
  return (country || '').trim().toLowerCase() === 'india';
}

export function matchesRegion(country: string | null | undefined, region: RegionTab) {
  if (region === 'trending' || region === 'trending-2') return true; // Handled by separate logic
  return region === 'india' ? isIndiaCountry(country) : !isIndiaCountry(country);
}

export function coverageMatchesRegion(coverage: string | null | undefined, region: RegionTab) {
  if (region === 'trending' || region === 'trending-2') return true; // Handled by separate logic
  const normalized = (coverage || '').toLowerCase();
  const hasIndiaCoverage = indiaCoverageTerms.some((term) => normalized.includes(term));
  return region === 'india' ? hasIndiaCoverage : !hasIndiaCoverage;
}
