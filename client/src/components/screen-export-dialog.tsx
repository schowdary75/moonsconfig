import { type FormEvent, useEffect, useState } from 'react';
import { Download, Loader2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  downloadScreenExport,
  requestScreenExport,
  screenExportErrorMessage,
} from '@/services/screenExportService';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';

export function ScreenExportDialog({
  open,
  pathname,
  screenName,
  onOpenChange,
}: {
  open: boolean;
  pathname: string;
  screenName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!open) {
      setAccessCode('');
      setError('');
      setIsExporting(false);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(accessCode)) {
      setError('Enter the 6-digit export access code.');
      return;
    }

    setIsExporting(true);
    try {
      const result = await requestScreenExport({ pathname, accessCode }, user?.session_token);
      downloadScreenExport(result.blob, result.filename);
      toast.success(`${screenName} source exported`);
      onOpenChange(false);
    } catch (requestError) {
      setError(await screenExportErrorMessage(requestError));
    } finally {
      setAccessCode('');
      setIsExporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isExporting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <DialogTitle>Export {screenName}</DialogTitle>
          <DialogDescription>
            Download this screen's frontend, backend, assets, and database source as a ZIP capsule.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="screen-export-access-code">Export access code</Label>
            <Input
              id="screen-export-access-code"
              autoFocus
              autoComplete="off"
              inputMode="numeric"
              type="password"
              maxLength={6}
              placeholder="Enter 6-digit code"
              value={accessCode}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'screen-export-access-error' : undefined}
              disabled={isExporting}
              onChange={(event) => {
                setAccessCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                if (error) setError('');
              }}
            />
            {error && (
              <p id="screen-export-access-error" role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isExporting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isExporting || accessCode.length !== 6}>
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isExporting ? 'Preparing ZIP...' : 'Export Screen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
