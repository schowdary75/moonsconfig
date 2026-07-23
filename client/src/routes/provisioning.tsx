import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { platformService } from '@/services/platformService';

export function Provisioning() {
  const { jobId = '' } = useParams();
  const [status, setStatus] = useState('pending');
  const [company, setCompany] = useState<{ name: string; slug: string }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const result = await platformService.provisioning(jobId);
        if (!active) return;
        setStatus(result.status);
        setCompany(result.company);
        setError(result.error);
        if (result.status === 'completed')
          localStorage.setItem('moonsconfig_workspace', result.company.slug);
      } catch {
        if (active) setError('Unable to read provisioning status');
      }
    };
    void check();
    const interval = setInterval(() => void check(), 3_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [jobId]);
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">{company?.name || 'Preparing your company'}</h1>
        {status === 'completed' ? (
          <>
            <p className="mt-3 text-muted-foreground">
              Your private database and seven-day Enterprise trial are ready.
            </p>
            <Button asChild className="mt-6">
              <Link to={`/login?workspace=${company?.slug}`}>Open workspace</Link>
            </Button>
          </>
        ) : status === 'failed' ? (
          <>
            <p className="mt-3 text-destructive">Setup could not be completed.</p>
            <p className="mt-2 text-xs text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <div className="mx-auto mt-6 h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <p className="mt-4 text-muted-foreground">
              Creating isolated database, applying schema and securing storage…
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default Provisioning;
