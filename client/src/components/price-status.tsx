import { Badge } from '@/components/ui/badge';

type PriceLike = {
  price_inr?: number | null;
  price_basis?: string | null;
  confidence?: string | null;
  is_verified?: boolean | number | null;
};

function isContractedLiveRate(item: PriceLike) {
  const basis = String(item.price_basis || '').toLowerCase();
  return basis.includes('contracted') || basis.includes('live confirmed');
}

export function formatInr(amount?: number | null) {
  return `INR ${Number(amount || 0).toLocaleString('en-IN')}`;
}

export function priceStatus(item: PriceLike) {
  if (isContractedLiveRate(item)) return 'confirmed';
  return 'rfq';
}

export function AdminPriceCell({ item }: { item: PriceLike }) {
  const status = priceStatus(item);
  if (status === 'confirmed') {
    return (
      <div className="space-y-1">
        <div className="font-mono text-sm font-semibold">{formatInr(item.price_inr)}</div>
        <Badge variant="default" className="bg-green-600 text-[10px] text-white hover:bg-green-700">
          Confirmed live
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Badge variant="secondary" className="text-[10px]">
        RFQ required
      </Badge>
      <div className="text-xs text-muted-foreground">
        Reference only: {formatInr(item.price_inr)}
      </div>
    </div>
  );
}

export function PublicPriceLabel({
  item,
  formatPrice,
  unit,
}: {
  item: PriceLike;
  formatPrice: (price: number) => string;
  unit?: string;
}) {
  if (priceStatus(item) === 'confirmed') {
    return (
      <span>
        {formatPrice(Number(item.price_inr || 0))}
        {unit ? (
          <span className="block text-[10px] font-normal uppercase tracking-wider text-foreground/45">
            {unit}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span>
      Request live quote
      <span className="block text-[10px] font-normal uppercase tracking-wider text-foreground/45">
        Ref {formatPrice(Number(item.price_inr || 0))}
      </span>
    </span>
  );
}
