import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GoogleVerifyButtonProps {
  queryParts: Array<string | number | null | undefined>;
  url?: string | null;
}

export function GoogleVerifyButton({ queryParts, url }: GoogleVerifyButtonProps) {
  const fallbackQuery = queryParts.filter(Boolean).join(' ');
  const href = url || `https://www.google.com/search?q=${encodeURIComponent(fallbackQuery)}`;

  return (
    <Button variant="ghost" size="sm" title="Search Google to verify" asChild>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </Button>
  );
}
