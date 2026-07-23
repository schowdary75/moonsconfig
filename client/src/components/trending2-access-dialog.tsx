import { type FormEvent, useState } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';
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
import { useAuth } from '@/components/auth-context';
import { verifyProtectedScreenAccess } from '@/lib/api/db.functions';
import { toast } from '@/lib/toast';

/**
 * Access gate for the Trending-2 tab on catalogue screens. Verifies the same
 * server-side 6-digit code as the Trending-2 research workspace
 * (screenKey 'trending-2'), so one code protects every surface.
 */
export function Trending2AccessDialog({
  onGranted,
  onCancel,
}: {
  onGranted: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [accessCode, setAccessCode] = useState('');
  const [accessError, setAccessError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccessError('');

    if (!user?.email || !user.session_token) {
      setAccessError('Your session could not be verified. Please sign in again.');
      return;
    }
    if (!/^\d{6}$/.test(accessCode)) {
      setAccessError('Enter the 6-digit access code.');
      return;
    }

    setIsVerifying(true);
    try {
      const result = await verifyProtectedScreenAccess<{ granted: boolean }>({
        data: {
          auth: { email: user.email, sessionToken: user.session_token },
          screenKey: 'trending-2',
          accessCode,
        },
      });
      if (!result.granted) {
        setAccessCode('');
        setAccessError('Incorrect access code. Please try again.');
        return;
      }

      setAccessCode('');
      toast.success('Trending-2 access granted');
      onGranted();
    } catch (error) {
      console.error(error);
      setAccessError('Access could not be verified. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <DialogTitle>Enter Trending-2 access code</DialogTitle>
          <DialogDescription>
            This strategy view is restricted. Your code is securely verified by the server.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="trending-2-tab-access-code">Access code</Label>
            <Input
              id="trending-2-tab-access-code"
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              type="password"
              maxLength={6}
              placeholder="Enter 6-digit code"
              value={accessCode}
              aria-invalid={Boolean(accessError)}
              aria-describedby={accessError ? 'trending-2-tab-access-error' : undefined}
              onChange={(event) => {
                setAccessCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                if (accessError) setAccessError('');
              }}
            />
            {accessError && (
              <p id="trending-2-tab-access-error" role="alert" className="text-xs text-destructive">
                {accessError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isVerifying || accessCode.length !== 6}>
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isVerifying ? 'Verifying...' : 'Open Trending-2'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
