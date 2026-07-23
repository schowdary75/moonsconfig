import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { adminToggleVerification } from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';

interface VerificationChipProps {
  id: number;
  tableName:
    | 'packages'
    | 'vendors'
    | 'accommodation_listings'
    | 'car_listings'
    | 'experience_listings'
    | 'cruise_listings';
  initialVerified: boolean;
  onVerifyStatusChange?: (verified: boolean) => void;
}

export function VerificationChip({
  id,
  tableName,
  initialVerified,
  onVerifyStatusChange,
}: VerificationChipProps) {
  const [isVerified, setIsVerified] = useState(initialVerified);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  const handleToggle = async () => {
    if (isLoading || !auth) return;
    setIsLoading(true);
    try {
      const newStatus = !isVerified;
      await adminToggleVerification({
        data: {
          auth,
          tableName,
          id,
          is_verified: newStatus,
        },
      });
      setIsVerified(newStatus);
      if (onVerifyStatusChange) {
        onVerifyStatusChange(newStatus);
      }
    } catch (e) {
      console.error('Failed to toggle verification:', e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Badge
      variant={isVerified ? 'default' : 'secondary'}
      className={`cursor-pointer transition-colors ${isVerified ? 'bg-green-600 hover:bg-green-700 text-white' : 'hover:bg-slate-200'}`}
      onClick={(e) => {
        e.stopPropagation();
        handleToggle();
      }}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
      ) : isVerified ? (
        <ShieldCheck className="w-3.5 h-3.5 mr-1" />
      ) : (
        <ShieldAlert className="w-3.5 h-3.5 mr-1 text-slate-400" />
      )}
      {isVerified ? 'Verified' : 'Unverified'}
    </Badge>
  );
}
