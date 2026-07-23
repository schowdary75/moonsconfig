import { useState, useRef, useCallback } from 'react';

type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected';

const getMediaDevices = (): MediaDevices | undefined =>
  typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;

export function useWebRTC(onSendSignal: (type: string, payload: any) => void) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callerName, setCallerName] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<any>(null);
  const incomingCandidates = useRef<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isIceConnected, setIsIceConnected] = useState(false);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const localScreenStream = useRef<MediaStream | null>(null);
  const localVideoStream = useRef<MediaStream | null>(null);

  // Persistent audio element for speaker output — lives outside React
  const remoteAudioEl = useRef<HTMLAudioElement | null>(null);

  // Expose local video stream for PiP preview
  const [localVideoMediaStream, setLocalVideoMediaStream] = useState<MediaStream | null>(null);

  // Ensure the audio element exists (create once, reuse forever)
  const getOrCreateAudioElement = useCallback(() => {
    if (!remoteAudioEl.current) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.volume = 1.0;
      // Attach to DOM so it actually plays through speakers
      el.style.display = 'none';
      document.body.appendChild(el);
      remoteAudioEl.current = el;
    }
    return remoteAudioEl.current;
  }, []);

  const unlockAudioElement = useCallback(() => {
    const el = getOrCreateAudioElement();
    // Tiny silent WAV to force Chrome to unlock the audio element during user gesture
    if (!el.srcObject && !el.src) {
      el.src =
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      el.play().catch(() => {});
    }
  }, [getOrCreateAudioElement]);

  // Force audio to play through speaker immediately
  const playRemoteAudio = useCallback(
    (stream: MediaStream) => {
      const audioEl = getOrCreateAudioElement();
      audioEl.srcObject = stream;
      audioEl.muted = false;
      audioEl.volume = 1.0;
      // Force play — this is called right after user gesture (accept/call click)
      const playPromise = audioEl.play();
      if (playPromise) {
        playPromise.catch((e) => {
          console.warn('Audio autoplay blocked, retrying...', e);
          // Retry after a tiny delay
          setTimeout(() => {
            audioEl.play().catch((e2) => console.error('Audio play retry failed', e2));
          }, 100);
        });
      }
    },
    [getOrCreateAudioElement],
  );

  const cleanup = useCallback(() => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }
    if (localScreenStream.current) {
      localScreenStream.current.getTracks().forEach((track) => track.stop());
      localScreenStream.current = null;
    }
    if (localVideoStream.current) {
      localVideoStream.current.getTracks().forEach((track) => track.stop());
      localVideoStream.current = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    // Stop audio playback but keep the element alive for next call
    if (remoteAudioEl.current) {
      remoteAudioEl.current.srcObject = null;
      remoteAudioEl.current.src = '';
    }
    setRemoteStream(null);
    setCallStatus('idle');
    setCallerName(null);
    setIncomingOffer(null);
    incomingCandidates.current = [];
    setIsMuted(false);
    setIsScreenSharing(false);
    setIsVideoEnabled(false);
    setIsIceConnected(false);
    setLocalVideoMediaStream(null);

    // Remove devicechange listener
    if (deviceChangeListener.current) {
      getMediaDevices()?.removeEventListener?.('devicechange', deviceChangeListener.current);
      deviceChangeListener.current = null;
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onSendSignal('ICE', event.candidate);
      }
    };

    // CRITICAL: Pipe remote audio directly to speaker element when tracks arrive
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        setRemoteStream(stream);
        // Immediately pipe audio to speaker — don't wait for React
        playRemoteAudio(stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed'
      ) {
        cleanup();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setIsIceConnected(true);
      } else if (pc.iceConnectionState === 'failed') {
        console.error('ICE Connection Failed');
        onSendSignal('END', null);
        cleanup();
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
        setIsIceConnected(false);
      }
    };

    return pc;
  }, [onSendSignal, cleanup, playRemoteAudio]);

  // Get microphone — uses built-in mic if no headset is plugged in (browser default)
  const getMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const mediaDevices = getMediaDevices();
      if (!mediaDevices?.getUserMedia) {
        console.warn('Microphone access is unavailable.');
        return null;
      }

      const stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
        },
      });
      console.log(
        'Microphone acquired:',
        stream
          .getAudioTracks()
          .map((t) => t.label)
          .join(', '),
      );
      return stream;
    } catch (e: any) {
      console.warn('Microphone not available:', e.message);
      return null;
    }
  }, []);

  const deviceChangeListener = useRef<(() => void) | null>(null);

  const setupDeviceChangeListener = useCallback(() => {
    if (deviceChangeListener.current) return;

    const mediaDevices = getMediaDevices();
    if (!mediaDevices?.addEventListener) return;

    const listener = async () => {
      console.log('Audio devices changed (e.g. earphones plugged in/out). Re-acquiring mic...');
      if (!peerConnection.current) return;

      const newStream = await getMicrophone();
      if (!newStream || !peerConnection.current) return;

      const newAudioTrack = newStream.getAudioTracks()[0];
      if (!newAudioTrack) return;

      // Stop old mic track
      if (localStream.current) {
        localStream.current.getAudioTracks().forEach((t) => t.stop());
      }

      // Keep video track if it exists
      if (localStream.current) {
        const videoTracks = localStream.current.getVideoTracks();
        videoTracks.forEach((t) => newStream.addTrack(t));
      }

      localStream.current = newStream;

      // Apply mute state to new track
      newAudioTrack.enabled = !isMuted;

      // Replace track in active WebRTC connection without dropping call
      const sender = peerConnection.current.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender) {
        sender
          .replaceTrack(newAudioTrack)
          .catch((e) => console.error('Failed to replace audio track:', e));
      }
    };

    mediaDevices.addEventListener('devicechange', listener);
    deviceChangeListener.current = listener;
  }, [getMicrophone, isMuted]);

  const startCall = useCallback(async () => {
    try {
      // Pre-create and unlock audio element during user gesture
      unlockAudioElement();

      const pc = createPeerConnection();
      peerConnection.current = pc;

      // Get microphone (built-in or plugged-in — browser picks the default)
      const micStream = await getMicrophone();
      if (micStream) {
        localStream.current = micStream;
        micStream.getTracks().forEach((track) => pc.addTrack(track, micStream));
      }

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);

      setupDeviceChangeListener();
      onSendSignal('OFFER', offer);
      setCallStatus('calling');
    } catch (e) {
      console.error('Failed to start call', e);
      cleanup();
    }
  }, [
    createPeerConnection,
    getMicrophone,
    unlockAudioElement,
    setupDeviceChangeListener,
    onSendSignal,
    cleanup,
  ]);

  // Maya runs in-process rather than as a remote WebRTC peer. This keeps the
  // same call UI and microphone controls while voice turns go through her agent.
  const startLocalCall = useCallback(async () => {
    try {
      unlockAudioElement();
      setCallStatus('calling');
      const micStream = await getMicrophone();
      if (!micStream) {
        cleanup();
        return false;
      }
      localStream.current = micStream;
      setIsIceConnected(true);
      setCallStatus('connected');
      return true;
    } catch (e) {
      console.error('Failed to start local call', e);
      cleanup();
      return false;
    }
  }, [cleanup, getMicrophone, unlockAudioElement]);

  const endLocalCall = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const answerCall = useCallback(async () => {
    if (!peerConnection.current || !incomingOffer) return;
    try {
      // Pre-warm audio element during user gesture (Accept click)
      unlockAudioElement();

      // Get microphone (built-in or plugged-in — browser picks the default)
      const micStream = await getMicrophone();
      if (micStream) {
        localStream.current = micStream;
        micStream
          .getTracks()
          .forEach((track) => peerConnection.current?.addTrack(track, micStream));
      }

      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      // Add queued ICE candidates
      for (const candidate of incomingCandidates.current) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
      incomingCandidates.current = [];

      setupDeviceChangeListener();
      onSendSignal('ANSWER', answer);
      setCallStatus('connected');
    } catch (e) {
      console.error('Failed to answer call', e);
      cleanup();
    }
  }, [
    incomingOffer,
    getMicrophone,
    unlockAudioElement,
    setupDeviceChangeListener,
    onSendSignal,
    cleanup,
  ]);

  const handleSignal = useCallback(
    async (type: string, payload: any, fromName: string) => {
      if (type === 'RING' || type === 'OFFER') {
        if (type === 'OFFER' && callStatus === 'connected') {
          // Mid-call renegotiation (video/screen share toggle)
          if (!peerConnection.current) return;
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(payload));
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
          onSendSignal('ANSWER', answer);
          return;
        }

        if (callStatus !== 'idle' && callStatus !== 'ringing') {
          onSendSignal('BUSY', null);
          return;
        }
        if (type === 'OFFER') {
          setIncomingOffer(payload);
        }
        if (callStatus === 'idle') {
          setCallerName(fromName);
          setCallStatus('ringing');
          const pc = createPeerConnection();
          peerConnection.current = pc;
        }
      } else if (type === 'ANSWER') {
        if (!peerConnection.current) return;
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(payload));
        setCallStatus('connected');

        // Process any queued candidates for the caller
        for (const candidate of incomingCandidates.current) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
        incomingCandidates.current = [];

        // Force audio to play for the caller side too
        if (remoteAudioEl.current && remoteAudioEl.current.srcObject) {
          remoteAudioEl.current.play().catch(() => {});
        }
      } else if (type === 'ICE') {
        // Only queue if PC doesn't exist or remote description isn't set yet
        // Do NOT use callStatus here — React stale closures cause candidates to be queued forever
        if (!peerConnection.current || !peerConnection.current.remoteDescription) {
          incomingCandidates.current.push(payload);
          return;
        }
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(payload));
        } catch (e) {
          console.error('Error adding ice candidate', e);
        }
      } else if (type === 'END' || type === 'BUSY' || type === 'REJECT') {
        cleanup();
      }
    },
    [callStatus, createPeerConnection, onSendSignal, cleanup],
  );

  const endCall = useCallback(
    (duration?: number) => {
      onSendSignal('END', duration !== undefined ? duration : null);
      cleanup();
    },
    [onSendSignal, cleanup],
  );

  const rejectCall = useCallback(() => {
    onSendSignal('REJECT', null);
    cleanup();
  }, [onSendSignal, cleanup]);

  const toggleMute = useCallback(() => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!localStream.current.getAudioTracks()[0]?.enabled);
    }
  }, []);

  // Toggle video on/off mid-call (Teams-style)
  const toggleVideo = useCallback(async () => {
    if (!peerConnection.current) return;

    if (isVideoEnabled && localVideoStream.current) {
      // Turn video OFF
      localVideoStream.current.getTracks().forEach((track) => {
        track.stop();
        const sender = peerConnection.current?.getSenders().find((s) => s.track === track);
        if (sender) peerConnection.current?.removeTrack(sender);
      });
      localVideoStream.current = null;
      setLocalVideoMediaStream(null);
      setIsVideoEnabled(false);

      // Renegotiate
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      onSendSignal('OFFER', offer);
    } else {
      // Turn video ON
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        localVideoStream.current = stream;
        setLocalVideoMediaStream(stream);

        stream.getVideoTracks().forEach((track) => {
          peerConnection.current?.addTrack(track, stream);
        });
        setIsVideoEnabled(true);

        // Renegotiate
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        onSendSignal('OFFER', offer);
      } catch (e) {
        console.error('Camera access failed', e);
      }
    }
  }, [isVideoEnabled, onSendSignal]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (!peerConnection.current) return;

    if (isScreenSharing && localScreenStream.current) {
      localScreenStream.current.getTracks().forEach((track) => {
        track.stop();
        const sender = peerConnection.current?.getSenders().find((s) => s.track === track);
        if (sender) peerConnection.current?.removeTrack(sender);
      });
      localScreenStream.current = null;
      setIsScreenSharing(false);

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      onSendSignal('OFFER', offer);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        localScreenStream.current = stream;

        stream.getTracks().forEach((track) => {
          peerConnection.current?.addTrack(track, stream);
          track.onended = () => {
            const sender = peerConnection.current?.getSenders().find((s) => s.track === track);
            if (sender) peerConnection.current?.removeTrack(sender);
            localScreenStream.current = null;
            setIsScreenSharing(false);
            peerConnection.current?.createOffer().then((offer) => {
              peerConnection.current?.setLocalDescription(offer);
              onSendSignal('OFFER', offer);
            });
          };
        });
        setIsScreenSharing(true);

        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        onSendSignal('OFFER', offer);
      } catch (e) {
        console.error('Screen sharing failed', e);
      }
    }
  }, [isScreenSharing, onSendSignal]);

  return {
    callStatus,
    callerName,
    remoteStream,
    isMuted,
    isScreenSharing,
    isVideoEnabled,
    isIceConnected,
    localVideoMediaStream,
    startCall,
    startLocalCall,
    answerCall,
    endCall,
    endLocalCall,
    rejectCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    handleSignal,
    peerConnection,
  };
}
