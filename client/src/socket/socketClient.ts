import { io, type Socket } from 'socket.io-client';
import { SOCKET_ENABLED } from '../constants/app';
import { tokenStore } from '../api/tokenStore';

let socket: Socket | null = null;
export function getSocket(): Socket | null {
  if (!SOCKET_ENABLED) return null;
  // Prefer the tenant-scoped JWT so staff and customers join the same rooms.
  // The legacy session remains a compatibility fallback.
  socket ??= io({
    autoConnect: false,
    auth: (callback) =>
      callback({ token: tokenStore.get() || localStorage.getItem('crm_session') }),
  });
  return socket;
}
