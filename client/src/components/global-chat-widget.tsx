// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Clock,
  MessageSquare,
  Send,
  User,
  X,
  Star,
  CheckCircle2,
  Minus,
  Paperclip,
  Loader2,
  Reply,
  Share2,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  PhoneCall,
  Users,
  Plus,
  MonitorUp,
  MonitorX,
  Zap,
  File as FileIcon,
  Check,
  Video,
  VideoOff,
  Bot,
  Sparkles,
  Smile,
  ImageIcon,
  Pin,
} from 'lucide-react';
import { useAuth } from './auth-context';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useWebRTC } from '@/hooks/use-webrtc';
import { toast } from '@/lib/toast';
import { Textarea } from './ui/textarea';
import {
  closeSupportChat,
  getAllSupportChats,
  getAdminSupportChatMessages,
  adminSendSupportMessage,
  adminTakeOverSupportChat,
  adminMayaVoiceTurn,
  getGlobalChatHistory,
  getGlobalChatRoster,
  heartbeatPresence,
  sendGlobalChatMessage,
  getGlobalChatUpdates,
  uploadChatAttachment,
  createGlobalChatGroup,
  getGlobalChatSignals,
  getChatSmartReplies,
  handoverChatToAI,
  toggleGlobalChatReaction,
  markGlobalChatAsRead,
  markGlobalChatsAsDelivered,
  getGuestSupportChat,
  sendGuestSupportMessage,
  rateSupportChat,
  setGlobalChatTypingStatus,
  toggleMessagePin,
  toggleConversationPin,
  type CustomerChatRequestRow,
} from '@/lib/api/db.functions';
import { type FileInfo, useWebRTCFileTransfer } from '../hooks/use-webrtc-file-transfer';
import { getSocket } from '../socket/socketClient';

type ChatTab = 'team' | 'customers';
type TeamPartner = { id: string; type: string; name: string };
type TransferStatus =
  'idle' | 'offering' | 'receiving_offer' | 'connecting' | 'transferring' | 'completed' | 'failed';

const STAFF_ROLES = ['admin', 'sales', 'support'];
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏'];
const COMPOSER_EMOJIS = ['😊', '👍', '🙏', '👏', '😂', '❤️', '🎉', '🔥', '✅', '⭐', '📎', '✈️'];
const CURATED_GIFS = [
  { label: 'Thanks', url: 'https://media.giphy.com/media/3oEdva9BUHPIs2SkGk/giphy.gif' },
  { label: 'On it', url: 'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif' },
  { label: 'Great', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
  { label: 'Done', url: 'https://media.giphy.com/media/26u4lOMA8JKSnL9Uk/giphy.gif' },
];

function makeGuestId(name: string) {
  return `guest-${
    name
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase() || 'visitor'
  }`;
}

function formatRemaining(expiresAt?: string | null) {
  if (!expiresAt) return '15:00';
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function statusLabel(request: CustomerChatRequestRow) {
  if (request.status === 'pending') return `Waiting ${formatRemaining(request.expires_at)}`;
  if (request.status === 'active')
    return request.assigned_employee_name ? `${request.assigned_employee_name} joined` : 'Active';
  if (request.status === 'missed') return 'Delayed reply';
  return request.status;
}

function formatSystemMessage(msg: string): string | null {
  if (!msg.startsWith('__WEBRTC__')) return null;
  const parts = msg.split(':');
  const type = parts[1];
  const payload = parts.slice(2).join(':');

  if (type === 'OFFER' || type === 'RING') return '📞 Call started';
  if (type === 'END') {
    if (payload && payload !== 'null') {
      const seconds = parseInt(payload, 10);
      if (!isNaN(seconds) && seconds > 0) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        const durStr = m > 0 ? `${m}m ${s}s` : `${s}s`;
        return `📞 Call ended (${durStr})`;
      }
    }
    return '📞 Call ended';
  }
  if (type === 'REJECT' || type === 'BUSY') return '📞 Call ended';
  if (type === 'FILE_OFFER') return '📎 Sent a file';
  if (type === 'FILE_ACCEPT' || type === 'FILE_REJECT' || type === 'FILE_CANCEL')
    return '📎 File transfer';
  return null; // Hide ICE, ANSWER, etc.
}

function formatLastMessage(msg: string | null | undefined): string {
  if (!msg) return '';
  if (msg.startsWith('__WEBRTC__')) {
    return formatSystemMessage(msg) || '📞 Voice Call';
  }
  return msg;
}

function formatChatTime(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function GlobalChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [chatTab, setChatTab] = useState<ChatTab>('team');
  const [activePartner, setActivePartner] = useState<TeamPartner | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('moon_customer_chat_request_id');
    return saved ? Number(saved) : null;
  });
  const [message, setMessage] = useState('');
  const [tick, setTick] = useState(0);

  const [guestName, setGuestName] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('moon_guest_name') || '';
    return '';
  });
  const [guestMobile, setGuestMobile] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('moon_guest_mobile') || '';
    return '';
  });
  // Stable anonymous identity for the guest support chat, persisted across visits.
  const [guestToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    let token = localStorage.getItem('moon_guest_token');
    if (!token) {
      token = `guest_${(crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '')}${Date.now()}`;
      localStorage.setItem('moon_guest_token', token);
    }
    return token;
  });
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [chatToClose, setChatToClose] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [forwardMessage, setForwardMessage] = useState<string | null>(null);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  // Calls open inside the chat panel by default; users can expand them when needed.
  const [isCallMinimized, setIsCallMinimized] = useState(true);
  const [aiHandingOver, setAiHandingOver] = useState(false);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSignalRef = useRef(0);
  const lastActivityTimeRef = useRef(Date.now());

  useEffect(() => {
    const handleActivity = () => {
      lastActivityTimeRef.current = Date.now();
    };
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, []);

  const {
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
  } = useWebRTC((type, payload) => {
    if (!activePartner || !entityId || !entityType) return;
    sendGlobalChatMessage({
      data: {
        senderId: entityId,
        senderType: entityType,
        receiverId: activePartner.id,
        receiverType: activePartner.type,
        messageText: `__WEBRTC__:${type}:${payload ? JSON.stringify(payload) : 'null'}`,
      },
    });
  });

  const {
    transferStatus,
    fileInfo,
    progress,
    remoteName,
    sendFileOffer,
    acceptFileOffer,
    rejectFileOffer,
    cancelTransfer,
    handleSignal: handleFileSignal,
  } = useWebRTCFileTransfer((type, payload) => {
    if (!activePartner || !entityId || !entityType) return;
    sendGlobalChatMessage({
      data: {
        senderId: entityId,
        senderType: entityType,
        receiverId: activePartner.id,
        receiverType: activePartner.type,
        messageText: `__WEBRTC__:${type}:${payload ? JSON.stringify(payload) : 'null'}`,
      },
    });
  });

  const lastProcessedSignalIdRef = useRef<number>(0);
  const localVideoPreviewRef = useRef<HTMLVideoElement>(null);
  const mayaRecognitionRef = useRef<any>(null);
  const mayaCallActiveRef = useRef(false);
  const mayaVoiceBusyRef = useRef(false);
  const resumeMayaListeningRef = useRef<() => void>(() => undefined);

  // Pipe local camera to PiP preview
  useEffect(() => {
    if (localVideoPreviewRef.current && localVideoMediaStream) {
      localVideoPreviewRef.current.srcObject = localVideoMediaStream;
    } else if (localVideoPreviewRef.current) {
      localVideoPreviewRef.current.srcObject = null;
    }
  }, [localVideoMediaStream]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stopRingtone = React.useCallback(() => {
    if (ringTimerRef.current) clearInterval(ringTimerRef.current);
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        /* context may already be closed */
      }
      audioCtxRef.current = null;
    }
  }, []);

  const startRingtone = React.useCallback(
    (type: 'incoming' | 'outgoing') => {
      stopRingtone();
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;

      const playTone = () => {
        if (!audioCtxRef.current) return;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        if (type === 'incoming') {
          // Cheerful dual-tone for incoming (Teams-like)
          osc1.type = 'triangle';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
          osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.1);
          gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.6);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
        } else {
          // Standard US ringback tone for outgoing
          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(440, ctx.currentTime);
          osc2.frequency.setValueAtTime(480, ctx.currentTime);
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.1);
          gain.gain.setValueAtTime(0.1, ctx.currentTime + 1.5);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.6);
        }

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + (type === 'incoming' ? 0.8 : 1.6));
        osc2.stop(ctx.currentTime + (type === 'incoming' ? 0.8 : 1.6));
      };

      playTone();
      ringTimerRef.current = setInterval(playTone, type === 'incoming' ? 2000 : 4000);
    },
    [stopRingtone],
  );

  const playMessageNotification = React.useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pleasant "pop/ping" sound
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // A6

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.error('Failed to play message sound', e);
    }
  }, []);

  const showDesktopNotification = React.useCallback((body: string) => {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (document.hasFocus()) return;
      const notification = new Notification('MooN — new message', { body, tag: 'moon-chat' });
      notification.onclick = () => {
        window.focus();
        setIsOpen(true);
        notification.close();
      };
    } catch {
      /* Notification API unavailable (e.g. insecure context) */
    }
  }, []);

  useEffect(() => {
    if (callStatus === 'ringing') {
      startRingtone('incoming');
    } else if (callStatus === 'calling') {
      startRingtone('outgoing');
    } else {
      stopRingtone();
    }
    return stopRingtone;
  }, [callStatus, startRingtone, stopRingtone]);

  useEffect(() => {
    if (callStatus === 'idle') setIsCallMinimized(true);
  }, [callStatus]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callStatus === 'connected' && isIceConnected) {
      interval = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [callStatus, isIceConnected]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const baselineChatsRef = useRef<Record<number, number>>({});
  const baselineTeamMsgIdRef = React.useRef<number>(0);
  const isBaselinesInitializedRef = useRef<boolean>(false);

  const assignedRoles = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
  const isAdmin = assignedRoles.includes('admin');
  const canHandleCustomers = Boolean(
    user && assignedRoles.some((role) => STAFF_ROLES.includes(role)),
  );
  const auth =
    user?.email && user?.session_token
      ? { email: user.email, sessionToken: user.session_token }
      : null;
  const entityId = user ? String(user.id) : guestName ? makeGuestId(guestName) : null;
  const entityType = user ? 'crm_user' : 'lead';
  const entityName = user ? user.name || user.email : guestName;

  useEffect(() => {
    if (isOpen && entityId) {
      void markGlobalChatsAsDelivered({ data: { receiverId: entityId } }).catch(() => undefined);
      const interval = setInterval(() => {
        void markGlobalChatsAsDelivered({ data: { receiverId: entityId } }).catch(() => undefined);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [entityId, isOpen]);

  useEffect(() => {
    if (!entityId || !entityName) return;
    const sendPulse = () => {
      const isIdle = Date.now() - lastActivityTimeRef.current > 5 * 60 * 1000;
      void heartbeatPresence({
        data: {
          entityId,
          entityType,
          entityName,
          role: user ? assignedRoles.join(', ') || user.role : 'client',
          isIdle,
        },
      }).catch(() => undefined);
    };
    sendPulse();
    const interval = setInterval(sendPulse, 30 * 1000);
    return () => clearInterval(interval);
  }, [entityId, entityName, entityType, user?.id, user?.role, assignedRoles.join(',')]);

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user) setChatTab('customers');
  }, [user]);

  // Real-time push: when the server emits a chat event, refresh the relevant
  // queries immediately. Polling remains as the fallback transport.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user?.session_token) return;
    const socket = getSocket();
    if (!socket) return;
    const onGlobalMessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['chat-history'] });
      void queryClient.invalidateQueries({ queryKey: ['chat-updates'] });
      void queryClient.invalidateQueries({ queryKey: ['chat-roster'] });
      void queryClient.invalidateQueries({ queryKey: ['global-chat-signals'] });
    };
    const onSupportMessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['support-chats'] });
      void queryClient.invalidateQueries({ queryKey: ['support-chat-messages'] });
    };
    socket.on('chat:global-message', onGlobalMessage);
    socket.on('chat:support-message', onSupportMessage);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off('chat:global-message', onGlobalMessage);
      socket.off('chat:support-message', onSupportMessage);
    };
  }, [user?.session_token, queryClient]);

  const { data: roster = [], refetch: refetchRoster } = useQuery({
    queryKey: ['chat-roster', entityId],
    queryFn: () =>
      getGlobalChatRoster({
        data: { requestingEntityId: entityId!, requestingEntityType: entityType },
      }),
    enabled: isOpen && !!user && !!entityId && chatTab === 'team',
    refetchInterval: isOpen && chatTab === 'team' ? 4000 : false,
    refetchIntervalInBackground: true,
  });

  const { data: teamHistory = [], refetch: refetchTeamHistory } = useQuery({
    queryKey: ['chat-history', entityId, activePartner?.id],
    queryFn: () =>
      getGlobalChatHistory({
        data: {
          entity1Id: entityId!,
          entity1Type: entityType,
          entity2Id: activePartner!.id,
          isGroup: activePartner!.type === 'group',
        },
      }),
    enabled: isOpen && !!activePartner && !!entityId,
    refetchInterval: isOpen && !!activePartner ? 4000 : false,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const stopMayaRecognition = React.useCallback(() => {
    const recognition = mayaRecognitionRef.current;
    mayaRecognitionRef.current = null;
    if (!recognition) return;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      /* recognition may already be stopped */
    }
  }, []);

  const speakMayaReply = React.useCallback(
    (text: string) => {
      stopMayaRecognition();
      const synthesis = window.speechSynthesis;
      if (!synthesis || typeof SpeechSynthesisUtterance === 'undefined') {
        mayaVoiceBusyRef.current = false;
        toast.error('Spoken replies are not supported by this browser.');
        resumeMayaListeningRef.current();
        return;
      }

      synthesis.cancel();
      const spokenText = text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_#`]/g, '')
        .trim();
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = 'en-IN';
      utterance.rate = 0.96;
      utterance.pitch = 1.05;
      const voices = synthesis.getVoices();
      utterance.voice =
        voices.find(
          (voice) =>
            /en-IN/i.test(voice.lang) && /female|heera|lekha|neerja|priya/i.test(voice.name),
        ) ||
        voices.find((voice) => /en-IN/i.test(voice.lang)) ||
        voices.find((voice) => /^en/i.test(voice.lang)) ||
        null;

      const resume = () => {
        mayaVoiceBusyRef.current = false;
        if (mayaCallActiveRef.current) resumeMayaListeningRef.current();
      };
      utterance.onend = resume;
      utterance.onerror = resume;
      mayaVoiceBusyRef.current = true;
      synthesis.speak(utterance);
    },
    [stopMayaRecognition],
  );

  const startMayaListening = React.useCallback(() => {
    if (!mayaCallActiveRef.current || mayaVoiceBusyRef.current || !auth || !entityId) return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice recognition is not supported by this browser.');
      return;
    }

    stopMayaRecognition();
    const recognition = new SpeechRecognition();
    mayaRecognitionRef.current = recognition;
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = async (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((result: any) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (!transcript || !mayaCallActiveRef.current) return;

      mayaVoiceBusyRef.current = true;
      try {
        const result = await adminMayaVoiceTurn<{ reply: string }>({
          data: { auth, senderId: entityId, transcript },
        });
        await refetchTeamHistory();
        if (mayaCallActiveRef.current) speakMayaReply(result.reply || 'Anything else?');
      } catch (error: any) {
        mayaVoiceBusyRef.current = false;
        toast.error(error?.message || 'Maya could not answer that voice request.');
        if (mayaCallActiveRef.current) resumeMayaListeningRef.current();
      }
    };
    recognition.onerror = (event: any) => {
      if (!['aborted', 'no-speech'].includes(event.error)) {
        console.error('Maya voice recognition failed:', event.error);
      }
    };
    recognition.onend = () => {
      mayaRecognitionRef.current = null;
      if (mayaCallActiveRef.current && !mayaVoiceBusyRef.current) {
        window.setTimeout(() => resumeMayaListeningRef.current(), 250);
      }
    };
    try {
      recognition.start();
    } catch (error) {
      console.error('Could not start Maya voice recognition:', error);
    }
  }, [auth, entityId, refetchTeamHistory, speakMayaReply, stopMayaRecognition]);
  resumeMayaListeningRef.current = startMayaListening;

  const handleStartVoiceCall = React.useCallback(async () => {
    if (activePartner?.id !== 'maya') {
      await startCall();
      return;
    }
    if (!isAdmin || !auth || !entityId) {
      toast.error('Only administrators can call Maya.');
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Calling Maya requires a browser with voice recognition support.');
      return;
    }

    const started = await startLocalCall();
    if (!started) {
      toast.error('Microphone access is required to call Maya.');
      return;
    }
    mayaCallActiveRef.current = true;
    const firstName = (user?.name || 'Admin').trim().split(/\s+/)[0];
    speakMayaReply(`Hello ${firstName}. How can I help?`);
  }, [
    activePartner?.id,
    auth,
    entityId,
    isAdmin,
    speakMayaReply,
    startCall,
    startLocalCall,
    user?.name,
  ]);

  const handleEndVoiceCall = React.useCallback(
    (duration?: number) => {
      if (mayaCallActiveRef.current || activePartner?.id === 'maya') {
        mayaCallActiveRef.current = false;
        mayaVoiceBusyRef.current = false;
        stopMayaRecognition();
        window.speechSynthesis?.cancel();
        endLocalCall();
        return;
      }
      endCall(duration);
    },
    [activePartner?.id, endCall, endLocalCall, stopMayaRecognition],
  );

  const handleToggleCallMute = React.useCallback(() => {
    const isMayaCall = mayaCallActiveRef.current || activePartner?.id === 'maya';
    if (isMayaCall && !isMuted) stopMayaRecognition();
    toggleMute();
    if (isMayaCall && isMuted) {
      window.setTimeout(() => resumeMayaListeningRef.current(), 100);
    }
  }, [activePartner?.id, isMuted, stopMayaRecognition, toggleMute]);

  useEffect(
    () => () => {
      mayaCallActiveRef.current = false;
      stopMayaRecognition();
      window.speechSynthesis?.cancel();
    },
    [stopMayaRecognition],
  );

  // Support chats keep polling while the widget is closed (slower cadence) so the
  // unread badge and notification sound stay live for staff.
  const { data: supportChats = [], refetch: refetchSupportChats } = useQuery({
    queryKey: ['support-chats', user?.id],
    queryFn: () => getAllSupportChats({ data: { auth: auth! } }),
    enabled: canHandleCustomers && !!auth,
    refetchInterval: isOpen && chatTab === 'customers' ? 5000 : 15000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  // Team-message watermark: also polled while closed so the launcher badge updates.
  const { data: chatUpdates } = useQuery({
    queryKey: ['chat-updates', entityId],
    queryFn: () => getGlobalChatUpdates({ data: { entityId: entityId! } }),
    enabled: !!entityId,
    refetchInterval: isOpen ? 5000 : 15000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  // Call/file signals keep polling while closed so incoming calls still ring.
  const { data: incomingSignals } = useQuery({
    queryKey: ['global-chat-signals', entityId],
    queryFn: () =>
      getGlobalChatSignals({
        data: { entityId: entityId!, lastSignalId: lastProcessedSignalIdRef.current },
      }),
    enabled: !!entityId,
    refetchInterval: isOpen ? 2000 : 10000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (chatTab === 'team' && activePartner && isOpen) {
      const hasUnread = teamHistory.some((m: any) => m.receiver_id === entityId && !m.read_at);
      if (hasUnread) {
        markGlobalChatAsRead({ data: { senderId: activePartner.id, receiverId: entityId! } }).then(
          () => {
            refetchTeamHistory();
          },
        );
      }
    }
  }, [teamHistory, activePartner, isOpen, chatTab, entityId]);

  useEffect(() => {
    // 1. Initialize baselines silently on first data load (so we don't treat all historical messages as "new")
    if (!isBaselinesInitializedRef.current && (supportChats.length > 0 || chatUpdates)) {
      const initialBaselines: Record<number, number> = {};
      supportChats.forEach((chat: any) => {
        initialBaselines[chat.id] = chat.message_count;
      });
      baselineChatsRef.current = initialBaselines;
      baselineTeamMsgIdRef.current = chatUpdates?.maxTeamMsgId || 0;
      isBaselinesInitializedRef.current = true;
      return;
    }

    let playedSound = false;

    if (isOpen) {
      setUnreadCount(0);

      // Check if active team chat got a new message
      const currentTeamMsgId = chatUpdates?.maxTeamMsgId || 0;
      if (currentTeamMsgId > baselineTeamMsgIdRef.current) {
        if (!playedSound) {
          playMessageNotification();
          showDesktopNotification('You have a new team message.');
          playedSound = true;
        }
        baselineTeamMsgIdRef.current = currentTeamMsgId;
      }

      // Update baselines for support chats
      const newBaselines: Record<number, number> = {};
      supportChats.forEach((chat: any) => {
        newBaselines[chat.id] = chat.message_count;
        if (
          chat.message_count > (baselineChatsRef.current[chat.id] || 0) &&
          chat.id === activeRequestId
        ) {
          if (!playedSound) {
            playMessageNotification();
            playedSound = true;
          }
        }
      });
      baselineChatsRef.current = newBaselines;
    } else {
      let unreadChatsCount = 0;
      let stateChanged = false;

      // Count support chats
      supportChats.forEach((chat: any) => {
        const baseline = baselineChatsRef.current[chat.id];
        if (baseline === undefined) {
          // A brand new chat arrived while the widget was closed
          unreadChatsCount += 1;
          baselineChatsRef.current[chat.id] = chat.message_count; // Set baseline so we don't add raw message count later
          stateChanged = true;
        } else {
          const diff = chat.message_count - baseline;
          if (diff > 0) {
            unreadChatsCount += 1; // +1 per chat, NOT per message
          }
        }
      });

      // Count team chats
      const currentTeamMsgId = chatUpdates?.maxTeamMsgId || 0;
      const teamDiff = currentTeamMsgId - baselineTeamMsgIdRef.current;
      if (teamDiff > 0) {
        unreadChatsCount += 1; // +1 for team chat
      }

      if (unreadChatsCount > 0) {
        if (unreadChatsCount > unreadCount || stateChanged) {
          playMessageNotification(); // Play sound if unread chats increased
          showDesktopNotification(
            unreadChatsCount === 1
              ? 'You have new chat messages.'
              : `You have new messages in ${unreadChatsCount} chats.`,
          );
        }
        setUnreadCount(unreadChatsCount);
      } else {
        setUnreadCount(0);
      }
    }
  }, [
    isOpen,
    supportChats,
    chatUpdates,
    activeRequestId,
    unreadCount,
    playMessageNotification,
    showDesktopNotification,
  ]);

  useEffect(() => {
    // Also process signals from active chat history if available
    if (teamHistory && activePartner && entityId) {
      teamHistory.forEach((msg) => {
        if (
          msg.message_text.startsWith('__WEBRTC__:') &&
          msg.id > lastProcessedSignalIdRef.current
        ) {
          lastProcessedSignalIdRef.current = msg.id;

          // Only process signals less than 60 seconds old to avoid re-triggering past calls
          const isStale = msg.created_at
            ? new Date().getTime() - new Date(msg.created_at).getTime() > 60000
            : false;

          if (msg.sender_id !== entityId && !isStale) {
            const parts = msg.message_text.split(':');
            const type = parts[1];
            const payloadStr = parts.slice(2).join(':');
            const payload = payloadStr !== 'null' ? JSON.parse(payloadStr) : null;

            if (type === 'RING' || type === 'OFFER') {
              setActivePartner({
                id: msg.sender_id,
                type: msg.sender_type || 'crm_user',
                name: activePartner.name,
              });
            }

            if (type.startsWith('FILE_')) {
              handleFileSignal(type, payload, activePartner.name);
            } else {
              handleSignal(type, payload, activePartner.name);
            }
          }
        }
      });
    }
  }, [teamHistory, handleSignal, handleFileSignal, activePartner, entityId]);

  useEffect(() => {
    // Process globally polled incoming signals
    if (incomingSignals && incomingSignals.length > 0) {
      incomingSignals.forEach((msg: any) => {
        if (msg.id > lastProcessedSignalIdRef.current) {
          lastProcessedSignalIdRef.current = msg.id;

          const isStale = msg.created_at
            ? new Date().getTime() - new Date(msg.created_at).getTime() > 60000
            : false;
          if (isStale) return;

          const parts = msg.message_text.split(':');
          const type = parts[1];
          const payloadStr = parts.slice(2).join(':');
          const payload = payloadStr !== 'null' ? JSON.parse(payloadStr) : null;

          if (type === 'RING' || type === 'OFFER' || type === 'FILE_OFFER') {
            setActivePartner({ id: msg.sender_id, type: msg.sender_type, name: msg.sender_name });
          }

          if (type.startsWith('FILE_')) {
            handleFileSignal(type, payload, msg.sender_name);
          } else {
            handleSignal(type, payload, msg.sender_name);
          }
        }
      });
    }
  }, [incomingSignals, handleSignal, handleFileSignal]);

  const { data: supportMessages = [], refetch: refetchSupportMessages } = useQuery({
    queryKey: ['support-chat-messages', activeRequestId],
    queryFn: () =>
      getAdminSupportChatMessages({
        data: {
          auth: auth!,
          chatId: activeRequestId!,
        },
      }),
    enabled: isOpen && !!activeRequestId && !!auth,
    refetchInterval: isOpen && !!activeRequestId ? 4000 : false,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const currentChat = supportChats.find((c: any) => c.id === activeRequestId) || null;
  const customerMessages = supportMessages || [];

  // Guest (unauthenticated visitor) support chat — creates/resumes the chat on
  // the server and polls for replies from staff or Maya.
  const guestReady =
    !user &&
    !showGuestPrompt &&
    !!guestToken &&
    !!guestName.trim() &&
    guestMobile.trim().length >= 8;
  const { data: guestChatData, refetch: refetchGuestChat } = useQuery({
    queryKey: ['guest-support-chat', guestToken],
    queryFn: () =>
      getGuestSupportChat({
        data: { guestToken, name: guestName.trim(), mobile: guestMobile.trim(), email: '' },
      }),
    enabled: isOpen && guestReady,
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const guestChat = guestChatData?.chat || null;
  const guestMessages = useMemo(() => {
    const customerId = guestChatData?.customerId;
    return (guestChatData?.messages || []).map((msg: any) => {
      const isMine = customerId != null && String(msg.sender_id) === String(customerId);
      const isMaya = String(msg.sender_id) === '0';
      return {
        id: msg.id,
        sender_id: isMine ? 'guest-self' : String(msg.sender_id),
        message_text: msg.content,
        created_at: msg.created_at,
        message_type: 'user' as const,
        sender_role: isMine ? 'customer' : isMaya ? 'maya' : 'team',
        sender_name: isMine ? guestName : isMaya ? 'Maya' : msg.sender_name || 'Support',
      };
    });
  }, [guestChatData, guestName]);

  const handleGuestSend = async (overrideText?: string) => {
    const textToSend = overrideText !== undefined ? overrideText : message;
    if (!textToSend.trim() || !guestReady) return;
    setMessage('');
    try {
      await sendGuestSupportMessage({ data: { guestToken, content: textToSend.trim() } });
    } finally {
      refetchGuestChat();
    }
  };

  const [guestRatingSent, setGuestRatingSent] = useState(false);
  const handleGuestRate = async (rating: number) => {
    if (!guestChat) return;
    setGuestRatingSent(true);
    try {
      await rateSupportChat({ data: { chatId: guestChat.id, rating } });
      refetchGuestChat();
    } catch {
      setGuestRatingSent(false);
    }
  };

  const headerTitle = useMemo(() => {
    if (activePartner) return activePartner.name;
    if (currentChat && user) return currentChat.customer_name;
    if (currentChat && !user) return 'Customer Support';
    if (showGuestPrompt) return 'Identify Yourself';
    if (user) return chatTab === 'team' ? 'Team Chat' : 'Customer Chats';
    return 'Customer Support';
  }, [activePartner, chatTab, currentChat, showGuestPrompt, user]);

  const handleOpen = () => {
    setIsOpen(true);
    if (!user && (!guestName || guestMobile.trim().length < 8)) setShowGuestPrompt(true);
    // Ask once, on a user gesture, so later messages can notify the desktop.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  // Tab-title unread badge, e.g. "(2) MooNsConfig".
  const baseTitleRef = useRef<string | null>(null);
  useEffect(() => {
    baseTitleRef.current ??= document.title.replace(/^\(\d+\+?\)\s*/, '');
    const base = baseTitleRef.current;
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${base}` : base;
  }, [unreadCount]);

  const saveGuest = () => {
    if (!guestName.trim() || guestMobile.trim().length < 8) return;
    localStorage.setItem('moon_guest_name', guestName.trim());
    localStorage.setItem('moon_guest_mobile', guestMobile.trim());
    setShowGuestPrompt(false);
  };

  const handleBack = () => {
    if (activePartner) setActivePartner(null);
    else if (user && activeRequestId) setActiveRequestId(null);
  };

  const handleTeamSend = async (overrideText?: string) => {
    const textToSend = overrideText !== undefined ? overrideText : message;
    if (!textToSend.trim() || !activePartner || !entityId) return;
    setMessage('');
    await sendGlobalChatMessage({
      data: {
        senderId: entityId,
        senderType: entityType,
        receiverId: activePartner.id,
        receiverType: activePartner.type,
        messageText: textToSend.trim(),
        auth: user?.session_token
          ? { email: user.email!, sessionToken: user.session_token }
          : undefined,
      },
    });
    refetchTeamHistory();
  };

  const handleTeamReaction = async (messageId: number, emoji: string) => {
    if (!entityId) return;
    await toggleGlobalChatReaction({
      data: {
        messageId,
        entityId,
        entityType,
        emoji,
      },
    });
    refetchTeamHistory();
  };

  const handleCustomerSend = async (overrideText?: string) => {
    const textToSend = overrideText !== undefined ? overrideText : message;
    if (!textToSend.trim() || !activeRequestId || !auth) return;
    setMessage('');
    await adminSendSupportMessage({
      data: {
        auth,
        chatId: activeRequestId,
        content: textToSend.trim(),
      },
    });
    refetchSupportMessages();
    refetchSupportChats();
  };

  const handleClose = async (chatId: number) => {
    if (!auth) return;
    setChatToClose(chatId);
  };

  const confirmClose = async () => {
    if (!auth || chatToClose === null) return;
    await closeSupportChat({ data: { auth, chatId: chatToClose } });
    refetchSupportChats();
    if (activeRequestId === chatToClose) {
      setActiveRequestId(null);
    }
    setChatToClose(null);
  };

  const handleToggleConversationPin = async (
    targetId: string,
    targetType: 'team' | 'customer',
    currentStatus: boolean,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (!user) return;
    await toggleConversationPin({
      data: { userId: String(user.id), targetId, targetType, isPinned: !currentStatus },
    });
    if (targetType === 'team') refetchRoster();
    else refetchSupportChats();
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedGroupMembers.length === 0 || !entityId || !entityType)
      return;
    setIsCreatingGroup(true);
    try {
      const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const members = selectedGroupMembers.map((id) => {
        const r = roster.find((r) => r.entity_id === id);
        return { entityId: id, entityType: r?.entity_type || 'crm_user' };
      });
      // Add creator
      members.push({ entityId, entityType });

      await createGlobalChatGroup({
        data: {
          id: groupId,
          name: newGroupName.trim(),
          createdBy: entityId,
          members,
        },
      });
      setShowCreateGroup(false);
      setNewGroupName('');
      setSelectedGroupMembers([]);
      setActivePartner({ id: groupId, type: 'group', name: newGroupName.trim() });
    } catch (e) {
      console.error(e);
      alert('Failed to create group');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const getStatusIndicator = (row: any) => {
    const diffMins = (new Date().getTime() - new Date(row.last_seen_at).getTime()) / 60000;
    if (diffMins >= 5) return <span className="h-2 w-2 rounded-full bg-zinc-400" title="Offline" />;
    if (row.is_idle) return <span className="h-2 w-2 rounded-full bg-yellow-500" title="Idle" />;
    if (diffMins < 2) return <span className="h-2 w-2 rounded-full bg-green-500" title="Online" />;
    return <span className="h-2 w-2 rounded-full bg-yellow-500" title="Idle" />;
  };

  const canSendCustomerMessage = currentChat?.status !== 'closed';

  // Smart Replies for admin support chats
  const { data: smartReplies = [], refetch: refetchSmartReplies } = useQuery({
    queryKey: ['smart-replies', activeRequestId],
    queryFn: () => getChatSmartReplies({ data: { chatId: activeRequestId!, auth: auth! } }),
    enabled: isOpen && !!activeRequestId && !!auth && canHandleCustomers && canSendCustomerMessage,
    refetchInterval: false,
    staleTime: 30000,
  });

  // Refetch smart replies when new messages arrive
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (customerMessages.length > prevMsgCountRef.current && customerMessages.length > 0) {
      refetchSmartReplies();
    }
    prevMsgCountRef.current = customerMessages.length;
  }, [customerMessages.length, refetchSmartReplies]);

  const handleHandoverToAI = async () => {
    if (!activeRequestId || !auth) return;
    setAiHandingOver(true);
    try {
      await handoverChatToAI({ data: { chatId: activeRequestId, auth } });
      refetchSupportChats();
      refetchSupportMessages();
    } catch (e) {
      console.error('Handover failed:', e);
    } finally {
      setAiHandingOver(false);
    }
  };

  return (
    <>
      {!isOpen ? (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-105 hover:bg-primary/90"
        >
          <MessageSquare className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow ring-2 ring-background">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      ) : (
        <div className="fixed bottom-6 right-6 z-[60] flex h-[500px] max-h-[80vh] w-[350px] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl animate-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between border-b p-3 shadow-sm bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              {(activePartner || activeRequestId) && (
                <button onClick={handleBack} className="rounded p-1 hover:bg-primary-foreground/20">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <div className="flex flex-col">
                <h3 className="font-semibold">{headerTitle}</h3>
                {activePartner && (
                  <div className="flex items-center gap-1.5 text-[10px] opacity-80">
                    {(() => {
                      if (activePartner.type === 'group') return <span>Group Chat</span>;
                      const r = roster.find((r) => r.entity_id === activePartner.id);
                      if (!r)
                        return (
                          <>
                            <span className="h-2 w-2 rounded-full bg-zinc-400/80" />
                            <span>Offline</span>
                          </>
                        );
                      const diffMins =
                        (new Date().getTime() - new Date(r.last_seen_at).getTime()) / 60000;
                      const isOffline = diffMins >= 5;
                      const isIdle = !isOffline && ((r as any).is_idle || diffMins >= 2);
                      const isOnline = !isOffline && !isIdle;

                      let statusText = '';
                      if (diffMins < 1) {
                        statusText = 'Last seen just now';
                      } else if (diffMins < 60) {
                        statusText = `Last seen ${Math.floor(diffMins)} mins ago`;
                      } else if (diffMins < 1440) {
                        statusText = `Last seen ${Math.floor(diffMins / 60)} hours ago`;
                      } else {
                        statusText = `Last seen ${Math.floor(diffMins / 1440)} days ago`;
                      }

                      return (
                        <>
                          <span
                            className={`h-2 w-2 rounded-full shadow-sm ${isOnline ? 'bg-green-500' : isIdle ? 'bg-yellow-500' : 'bg-zinc-400/80'}`}
                          />
                          <span>{statusText}</span>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {activePartner &&
                activePartner.type !== 'group' &&
                (activePartner.id !== 'maya' || isAdmin) && (
                  <button
                    onClick={handleStartVoiceCall}
                    disabled={callStatus !== 'idle'}
                    className="rounded p-2 hover:bg-primary-foreground/20 disabled:opacity-50"
                    title="Voice Call"
                  >
                    <PhoneCall className="h-4 w-4" />
                  </button>
                )}
              {activeRequestId && canHandleCustomers && canSendCustomerMessage && (
                <>
                  <button
                    onClick={handleHandoverToAI}
                    disabled={aiHandingOver}
                    className="rounded p-1.5 hover:bg-primary-foreground/20 disabled:opacity-50"
                    title="Hand over to Maya (AI)"
                  >
                    {aiHandingOver ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleClose(activeRequestId)}
                    className="rounded p-1.5 hover:bg-primary-foreground/20"
                    title="Resolve & Close"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-2 hover:bg-primary-foreground/20"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {forwardMessage && (
            <div className="absolute inset-0 z-50 flex flex-col bg-card animate-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between border-b p-3 bg-muted/40">
                <h4 className="text-sm font-bold">Forward to...</h4>
                <button
                  onClick={() => setForwardMessage(null)}
                  className="rounded p-1 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {roster.filter(
                  (row) => row.entity_id !== entityId && row.entity_type === 'crm_user',
                ).length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No users available to forward to.
                  </div>
                ) : (
                  roster
                    .filter((row) => row.entity_id !== entityId && row.entity_type === 'crm_user')
                    .map((row) => (
                      <button
                        key={row.entity_id}
                        onClick={async () => {
                          await sendGlobalChatMessage({
                            data: {
                              senderId: entityId!,
                              senderType: entityType!,
                              receiverId: row.entity_id,
                              receiverType: row.entity_type,
                              auth: user?.session_token
                                ? { email: user.email!, sessionToken: user.session_token }
                                : undefined,
                              messageText: forwardMessage,
                            },
                          });
                          setForwardMessage(null);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {row.entity_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="text-sm font-medium">{row.entity_name}</div>
                      </button>
                    ))
                )}
              </div>
            </div>
          )}

          {!activePartner && (!user || !activeRequestId) && (
            <div className="flex items-center gap-1 border-b bg-muted/40 p-1">
              <div className="grid flex-1 grid-cols-2 gap-1">
                <button
                  onClick={() => setChatTab('team')}
                  className={`rounded-md px-3 py-2 text-xs font-semibold ${chatTab === 'team' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                >
                  Team
                </button>
                <button
                  onClick={() => setChatTab('customers')}
                  className={`rounded-md px-3 py-2 text-xs font-semibold ${chatTab === 'customers' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                >
                  Customers
                </button>
              </div>
              {user && chatTab === 'team' && !activePartner && (
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-card hover:text-primary hover:shadow-sm"
                  title="Create Group"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          <div className="relative flex flex-1 flex-col overflow-hidden bg-muted/20">
            {showGuestPrompt ? (
              <div className="flex h-full flex-col justify-center gap-4 p-6 text-center">
                <User className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                <h4 className="text-lg font-bold">Welcome to MooN</h4>
                <p className="text-xs text-muted-foreground">
                  Please enter your name so our sales and support team can join your chat.
                </p>
                <Input
                  placeholder="Your Name"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && saveGuest()}
                />
                <Input
                  placeholder="Mobile Number"
                  type="tel"
                  value={guestMobile}
                  onChange={(event) => setGuestMobile(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && saveGuest()}
                />
                <Button
                  onClick={saveGuest}
                  disabled={!guestName.trim() || guestMobile.trim().length < 8}
                >
                  Start Chat
                </Button>
              </div>
            ) : user && chatTab === 'team' && !activePartner ? (
              <div className="flex h-full flex-col">
                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {roster.filter((r) => r.entity_id !== entityId).length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No team members online yet.
                    </div>
                  ) : (
                    roster
                      .filter((r) => r.entity_id !== entityId)
                      .sort((a: any, b: any) => {
                        if (a.is_pinned !== b.is_pinned)
                          return (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
                        return (
                          new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
                        );
                      })
                      .map((row: any) => (
                        <button
                          key={`${row.entity_type}_${row.entity_id}`}
                          onClick={() =>
                            setActivePartner({
                              id: row.entity_id,
                              type: row.entity_type,
                              name: row.entity_name,
                            })
                          }
                          className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left shadow-sm transition-colors ${row.is_pinned ? 'bg-muted/80 border-primary/20' : 'bg-card hover:bg-muted/50'}`}
                        >
                          <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            {row.entity_type === 'group' ? (
                              <Users className="h-5 w-5" />
                            ) : (
                              <User className="h-5 w-5" />
                            )}
                          </div>
                          <div className="flex flex-1 flex-col overflow-hidden text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-bold">{row.entity_name}</span>
                                {row.entity_type !== 'group' && getStatusIndicator(row)}
                              </div>
                              <div
                                className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted ${row.is_pinned ? 'opacity-100 text-primary' : 'text-muted-foreground'}`}
                                onClick={(e) =>
                                  handleToggleConversationPin(
                                    row.entity_id,
                                    'team',
                                    !!row.is_pinned,
                                    e,
                                  )
                                }
                              >
                                <Pin
                                  className="h-3.5 w-3.5"
                                  fill={row.is_pinned ? 'currentColor' : 'none'}
                                />
                              </div>
                            </div>
                            <div className="truncate text-xs text-muted-foreground mt-0.5">
                              {row.last_message ? (
                                <span>{formatLastMessage(row.last_message)}</span>
                              ) : (
                                <span className="uppercase tracking-widest">{row.role}</span>
                              )}
                            </div>
                          </div>
                          {row.last_message && (row as any).last_message_sender_id === entityId && (
                            <div
                              className={`shrink-0 text-sm font-medium tracking-tighter ${(row as any).last_message_read_at ? 'text-emerald-500' : 'text-muted-foreground'}`}
                            >
                              {(row as any).last_message_read_at
                                ? '✓✓'
                                : (row as any).last_message_delivered_at
                                  ? '✓✓'
                                  : '✓'}
                            </div>
                          )}
                        </button>
                      ))
                  )}
                </div>
              </div>
            ) : user && chatTab === 'customers' && !activeRequestId ? (
              <div className="h-full space-y-2 overflow-y-auto p-2">
                {!canHandleCustomers ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    Customer chats are available for sales, support, and admin users.
                  </div>
                ) : supportChats.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No customer requests yet.
                  </div>
                ) : (
                  supportChats.map((chat: any) => (
                    <div
                      key={chat.id}
                      className={`group rounded-xl border p-3 shadow-sm cursor-pointer transition-colors ${chat.is_pinned ? 'bg-muted/80 border-primary/20' : 'bg-card hover:bg-muted/50'}`}
                      onClick={() => setActiveRequestId(chat.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-bold truncate">{chat.customer_name}</div>
                            <div
                              className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted ${chat.is_pinned ? 'opacity-100 text-primary' : 'text-muted-foreground'}`}
                              onClick={(e) =>
                                handleToggleConversationPin(
                                  chat.id.toString(),
                                  'customer',
                                  !!chat.is_pinned,
                                  e,
                                )
                              }
                            >
                              <Pin
                                className="h-3.5 w-3.5"
                                fill={chat.is_pinned ? 'currentColor' : 'none'}
                              />
                            </div>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span
                              className={chat.status === 'open' ? 'text-emerald-500 font-bold' : ''}
                            >
                              {chat.status}
                            </span>
                          </div>
                        </div>
                        {chat.status === 'open' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClose(chat.id);
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1 text-emerald-500" />
                            Resolve
                          </Button>
                        )}
                      </div>
                      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                        <span>
                          {chat.customer_phone || chat.customer_email || 'No contact info'}
                        </span>
                        <span>{chat.message_count} msgs</span>
                      </div>
                      {chat.status === 'closed' && chat.rating && (
                        <div className="flex items-center gap-1 mt-2 text-[10px] text-amber-500">
                          <Star className="w-3 h-3 fill-amber-500" />
                          <span>{chat.rating}/5</span>
                          {chat.feedback && (
                            <span className="ml-1 truncate text-foreground/50">
                              - {chat.feedback}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : activePartner ? (
              <Conversation
                messages={
                  teamHistory
                    .map((msg) => {
                      if (msg.message_text.startsWith('__WEBRTC__:')) {
                        const sysText = formatSystemMessage(msg.message_text);
                        if (!sysText) return null;
                        return {
                          ...msg,
                          message_text: sysText,
                          message_type: 'system' as const,
                          sender_name: 'System',
                        };
                      }
                      return {
                        ...msg,
                        message_type: 'user' as const,
                        sender_name:
                          roster.find((r) => r.entity_id === msg.sender_id)?.entity_name ||
                          'Unknown',
                      };
                    })
                    .filter(Boolean) as any
                }
                currentEntityId={entityId || undefined}
                inputValue={message}
                setInputValue={setMessage}
                onSend={handleTeamSend}
                onTogglePin={async (id, status) => {
                  await toggleMessagePin({ data: { messageId: id, isPinned: !status } });
                  refetchTeamHistory();
                }}
                onForward={(msg) => setForwardMessage(msg)}
                onToggleReaction={handleTeamReaction}
                onSendFileP2P={activePartner.type !== 'group' ? sendFileOffer : undefined}
                transferStatus={transferStatus}
                fileInfo={fileInfo}
                transferProgress={progress}
                transferRemoteName={remoteName || activePartner.name}
                onTyping={() => {
                  if (activePartner && entityId && entityType) {
                    const now = Date.now();
                    if (now - lastTypingSignalRef.current > 2000) {
                      setGlobalChatTypingStatus({
                        data: { entityId, entityType, typingTo: activePartner.id },
                      });
                      lastTypingSignalRef.current = now;
                    }
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = setTimeout(() => {
                      setGlobalChatTypingStatus({ data: { entityId, entityType, typingTo: null } });
                    }, 3000);
                  }
                }}
                isTyping={(() => {
                  const partnerPresence: any = roster.find(
                    (r) => r.entity_id === activePartner?.id,
                  );
                  return !!(
                    partnerPresence?.typing_to === entityId &&
                    partnerPresence?.typing_updated_at &&
                    new Date().getTime() - new Date(partnerPresence.typing_updated_at).getTime() <
                      5000
                  );
                })()}
                typingPartnerName={activePartner.name}
                isPartnerOnlineOrIdle={(() => {
                  const partnerPresence = roster.find((r) => r.entity_id === activePartner?.id);
                  if (!partnerPresence) return false;
                  return (
                    (new Date().getTime() - new Date(partnerPresence.last_seen_at).getTime()) /
                      60000 <
                    15
                  );
                })()}
                transferPartnerName={activePartner.name}
                onAcceptFileOffer={acceptFileOffer}
                onRejectFileOffer={rejectFileOffer}
                onCancelTransfer={cancelTransfer}
                placeholder="Message..."
                disabled={false}
                isGroup={activePartner.type === 'group'}
              />
            ) : !user ? (
              <div className="flex h-full flex-col">
                {guestChat?.status === 'closed' && !guestChat?.rating && !guestRatingSent && (
                  <div className="border-b bg-muted/40 p-3 text-center">
                    <p className="text-xs font-medium text-muted-foreground">
                      This chat was closed. How was our support?
                    </p>
                    <div className="mt-2 flex justify-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => handleGuestRate(star)}
                          className="p-1 text-amber-400 transition-transform hover:scale-125"
                          title={`Rate ${star}/5`}
                        >
                          <Star className="h-5 w-5" fill="currentColor" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  <Conversation
                    isTyping={false}
                    messages={guestMessages}
                    currentEntityId="guest-self"
                    inputValue={message}
                    setInputValue={setMessage}
                    onSend={handleGuestSend}
                    placeholder="Type your message..."
                    disabled={guestChat?.status === 'closed'}
                    emptyState="Hi! Tell us how we can help and our team will reply here."
                  />
                </div>
              </div>
            ) : (
              <Conversation
                isTyping={!!currentChat?.ai_is_typing}
                typingPartnerName="Maya"
                messages={customerMessages.map((msg: any) => {
                  const senderId = String(msg.sender_id);
                  const customerId =
                    currentChat?.customer_id != null ? String(currentChat.customer_id) : '';
                  const isCustomer = senderId === customerId;
                  const isMaya = senderId === '0';
                  return {
                    id: msg.id,
                    sender_id: senderId,
                    message_text: msg.content,
                    created_at: msg.created_at,
                    message_type: 'user' as const,
                    sender_role: isCustomer ? 'customer' : isMaya ? 'maya' : 'team',
                    sender_name: isCustomer
                      ? currentChat?.customer_name || 'Customer'
                      : isMaya
                        ? 'Maya'
                        : msg.sender_name || msg.sender_email || 'Team',
                  };
                })}
                currentEntityId={entityId || undefined}
                inputValue={message}
                setInputValue={setMessage}
                onSend={handleCustomerSend}
                onTogglePin={async (id, status) => {
                  await toggleMessagePin({ data: { messageId: id, isPinned: !status } });
                  refetchSupportChats();
                }}
                onForward={(msg) => setForwardMessage(msg)}
                placeholder={'Type your message...'}
                disabled={!canSendCustomerMessage}
                emptyState={'No messages in this chat.'}
                smartReplies={canHandleCustomers ? smartReplies : undefined}
                activeChat={supportChats?.find((c: any) => c.id === activeRequestId)}
                onTakeOver={
                  user?.role === 'admin'
                    ? async (chatId: number) => {
                        if (auth && chatId) {
                          await adminTakeOverSupportChat({ data: { auth, chatId } });
                          refetchSupportChats();
                        }
                      }
                    : undefined
                }
                onSmartReplyClick={(reply) => handleCustomerSend(reply)}
              />
            )}
          </div>

          {showCreateGroup && (
            <div className="absolute inset-0 z-50 flex flex-col bg-card animate-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between border-b p-3 shadow-sm bg-primary text-primary-foreground">
                <h3 className="font-semibold text-sm">Create Group</h3>
                <button
                  onClick={() => setShowCreateGroup(false)}
                  className="rounded p-1 hover:bg-primary-foreground/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold">Group Name</label>
                  <Input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Sales Team"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Select Members</label>
                  <div className="mt-2 space-y-2 border rounded-md p-2 max-h-48 overflow-y-auto">
                    {roster
                      .filter((r) => r.entity_id !== entityId && r.entity_type !== 'group')
                      .map((u) => (
                        <label
                          key={u.entity_id}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted p-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={selectedGroupMembers.includes(u.entity_id)}
                            onChange={(e) => {
                              if (e.target.checked)
                                setSelectedGroupMembers([...selectedGroupMembers, u.entity_id]);
                              else
                                setSelectedGroupMembers(
                                  selectedGroupMembers.filter((id) => id !== u.entity_id),
                                );
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span>{u.entity_name}</span>
                          </div>
                        </label>
                      ))}
                  </div>
                </div>
              </div>
              <div className="p-3 border-t bg-muted/30">
                <Button
                  className="w-full"
                  onClick={handleCreateGroup}
                  disabled={
                    isCreatingGroup || !newGroupName.trim() || selectedGroupMembers.length === 0
                  }
                >
                  {isCreatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Group'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {callStatus !== 'idle' && (
        <div
          className={`fixed z-[100] flex flex-col items-center justify-between bg-zinc-900 text-white transition-all duration-300 overflow-hidden ${
            isCallMinimized
              ? 'bottom-24 right-6 h-[200px] w-[350px] rounded-2xl shadow-2xl'
              : 'inset-0 pt-16 pb-12 animate-in slide-in-from-bottom-full'
          }`}
        >
          {/* Remote Video / Screen Share — full screen background */}
          {remoteStream && remoteStream.getVideoTracks().length > 0 && (
            <video
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover z-0 bg-black"
              ref={(el) => {
                if (el && el.srcObject !== remoteStream) el.srcObject = remoteStream;
              }}
            />
          )}

          {/* Local Camera PiP Preview — bottom right corner */}
          {isVideoEnabled && localVideoMediaStream && callStatus === 'connected' && (
            <div
              className={`absolute z-20 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black ${isCallMinimized ? 'bottom-2 right-2 h-16 w-24' : 'bottom-28 right-4 h-32 w-44'}`}
            >
              <video
                ref={localVideoPreviewRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover mirror"
                style={{ transform: 'scaleX(-1)' }}
              />
              {!isCallMinimized && (
                <div className="absolute bottom-1 left-2 text-[10px] font-medium text-white/70 bg-black/50 px-1.5 py-0.5 rounded">
                  You
                </div>
              )}
            </div>
          )}

          {/* Maximize Button when Minimized */}
          {isCallMinimized && (
            <button
              onClick={() => setIsCallMinimized(false)}
              className="absolute top-2 right-2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <MonitorUp className="h-4 w-4" />
            </button>
          )}

          {/* Center Content — Avatar or Video info */}
          <div
            className={`flex flex-col items-center z-10 drop-shadow-2xl justify-center ${isCallMinimized ? 'flex-1 mt-6' : 'flex-1 gap-6'}`}
          >
            {(!remoteStream || remoteStream.getVideoTracks().length === 0) && (
              <div
                className={`flex items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 text-zinc-300 font-light shadow-2xl ring-4 ring-white/10 ${isCallMinimized ? 'h-16 w-16 text-2xl' : 'h-28 w-28 text-5xl'}`}
              >
                {(callerName || activePartner?.name || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div
              className={`text-center bg-black/40 rounded-2xl backdrop-blur-sm ${isCallMinimized ? 'px-3 py-2 mt-2 space-y-0.5' : 'px-6 py-4 space-y-2'}`}
            >
              <h2
                className={`${isCallMinimized ? 'text-lg' : 'text-3xl'} font-light tracking-wide`}
              >
                {callerName || activePartner?.name}
              </h2>
              <p
                className={`${isCallMinimized ? 'text-xs' : 'text-base'} text-zinc-300 capitalize`}
              >
                {callStatus === 'ringing'
                  ? 'MooN Call'
                  : callStatus === 'calling'
                    ? 'Calling...'
                    : callStatus === 'connected' && !isIceConnected
                      ? 'Connecting...'
                      : formatDuration(callDuration)}
              </p>
              {callStatus === 'connected' && isIceConnected && !isCallMinimized && (
                <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
                  {isVideoEnabled && (
                    <span className="flex items-center gap-1">
                      <Video className="h-3 w-3" /> Video
                    </span>
                  )}
                  {isScreenSharing && (
                    <span className="flex items-center gap-1">
                      <MonitorUp className="h-3 w-3" /> Sharing
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Control Bar */}
          <div
            className={`flex w-full items-center justify-center z-10 ${isCallMinimized ? 'gap-3 pb-4' : 'gap-5 px-6 max-w-md'}`}
          >
            {callStatus === 'ringing' && callerName ? (
              <>
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={rejectCall}
                    className={`flex items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-transform hover:scale-110 ${isCallMinimized ? 'h-10 w-10' : 'h-16 w-16'}`}
                  >
                    <PhoneOff className={isCallMinimized ? 'h-5 w-5' : 'h-7 w-7'} />
                  </button>
                  {!isCallMinimized && (
                    <span className="text-xs font-medium text-white/70">Decline</span>
                  )}
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={answerCall}
                    className={`flex items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-transform hover:scale-110 animate-pulse ${isCallMinimized ? 'h-10 w-10' : 'h-16 w-16'}`}
                  >
                    <Phone className={isCallMinimized ? 'h-5 w-5' : 'h-7 w-7'} />
                  </button>
                  {!isCallMinimized && (
                    <span className="text-xs font-medium text-white/70">Accept</span>
                  )}
                </div>
              </>
            ) : (
              <>
                {callStatus === 'connected' && (
                  <>
                    {/* Mute */}
                    <div className="flex flex-col items-center gap-1.5">
                      <button
                        onClick={handleToggleCallMute}
                        className={`flex items-center justify-center rounded-full shadow-lg transition-all duration-200 ${isCallMinimized ? 'h-10 w-10' : 'h-14 w-14'} ${isMuted ? 'bg-white text-zinc-900 hover:bg-zinc-200' : 'bg-white/10 backdrop-blur-md text-white hover:bg-white/20 ring-1 ring-white/20'}`}
                      >
                        {isMuted ? (
                          <MicOff className={isCallMinimized ? 'h-4 w-4' : 'h-5 w-5'} />
                        ) : (
                          <Mic className={isCallMinimized ? 'h-4 w-4' : 'h-5 w-5'} />
                        )}
                      </button>
                      {!isCallMinimized && (
                        <span className="text-[10px] font-medium text-white/60">
                          {isMuted ? 'Unmute' : 'Mute'}
                        </span>
                      )}
                    </div>
                    {/* Video */}
                    {activePartner?.id !== 'maya' && (
                      <div className="flex flex-col items-center gap-1.5">
                        <button
                          onClick={toggleVideo}
                          className={`flex items-center justify-center rounded-full shadow-lg transition-all duration-200 ${isCallMinimized ? 'h-10 w-10' : 'h-14 w-14'} ${isVideoEnabled ? 'bg-blue-500 text-white hover:bg-blue-600 ring-2 ring-blue-400/50' : 'bg-white/10 backdrop-blur-md text-white hover:bg-white/20 ring-1 ring-white/20'}`}
                        >
                          {isVideoEnabled ? (
                            <VideoOff className={isCallMinimized ? 'h-4 w-4' : 'h-5 w-5'} />
                          ) : (
                            <Video className={isCallMinimized ? 'h-4 w-4' : 'h-5 w-5'} />
                          )}
                        </button>
                        {!isCallMinimized && (
                          <span className="text-[10px] font-medium text-white/60">
                            {isVideoEnabled ? 'Stop Video' : 'Video'}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Screen Share */}
                    {activePartner?.id !== 'maya' && (
                      <div className="flex flex-col items-center gap-1.5">
                        <button
                          onClick={toggleScreenShare}
                          className={`flex items-center justify-center rounded-full shadow-lg transition-all duration-200 ${isCallMinimized ? 'h-10 w-10' : 'h-14 w-14'} ${isScreenSharing ? 'bg-blue-500 text-white hover:bg-blue-600 ring-2 ring-blue-400/50' : 'bg-white/10 backdrop-blur-md text-white hover:bg-white/20 ring-1 ring-white/20'}`}
                        >
                          {isScreenSharing ? (
                            <MonitorX className={isCallMinimized ? 'h-4 w-4' : 'h-5 w-5'} />
                          ) : (
                            <MonitorUp className={isCallMinimized ? 'h-4 w-4' : 'h-5 w-5'} />
                          )}
                        </button>
                        {!isCallMinimized && (
                          <span className="text-[10px] font-medium text-white/60">
                            {isScreenSharing ? 'Stop' : 'Share'}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
                {/* End Call */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={() => handleEndVoiceCall(callDuration)}
                    className={`flex items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-transform hover:scale-110 ${isCallMinimized ? 'h-10 w-10' : 'h-14 w-14'}`}
                  >
                    <PhoneOff className={isCallMinimized ? 'h-4 w-4' : 'h-5 w-5'} />
                  </button>
                  {!isCallMinimized && (
                    <span className="text-[10px] font-medium text-white/60">End</span>
                  )}
                </div>
              </>
            )}

            {/* Minimize Button */}
            {!isCallMinimized && (
              <div className="flex flex-col items-center gap-1.5 absolute top-6 right-6">
                <button
                  onClick={() => setIsCallMinimized(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 ring-1 ring-white/20"
                >
                  <Minus className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {chatToClose !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-sm rounded-xl shadow-lg border overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-6">
              <h3 className="text-lg font-semibold tracking-tight">Close Chat</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Are you sure you want to close this chat? This action cannot be undone.
              </p>
            </div>
            <div className="p-4 bg-muted/50 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setChatToClose(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmClose}>
                Close Chat
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Conversation({
  messages,
  currentEntityId,
  inputValue,
  setInputValue,
  onSend,
  onForward,
  onToggleReaction,
  onTogglePin,
  onSendFileP2P,
  transferStatus = 'idle',
  fileInfo,
  transferProgress,
  transferRemoteName,
  transferPartnerName,
  onAcceptFileOffer,
  onRejectFileOffer,
  onCancelTransfer,
  placeholder,
  disabled,
  emptyState,
  isGroup,
  smartReplies,
  onSmartReplyClick,
  activeChat,
  onTakeOver,
  onTyping,
  isTyping,
  typingPartnerName,
  isPartnerOnlineOrIdle,
}: {
  messages: any[];
  currentEntityId?: string;
  inputValue: string;
  setInputValue: (val: string) => void;
  onSend: (val: string) => void;
  onForward?: (val: string) => void;
  onToggleReaction?: (messageId: number, emoji: string) => void;
  onTogglePin?: (messageId: number, currentPinStatus: boolean) => void;
  onSendFileP2P?: (file: File) => void;
  transferStatus?: TransferStatus;
  fileInfo?: FileInfo | null;
  transferProgress?: { sent: number; received: number; total: number };
  transferRemoteName?: string | null;
  transferPartnerName?: string | null;
  onAcceptFileOffer?: () => void;
  onRejectFileOffer?: () => void;
  onCancelTransfer?: () => void;
  placeholder?: string;
  disabled?: boolean;
  emptyState?: React.ReactNode;
  isGroup?: boolean;
  smartReplies?: string[];
  onSmartReplyClick?: (reply: string) => void;
  activeChat?: any;
  onTakeOver?: (chatId: number) => void;
  onTyping?: () => void;
  isTyping?: boolean;
  typingPartnerName?: string;
  isPartnerOnlineOrIdle?: boolean;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    { name: string; public_url: string; isImage: boolean }[]
  >([]);
  const [replyingTo, setReplyingTo] = useState<{
    id: number;
    message_text: string;
    sender_name?: string;
  } | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showAISuggestions, setShowAISuggestions] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const p2pFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(-1);
  const prevEntityIdRef = useRef(currentEntityId);
  const transferBytes = transferProgress ? transferProgress.sent || transferProgress.received : 0;
  const transferTotal = fileInfo?.size || transferProgress?.total || 0;
  const transferPercent =
    transferTotal > 0 ? Math.min(100, Math.round((transferBytes / transferTotal) * 100)) : 0;

  useEffect(() => {
    if (currentEntityId !== prevEntityIdRef.current) {
      prevMessageCountRef.current = -1;
      prevEntityIdRef.current = currentEntityId;
    }

    if (messagesEndRef.current && messages.length > 0) {
      if (prevMessageCountRef.current === -1) {
        // Initial load or switched chats — jump to bottom instantly
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      } else if (messages.length > prevMessageCountRef.current) {
        // New messages arrived — smooth scroll
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, currentEntityId]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;
    let file = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        file = items[i].getAsFile();
        break;
      }
    }
    if (file) {
      event.preventDefault();
      await processFile(file);
    }
  };

  const processFile = async (file: File) => {
    try {
      setIsUploading(true);
      const base64 = await fileToBase64(file);
      const res = await uploadChatAttachment({
        data: { originalFilename: file.name, mimeType: file.type as any, base64 },
      });
      const isImage = file.type.startsWith('image/');
      setPendingAttachments((prev) => [
        ...prev,
        { name: file.name, public_url: res.public_url, isImage },
      ]);
    } catch (e: any) {
      alert(e.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const insertTextAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setInputValue(`${inputValue}${text}`);
      return;
    }

    const start = textarea.selectionStart ?? inputValue.length;
    const end = textarea.selectionEnd ?? inputValue.length;
    const nextValue = `${inputValue.slice(0, start)}${text}${inputValue.slice(end)}`;
    setInputValue(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const nextCursor = start + text.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const sendGif = (gif: { label: string; url: string }) => {
    onSend(`![${gif.label} GIF](${gif.url})`);
    setShowGifPicker(false);
  };

  const handleSend = () => {
    let finalMsg = inputValue.trim();
    if (replyingTo) {
      const quoteText = replyingTo.message_text
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
      finalMsg = `${quoteText}\n\n${finalMsg}`;
    }
    if (pendingAttachments.length > 0) {
      const attachmentsText = pendingAttachments
        .map((att) =>
          att.isImage ? `![${att.name}](${att.public_url})` : `[${att.name}](${att.public_url})`,
        )
        .join('\n');
      finalMsg = finalMsg ? `${finalMsg}\n${attachmentsText}` : attachmentsText;
    }
    if (!finalMsg.trim()) return;
    onSend(finalMsg.trim());
    setPendingAttachments([]);
    setReplyingTo(null);
    setShowEmojiPicker(false);
    setShowGifPicker(false);
  };
  const needsMayaTakeover = Boolean(
    activeChat && (activeChat.agent_id === 0 || activeChat.agent_id === null) && onTakeOver,
  );
  const renderReactionPicker = (messageId: number) => {
    if (!onToggleReaction) return null;
    return (
      <div className="flex items-center gap-1 rounded-full border border-white/20 bg-background/80 p-1 shadow-lg backdrop-blur-md">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onToggleReaction(messageId, emoji)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:-translate-y-1 hover:scale-125 hover:bg-primary/10"
            title={`React ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    );
  };

  const renderReactionSummary = (msg: any, isMe: boolean) => {
    const reactions = Array.isArray(msg.reactions) ? msg.reactions : [];
    if (reactions.length === 0) return null;
    return (
      <div className={`mt-1 flex flex-wrap gap-1 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
        {reactions.map((reaction: { emoji: string; count: number; isMine?: boolean }) => (
          <button
            key={reaction.emoji}
            onClick={() => onToggleReaction?.(msg.id, reaction.emoji)}
            className={`group flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-sm backdrop-blur-sm transition-all hover:scale-105 ${
              reaction.isMine
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-background/50 text-foreground hover:border-primary/30 hover:bg-primary/5'
            }`}
            title={reaction.isMine ? 'Remove reaction' : `React ${reaction.emoji}`}
          >
            <span className="text-sm transition-transform group-hover:scale-110">
              {reaction.emoji}
            </span>
            <span className="font-semibold">{reaction.count}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-4">
        {messages.length === 0 ? (
          <div className="mt-4 text-center text-xs text-muted-foreground">
            {emptyState || 'Send a message to start the conversation.'}
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.message_type === 'system') {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                    {msg.message_text}
                    {formatChatTime(msg.created_at) && (
                      <span className="ml-1 opacity-70">- {formatChatTime(msg.created_at)}</span>
                    )}
                  </div>
                </div>
              );
            }
            const senderRole =
              msg.sender_role || (msg.sender_id === currentEntityId ? 'me' : 'team');
            const isSupportConversation = Boolean(activeChat);
            const isMe =
              msg.sender_id === currentEntityId ||
              (isSupportConversation && (senderRole === 'team' || senderRole === 'maya'));
            const senderLabel =
              senderRole === 'maya'
                ? 'Maya'
                : msg.sender_id === currentEntityId
                  ? 'You'
                  : msg.sender_name || (senderRole === 'customer' ? 'Customer' : 'Team');
            const sentAt = formatChatTime(msg.created_at);
            const isLongText = msg.message_text.replace(/\s+/g, ' ').trim().length > 12;
            const bubbleClass = isMe
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : senderRole === 'customer'
                ? 'bg-white text-foreground border border-border rounded-tl-sm'
                : senderRole === 'maya'
                  ? 'bg-violet-50 text-violet-950 border border-violet-100 rounded-tl-sm'
                  : 'bg-muted/60 text-foreground border border-border/60 rounded-tl-sm';
            return (
              <div
                key={msg.id}
                className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="relative max-w-[82%] min-w-0">
                  {isMe && activeMessageId === msg.id && (
                    <div className="absolute right-0 -top-10 z-20 flex items-center gap-1 rounded-full border bg-card px-2 py-1 shadow-md">
                      {renderReactionPicker(msg.id)}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMessageId(null);
                        }}
                        className="p-1 hover:bg-muted rounded-full"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {!isMe && (
                    <div
                      className={`mb-1 ml-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide ${senderRole === 'customer' ? 'text-blue-600' : senderRole === 'maya' ? 'text-violet-600' : 'text-muted-foreground'}`}
                    >
                      {senderRole === 'maya' && <Bot className="h-3 w-3" />}
                      {senderRole === 'customer' && <User className="h-3 w-3" />}
                      <span>{senderLabel}</span>
                    </div>
                  )}
                  <div
                    onClick={() => setActiveMessageId(activeMessageId === msg.id ? null : msg.id)}
                    className={`group/bubble relative max-w-full rounded-2xl p-3 shadow-sm break-words cursor-pointer ${isLongText ? 'min-w-[150px]' : ''} ${bubbleClass} ${msg.is_pinned ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                  >
                    {renderMessage(msg.message_text, isMe)}
                  </div>
                  {renderReactionSummary(msg, isMe)}
                  <div
                    className={`mt-1 flex items-center gap-2 px-1 text-[10px] text-muted-foreground ${isMe ? 'justify-end text-right flex-row-reverse' : 'justify-start text-left'}`}
                  >
                    <span>
                      {senderLabel}
                      {sentAt ? ` - ${sentAt}` : ''}
                    </span>
                    {isMe && msg.read_at && (
                      <span
                        className="font-medium text-emerald-500 tracking-tighter"
                        title={`Seen ${formatChatTime(msg.read_at)}`}
                      >
                        ✓✓
                      </span>
                    )}
                    {isMe && !msg.read_at && (
                      <span
                        className="font-medium tracking-tighter text-muted-foreground"
                        title={msg.delivered_at ? 'Delivered' : 'Sent'}
                      >
                        {msg.delivered_at ? '✓✓' : '✓'}
                      </span>
                    )}

                    <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() =>
                          setReplyingTo({
                            id: msg.id,
                            message_text: msg.message_text,
                            sender_name: senderLabel,
                          })
                        }
                        className="rounded p-1 hover:text-foreground hover:bg-muted"
                        title="Reply"
                      >
                        <Reply className="h-3 w-3" />
                      </button>
                      {onForward && (
                        <button
                          onClick={() => onForward(msg.message_text)}
                          className="rounded p-1 hover:text-foreground hover:bg-muted"
                          title="Forward"
                        >
                          <Share2 className="h-3 w-3" />
                        </button>
                      )}
                      {onTogglePin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(msg.id, !!msg.is_pinned);
                          }}
                          className={`rounded p-1 hover:text-foreground hover:bg-muted ${msg.is_pinned ? 'text-primary opacity-100' : ''}`}
                          title="Pin"
                        >
                          <Pin className="h-3 w-3" fill={msg.is_pinned ? 'currentColor' : 'none'} />
                        </button>
                      )}
                    </div>
                  </div>
                  {!isMe && activeMessageId === msg.id && (
                    <div className="absolute left-0 -top-10 z-20 flex items-center gap-1 rounded-full border bg-card px-2 py-1 shadow-md">
                      {renderReactionPicker(msg.id)}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMessageId(null);
                        }}
                        className="p-1 hover:bg-muted rounded-full"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {isTyping && typingPartnerName && (
          <div className="flex items-center gap-2 text-muted-foreground mt-4 mb-2 px-2 text-xs animate-in fade-in slide-in-from-bottom-1">
            <div className="flex items-center gap-1 bg-muted/50 rounded-full px-3 py-2 shadow-sm border border-border/50">
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
            <span className="font-medium opacity-80">{typingPartnerName} is typing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="relative flex flex-col border-t bg-card p-3">
        {needsMayaTakeover && (
          <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-2 text-center">
            <Button
              size="sm"
              onClick={() => onTakeOver?.(activeChat.id)}
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm w-full"
            >
              <Bot className="mr-2 h-4 w-4" />
              Take Over from Maya
            </Button>
            <p className="mt-1 text-[10px] font-medium text-emerald-700">
              Maya is replying. Take over to type manually.
            </p>
          </div>
        )}
        {/* AI Smart Reply Chips */}
        {showAISuggestions && smartReplies && smartReplies.length > 0 && onSmartReplyClick && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  AI Suggestions
                </span>
              </div>
              <button
                onClick={() => setShowAISuggestions(false)}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted"
                title="Turn off AI Suggestions"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {smartReplies.map((reply, i) => (
                <button
                  key={i}
                  onClick={() => onSmartReplyClick(reply)}
                  className="text-left rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors line-clamp-2"
                >
                  {reply}
                </button>
              ))}
            </div>
          </div>
        )}
        {replyingTo && (
          <div className="mb-2 flex items-start justify-between rounded-md border-l-4 border-primary bg-muted p-2 text-xs">
            <div className="flex-1 overflow-hidden">
              <span className="font-bold text-primary">{replyingTo.sender_name}</span>
              <p className="truncate text-muted-foreground">{replyingTo.message_text}</p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="ml-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingAttachments.map((att, i) => (
              <div key={i} className="relative group rounded-md overflow-hidden border bg-muted">
                {att.isImage ? (
                  <img src={att.public_url} alt={att.name} className="h-14 w-14 object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center p-2 text-[8px] text-center font-semibold overflow-hidden">
                    {att.name}
                  </div>
                )}
                <button
                  onClick={() =>
                    setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="absolute top-0.5 right-0.5 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {transferStatus !== 'idle' && fileInfo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1.5 text-xs shadow-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600">
              {transferStatus === 'completed' ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <FileIcon className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{fileInfo.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatFileSize(fileInfo.size)}
                </span>
              </div>
              {transferStatus === 'connecting' || transferStatus === 'transferring' ? (
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${Math.max(3, transferPercent)}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-[10px] text-muted-foreground">
                    {formatFileSize(transferBytes)} · {transferPercent}%
                  </span>
                </div>
              ) : (
                <div className="truncate text-[10px] text-muted-foreground">
                  {transferStatus === 'receiving_offer' &&
                    `${transferRemoteName || 'Someone'} wants to send this file`}
                  {transferStatus === 'offering' &&
                    `Waiting for ${transferPartnerName || 'recipient'} to accept`}
                  {transferStatus === 'completed' && 'Transfer complete'}
                  {transferStatus === 'failed' && 'Transfer failed'}
                </div>
              )}
            </div>
            {transferStatus === 'receiving_offer' && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={onRejectFileOffer}
                >
                  Decline
                </Button>
                <Button size="sm" className="h-7 px-2 text-xs" onClick={onAcceptFileOffer}>
                  Accept
                </Button>
              </div>
            )}
            {(transferStatus === 'offering' ||
              transferStatus === 'connecting' ||
              transferStatus === 'transferring') && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={onCancelTransfer}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
        <div className="flex items-center gap-1 rounded-[24px] bg-muted/60 p-1 pl-2 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <div className="relative flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
              onClick={() => {
                setShowEmojiPicker((open) => !open);
                setShowGifPicker(false);
              }}
              disabled={disabled || isUploading}
              title="Emoji"
            >
              <Smile className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            {showEmojiPicker && (
              <div className="absolute bottom-11 left-0 z-20 grid w-[260px] grid-cols-6 gap-2 rounded-2xl border border-white/10 bg-background/80 p-3 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-2">
                {COMPOSER_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => insertTextAtCursor(emoji)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl transition-all hover:scale-125 hover:bg-primary/10 hover:shadow-sm"
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
              onClick={() => {
                setShowGifPicker((open) => !open);
                setShowEmojiPicker(false);
              }}
              disabled={disabled || isUploading}
              title="GIF"
            >
              <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            {showGifPicker && (
              <div className="absolute bottom-11 left-0 z-20 grid w-56 grid-cols-2 gap-2 rounded-lg border bg-card p-2 shadow-lg">
                {CURATED_GIFS.map((gif) => (
                  <button
                    key={gif.url}
                    onClick={() => sendGif(gif)}
                    className="overflow-hidden rounded-md border bg-muted text-left hover:border-primary"
                    title={gif.label}
                  >
                    <img src={gif.url} alt={gif.label} className="h-16 w-full object-cover" />
                    <span className="block truncate px-1.5 py-1 text-[10px] font-semibold">
                      {gif.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {onSendFileP2P && (
            <label className="flex-shrink-0">
              <input
                type="file"
                className="sr-only"
                ref={p2pFileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onSendFileP2P(file);
                  if (p2pFileInputRef.current) p2pFileInputRef.current.value = '';
                }}
                disabled={disabled || transferStatus !== 'idle'}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full text-blue-500 hover:bg-blue-500/10 hover:text-blue-600"
                asChild
                disabled={disabled || transferStatus !== 'idle'}
              >
                <span title="Send File Peer-to-Peer (Unlimited Size)">
                  <Zap className="h-5 w-5" strokeWidth={1.5} />
                </span>
              </Button>
            </label>
          )}
          <label className="flex-shrink-0">
            <input
              type="file"
              className="sr-only"
              ref={fileInputRef}
              onChange={handleFileChange}
              disabled={disabled || isUploading}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
              asChild
              disabled={disabled || isUploading}
            >
              <span>
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Paperclip className="h-5 w-5" strokeWidth={1.5} />
                )}
              </span>
            </Button>
          </label>
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              onTyping?.();
            }}
            placeholder={isUploading ? 'Uploading...' : placeholder || 'Type a message...'}
            className="h-9 min-h-9 min-w-0 flex-1 resize-none overflow-hidden whitespace-nowrap bg-transparent border-0 focus-visible:ring-0 shadow-none px-2 py-2 text-sm placeholder:text-muted-foreground"
            disabled={disabled || isUploading}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!disabled && (inputValue.trim() || pendingAttachments.length > 0)) {
                  handleSend();
                }
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            disabled={disabled || isUploading}
            title="Voice message (Coming soon)"
          >
            <Mic className="h-5 w-5" strokeWidth={1.5} />
          </Button>
          <Button
            size="icon"
            onClick={() => handleSend()}
            disabled={
              disabled || (!inputValue.trim() && pendingAttachments.length === 0) || isUploading
            }
            className="h-8 w-8 shrink-0 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm ml-0.5"
          >
            <Send className="h-4 w-4 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function renderMessage(text: string, isMe: boolean = false) {
  if (!text) return null;
  // Parse blockquotes first
  const blocks = text.split(/(?:^|\n)>[^\n]*(?:\n>[^\n]*)*/g);
  const quotes = text.match(/(?:^|\n)>[^\n]*(?:\n>[^\n]*)*/g) || [];

  const renderParts = (partText: string) => {
    const parts = partText.split(/(!?\[.*?\]\(.*?\)|\[PACKAGE:\d+:[^:]+:\d+\])/g);
    return parts.map((part, i) => {
      const pkgMatch = part.match(/^\[PACKAGE:(\d+):([^:]+):(\d+)\]$/);
      if (pkgMatch) {
        const pkgId = pkgMatch[1];
        const pkgName = pkgMatch[2];
        const pkgPrice = parseInt(pkgMatch[3]).toLocaleString('en-IN');
        return (
          <div
            key={i}
            className="my-3 p-3 rounded-xl border border-primary/20 bg-background shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group/card"
          >
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover/card:opacity-20 transition-opacity">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-package"
              >
                <path d="m7.5 4.27 9 5.15" />
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="m3.3 7 8.7 5 8.7-5" />
                <path d="M12 22V12" />
              </svg>
            </div>
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" /> Recommended Package
            </div>
            <div className="font-bold text-foreground text-sm mb-1 line-clamp-2 pr-8">
              {pkgName}
            </div>
            <div className="text-emerald-600 font-bold text-sm mb-3">
              ₹{pkgPrice}{' '}
              <span className="text-xs text-muted-foreground font-medium">/ person</span>
            </div>
            <a
              href={`/packages?id=${pkgId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 shadow-sm"
            >
              View Package Details
            </a>
          </div>
        );
      }

      const imgMatch = part.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (imgMatch) {
        return (
          <a
            key={i}
            href={imgMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="block mt-1 mb-1"
          >
            <img
              src={imgMatch[2]}
              alt={imgMatch[1]}
              className="max-w-full rounded-md max-h-[150px] object-cover"
            />
          </a>
        );
      }
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        return (
          <a
            key={i}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="block underline font-bold mt-1 mb-1 break-all"
          >
            📎 {linkMatch[1]}
          </a>
        );
      }
      return (
        <span key={i} className="whitespace-pre-wrap break-words">
          {part}
        </span>
      );
    });
  };

  const finalElements = [];
  let blockIndex = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].trim()) finalElements.push(<div key={`text-${i}`}>{renderParts(blocks[i])}</div>);
    if (quotes[blockIndex]) {
      const quoteText = quotes[blockIndex].replace(/(?:^|\n)> ?/g, '\n').trim();
      finalElements.push(
        <div
          key={`quote-${blockIndex}`}
          className={`mb-2 mt-1 rounded border-l-2 pl-2 text-xs italic ${isMe ? 'border-primary-foreground/50 bg-primary-foreground/10 text-primary-foreground/80' : 'border-primary/50 bg-muted/50 text-muted-foreground'}`}
        >
          {renderParts(quoteText)}
        </div>,
      );
      blockIndex++;
    }
  }
  return <div className="space-y-1">{finalElements}</div>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
