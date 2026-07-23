import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { App } from './App';
import { AuthProvider } from './components/auth-context';
import { googleClientId, isGoogleAuthConfigured } from './config/googleAuth';
import './styles.css';
import { createQueryClient } from './store/queryClient';

const queryClient = createQueryClient();
const LazyGlobalChatWidget = lazy(() =>
  import('./components/global-chat-widget').then(({ GlobalChatWidget }) => ({
    default: GlobalChatWidget,
  })),
);

function DeferredGlobalChatWidget() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 1_500 });
      return () => window.cancelIdleCallback(id);
    }

    const id = setTimeout(() => setReady(true), 750);
    return () => clearTimeout(id);
  }, []);

  return ready ? (
    <Suspense fallback={null}>
      <LazyGlobalChatWidget />
    </Suspense>
  ) : null;
}

const application = (
  <AuthProvider>
    <App />
    <DeferredGlobalChatWidget />
    <Toaster position="bottom-center" />
  </AuthProvider>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isGoogleAuthConfigured ? (
        <GoogleOAuthProvider clientId={googleClientId}>{application}</GoogleOAuthProvider>
      ) : (
        application
      )}
    </QueryClientProvider>
  </StrictMode>,
);
