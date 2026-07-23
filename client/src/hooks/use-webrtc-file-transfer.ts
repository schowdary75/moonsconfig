import { useState, useRef, useCallback } from 'react';

type TransferStatus =
  'idle' | 'offering' | 'receiving_offer' | 'connecting' | 'transferring' | 'completed' | 'failed';

export interface FileInfo {
  name: string;
  size: number;
  type: string;
}

const CHUNK_SIZE = 16384; // 16 KB for reliable DataChannel transfer

export function useWebRTCFileTransfer(onSendSignal: (type: string, payload: any) => void) {
  const [transferStatus, _setTransferStatus] = useState<TransferStatus>('idle');
  const transferStatusRef = useRef<TransferStatus>('idle');
  const setTransferStatus = useCallback((status: TransferStatus) => {
    transferStatusRef.current = status;
    _setTransferStatus(status);
  }, []);

  const [fileInfo, _setFileInfo] = useState<FileInfo | null>(null);
  const fileInfoRef = useRef<FileInfo | null>(null);
  const setFileInfo = useCallback((info: FileInfo | null) => {
    fileInfoRef.current = info;
    _setFileInfo(info);
  }, []);

  const [remoteName, setRemoteName] = useState<string | null>(null);
  const [progress, setProgress] = useState({ sent: 0, received: 0, total: 0 });
  const [incomingOffer, setIncomingOffer] = useState<any>(null);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const incomingCandidates = useRef<any[]>([]);
  const isIntentionalClose = useRef(false);

  // File sending state
  const fileToSend = useRef<File | null>(null);
  const fileReader = useRef<FileReader | null>(null);
  const sendOffset = useRef(0);

  // File receiving state
  const receivedBuffers = useRef<ArrayBuffer[]>([]);
  const receivedBytes = useRef(0);
  const fileHandle = useRef<any>(null); // FileSystemWritableFileStream
  const writableStream = useRef<any>(null);

  const cleanup = useCallback(() => {
    isIntentionalClose.current = true;
    if (dataChannel.current) {
      dataChannel.current.close();
      dataChannel.current = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (fileReader.current && fileReader.current.readyState === FileReader.LOADING) {
      fileReader.current.abort();
    }
    if (fileReader.current) {
      fileReader.current = null;
    }
    if (writableStream.current) {
      writableStream.current.close().catch(console.error);
      writableStream.current = null;
    }
    setTransferStatus('idle');
    setFileInfo(null);
    setRemoteName(null);
    setProgress({ sent: 0, received: 0, total: 0 });
    setIncomingOffer(null);
    incomingCandidates.current = [];
    fileToSend.current = null;
    sendOffset.current = 0;
    receivedBuffers.current = [];
    receivedBytes.current = 0;
    fileHandle.current = null;
    window.setTimeout(() => {
      isIntentionalClose.current = false;
    }, 0);
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
        onSendSignal('FILE_ICE', event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (isIntentionalClose.current) return;
      if (pc.connectionState === 'failed') {
        if (!['completed', 'idle'].includes(transferStatusRef.current)) setTransferStatus('failed');
      }
      if (pc.connectionState === 'closed') {
        if (!['completed', 'idle', 'failed'].includes(transferStatusRef.current))
          setTransferStatus('failed');
      }
    };

    return pc;
  }, [onSendSignal, setTransferStatus]);

  const sendChunk = useCallback(() => {
    if (!fileToSend.current || !dataChannel.current) return;

    const file = fileToSend.current;
    if (sendOffset.current >= file.size) return;

    const chunk = file.slice(sendOffset.current, sendOffset.current + CHUNK_SIZE);
    if (!fileReader.current) fileReader.current = new FileReader();

    fileReader.current.onload = (e) => {
      if (!dataChannel.current || dataChannel.current.readyState !== 'open') return;
      if (e.target?.result) {
        dataChannel.current.send(e.target.result as ArrayBuffer);
        sendOffset.current += chunk.size;
        setProgress((prev) => ({ ...prev, sent: sendOffset.current }));

        if (sendOffset.current >= file.size) {
          setTransferStatus('completed');
          setTimeout(() => cleanup(), 3000);
          return;
        }

        if (dataChannel.current.bufferedAmount < dataChannel.current.bufferedAmountLowThreshold) {
          sendChunk();
        }
      }
    };
    fileReader.current.onerror = () => setTransferStatus('failed');
    fileReader.current.readAsArrayBuffer(chunk);
  }, [cleanup, setTransferStatus]);

  const setupDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dc.binaryType = 'arraybuffer';
      dc.bufferedAmountLowThreshold = 65536; // 64 KB
      dc.onbufferedamountlow = sendChunk;

      dc.onopen = () => {
        setTransferStatus('transferring');
        if (fileToSend.current) {
          sendOffset.current = 0;
          sendChunk();
        }
      };

      dc.onmessage = async (event) => {
        const data = event.data as ArrayBuffer;
        receivedBytes.current += data.byteLength;
        setProgress((prev) => ({ ...prev, received: receivedBytes.current }));

        if (writableStream.current) {
          await writableStream.current.write(data);
        } else {
          receivedBuffers.current.push(data);
        }

        if (fileInfoRef.current && receivedBytes.current >= fileInfoRef.current.size) {
          setTransferStatus('completed');
          if (writableStream.current) {
            await writableStream.current.close();
            writableStream.current = null;
          } else {
            // Fallback download if File System API is not supported
            const blob = new Blob(receivedBuffers.current, { type: fileInfoRef.current.type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileInfoRef.current.name;
            a.click();
            URL.revokeObjectURL(url);
          }
          setTimeout(() => cleanup(), 3000);
        }
      };

      dc.onclose = () => {
        if (
          !isIntentionalClose.current &&
          !['completed', 'idle'].includes(transferStatusRef.current)
        ) {
          setTransferStatus('failed');
        }
      };
    },
    [sendChunk, cleanup, setTransferStatus],
  );

  const sendFileOffer = useCallback(
    async (file: File) => {
      if (transferStatusRef.current !== 'idle') return;
      try {
        isIntentionalClose.current = false;
        fileToSend.current = file;
        const info = { name: file.name, size: file.size, type: file.type };
        setFileInfo(info);
        setProgress({ sent: 0, received: 0, total: file.size });
        setTransferStatus('offering');

        const pc = createPeerConnection();
        peerConnection.current = pc;

        const dc = pc.createDataChannel('fileTransfer');
        dataChannel.current = dc;
        setupDataChannel(dc);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        onSendSignal('FILE_OFFER', { offer, fileInfo: info });
      } catch (e) {
        console.error('Failed to start file transfer', e);
        cleanup();
      }
    },
    [createPeerConnection, onSendSignal, setupDataChannel, cleanup],
  );

  const acceptFileOffer = useCallback(async () => {
    if (!peerConnection.current || !incomingOffer) return;
    try {
      isIntentionalClose.current = false;
      setTransferStatus('connecting');

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileInfo?.name,
          });
          fileHandle.current = handle;
          writableStream.current = await handle.createWritable();
        } catch (e) {
          console.warn('User cancelled save picker or not supported, falling back to memory blob');
        }
      }

      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      for (const candidate of incomingCandidates.current) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
      incomingCandidates.current = [];

      onSendSignal('FILE_ANSWER', answer);
    } catch (e) {
      console.error('Failed to accept file offer', e);
      cleanup();
    }
  }, [incomingOffer, fileInfo, onSendSignal, cleanup]);

  const rejectFileOffer = useCallback(() => {
    onSendSignal('FILE_REJECT', null);
    cleanup();
  }, [onSendSignal, cleanup]);

  const cancelTransfer = useCallback(() => {
    onSendSignal('FILE_CANCEL', null);
    cleanup();
  }, [onSendSignal, cleanup]);

  const handleSignal = useCallback(
    async (type: string, payload: any, fromName: string) => {
      if (type === 'FILE_OFFER') {
        if (transferStatusRef.current !== 'idle') {
          onSendSignal('FILE_BUSY', null);
          return;
        }
        isIntentionalClose.current = false;
        setRemoteName(fromName);
        setFileInfo(payload.fileInfo);
        setProgress({ sent: 0, received: 0, total: payload.fileInfo.size });
        setIncomingOffer(payload.offer);
        setTransferStatus('receiving_offer');

        const pc = createPeerConnection();
        peerConnection.current = pc;

        pc.ondatachannel = (event) => {
          dataChannel.current = event.channel;
          setupDataChannel(event.channel);
        };
      } else if (type === 'FILE_ANSWER') {
        if (!peerConnection.current) return;
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(payload));
        setTransferStatus('connecting');

        for (const candidate of incomingCandidates.current) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
        incomingCandidates.current = [];
      } else if (type === 'FILE_ICE') {
        // Do NOT use transferStatus here — React stale closures cause candidates to be queued forever
        if (!peerConnection.current || !peerConnection.current.remoteDescription) {
          incomingCandidates.current.push(payload);
          return;
        }
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(payload));
        } catch (e) {
          console.error('Error adding file ice candidate', e);
        }
      } else if (['FILE_REJECT', 'FILE_CANCEL', 'FILE_BUSY'].includes(type)) {
        cleanup();
      }
    },
    [createPeerConnection, setupDataChannel, onSendSignal, cleanup],
  );

  return {
    transferStatus,
    fileInfo,
    progress,
    remoteName,
    sendFileOffer,
    acceptFileOffer,
    rejectFileOffer,
    cancelTransfer,
    handleSignal,
  };
}
