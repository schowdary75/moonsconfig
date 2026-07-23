import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { platformService } from '@/services/platformService';

export function VerifyEmail() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Verifying your email…');
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return setMessage('This verification link is incomplete.');
    void platformService
      .verifyEmail(token)
      .then(({ provisioningJobId }) =>
        navigate(`/provisioning/${provisioningJobId}`, { replace: true }),
      )
      .catch(() => setMessage('This verification link is invalid or expired.'));
  }, [navigate]);
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30">
      <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">MooNsConfig</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}

export default VerifyEmail;
