import { useState, useRef, useCallback, useEffect } from 'react';
import { UserAgent, Inviter, Registerer, RegistererState, SessionState, Session } from 'sip.js';

type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected';

export function useSip(
  sipDomain: string,
  sipUsername: string,
  sipPassword?: string,
  transportServer?: string,
) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callerName, setCallerName] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const userAgentRef = useRef<UserAgent | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const remoteAudioEl = useRef<HTMLAudioElement | null>(null);

  const getOrCreateAudioElement = useCallback(() => {
    if (!remoteAudioEl.current) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.style.display = 'none';
      document.body.appendChild(el);
      remoteAudioEl.current = el;
    }
    return remoteAudioEl.current;
  }, []);

  useEffect(() => {
    if (!sipDomain || !sipUsername) return;

    // Initialize sip.js UserAgent
    const uri = UserAgent.makeURI(`sip:${sipUsername}@${sipDomain}`);
    if (!uri) return;

    const webSocketServer =
      transportServer ||
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/asterisk-ws`;
    let disposed = false;
    let shutdownPromise: Promise<void> | null = null;

    const userAgent = new UserAgent({
      uri,
      transportOptions: {
        server: webSocketServer,
      },
      authorizationPassword: sipPassword,
      authorizationUsername: sipUsername,
    });
    const registerer = new Registerer(userAgent);

    userAgent.delegate = {
      onInvite: (invitation) => {
        if (disposed) return;
        setCallStatus('ringing');
        setCallerName(invitation.remoteIdentity.uri.user || 'Unknown');
        sessionRef.current = invitation;

        invitation.stateChange.addListener((state) => {
          if (state === SessionState.Established) {
            setCallStatus('connected');
            setupRemoteMedia(invitation);
          } else if (state === SessionState.Terminated) {
            cleanup();
          }
        });
      },
    };

    userAgentRef.current = userAgent;

    const shutdown = () => {
      if (shutdownPromise) return shutdownPromise;
      shutdownPromise = (async () => {
        if (registerer.state === RegistererState.Registered) {
          await registerer.unregister().catch(() => undefined);
        }
        await userAgent.stop();
      })();
      return shutdownPromise;
    };

    const startup = (async () => {
      await userAgent.start();
      if (disposed) {
        await shutdown();
        return;
      }
      await registerer.register();
    })();

    void startup.catch((error) => {
      if (!disposed) console.error('Failed to connect SIP WebSocket', error);
    });

    return () => {
      disposed = true;
      userAgent.delegate = {};
      if (userAgentRef.current === userAgent) userAgentRef.current = null;
      void startup.finally(shutdown).catch(() => undefined);
    };
  }, [sipDomain, sipUsername, sipPassword, transportServer]);

  const setupRemoteMedia = (session: Session) => {
    const pc = (session.sessionDescriptionHandler as any)?.peerConnection;
    if (pc) {
      const stream = new MediaStream();
      pc.getReceivers().forEach((receiver: any) => {
        if (receiver.track) stream.addTrack(receiver.track);
      });
      setRemoteStream(stream);
      const audioEl = getOrCreateAudioElement();
      audioEl.srcObject = stream;
      audioEl.play().catch(console.error);
    }
  };

  const cleanup = useCallback(() => {
    setCallStatus('idle');
    setCallerName(null);
    setRemoteStream(null);
    sessionRef.current = null;
    setIsMuted(false);
    if (remoteAudioEl.current) {
      remoteAudioEl.current.srcObject = null;
    }
  }, []);

  const startCall = useCallback(
    async (targetNumber: string) => {
      if (!userAgentRef.current) return;

      const targetUri = UserAgent.makeURI(`sip:${targetNumber}@${sipDomain}`);
      if (!targetUri) return;

      const inviter = new Inviter(userAgentRef.current, targetUri);
      sessionRef.current = inviter;
      setCallStatus('calling');

      inviter.stateChange.addListener((state) => {
        if (state === SessionState.Established) {
          setCallStatus('connected');
          setupRemoteMedia(inviter);
        } else if (state === SessionState.Terminated) {
          cleanup();
        }
      });

      try {
        await inviter.invite();
      } catch (e) {
        console.error('Failed to start SIP call', e);
        cleanup();
      }
    },
    [sipDomain, cleanup],
  );

  const answerCall = useCallback(async () => {
    if (sessionRef.current && sessionRef.current instanceof Inviter === false) {
      try {
        await (sessionRef.current as any).accept();
      } catch (e) {
        console.error('Failed to answer SIP call', e);
        cleanup();
      }
    }
  }, [cleanup]);

  const endCall = useCallback(() => {
    if (sessionRef.current) {
      if (sessionRef.current.state === SessionState.Established) {
        sessionRef.current.bye();
      } else if (
        sessionRef.current.state === SessionState.Initial ||
        sessionRef.current.state === SessionState.Establishing
      ) {
        if (sessionRef.current instanceof Inviter) {
          sessionRef.current.cancel();
        } else {
          (sessionRef.current as any).reject();
        }
      }
    }
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    if (sessionRef.current && sessionRef.current.sessionDescriptionHandler) {
      const pc = (sessionRef.current.sessionDescriptionHandler as any).peerConnection;
      if (pc) {
        pc.getSenders().forEach((sender: any) => {
          if (sender.track && sender.track.kind === 'audio') {
            sender.track.enabled = !sender.track.enabled;
            setIsMuted(!sender.track.enabled);
          }
        });
      }
    }
  }, []);

  return {
    callStatus,
    callerName,
    remoteStream,
    isMuted,
    startCall,
    answerCall,
    endCall,
    rejectCall: endCall,
    toggleMute,
  };
}
