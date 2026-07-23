import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../logger/index.js';
import { verifyAccessToken } from '../services/tokenService.js';
import { ensureRedis, redis } from '../config/redis.js';
import { identityOperationRepository } from '../repositories/identityOperationRepository.js';
import { sha256 } from '../utils/crypto.js';
import { CHAT_EVENTS_CHANNEL, type ChatEventMessage } from '../services/chatEventService.js';
import { isCorsOriginAllowed } from '../utils/corsOrigin.js';
import { TRIP_EVENTS_CHANNEL, type TripEventMessage } from '../services/tripEventService.js';

let io: Server | null = null;
const OPERATIONS_PRESENCE_CHANNEL = 'moonsconfig:operations-presence';
const PRESENCE_TTL_MS = 45_000;
const customerScopes = new Map<string, { tenantId?: string; connections: number }>();

interface OperationsPresenceMessage {
  tenantId?: string;
  payload: { online: boolean; connectedAgents: number };
}

interface SocketAuth {
  sub: string;
  principalType: 'crm_user' | 'customer_user';
  tenantId?: string;
}

async function authenticateHandshake(token: string): Promise<SocketAuth | null> {
  if (!token) return null;
  try {
    const claims = verifyAccessToken(token);
    return {
      sub: String(claims.sub),
      principalType: claims.principalType as SocketAuth['principalType'],
      tenantId: claims.tenantId,
    };
  } catch {
    // The CRM SPA authenticates with a legacy session token, not a JWT.
    const session = await identityOperationRepository.findSession(sha256(token));
    if (session) return { sub: String(session.user.id), principalType: 'crm_user' };
    return null;
  }
}

function roomScope(tenantId?: string) {
  return tenantId ? `tenant:${tenantId}:` : 'legacy:';
}

function presenceKey(tenantId?: string) {
  return `moonsconfig:operations-presence:${tenantId ?? 'legacy'}`;
}

async function readPresence(tenantId?: string) {
  await ensureRedis();
  const key = presenceKey(tenantId);
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  await redis.zremrangebyscore(key, 0, cutoff);
  const members = await redis.zrangebyscore(key, cutoff, '+inf');
  const connectedAgents = new Set(members.map((member) => member.split(':', 1)[0])).size;
  return { online: connectedAgents > 0, connectedAgents };
}

async function broadcastPresence(tenantId?: string) {
  const payload = await readPresence(tenantId);
  const message: OperationsPresenceMessage = { tenantId, payload };
  await redis.publish(OPERATIONS_PRESENCE_CHANNEL, JSON.stringify(message));
}

export function initializeSocket(server: HttpServer) {
  if (!env.socketEnabled) return null;
  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        callback(null, isCorsOriginAllowed(origin));
      },
      credentials: true,
    },
    maxHttpBufferSize: 1_000_000,
  });
  io.use((socket, next) => {
    void authenticateHandshake(String(socket.handshake.auth.token || ''))
      .then((auth) => {
        if (!auth) return next(new Error('Unauthorized'));
        socket.data.auth = auth;
        next();
      })
      .catch(() => next(new Error('Unauthorized')));
  });
  io.on('connection', (socket) => {
    const auth = socket.data.auth as SocketAuth;
    const scope = roomScope(auth.tenantId);
    socket.join(`${scope}user:${auth.sub}`);
    // Global-chat entity room (global chat entity ids are stringified user ids).
    socket.join(`${scope}chat:${auth.sub}`);
    if (auth.principalType === 'crm_user') {
      socket.join(`${scope}staff`);
      const key = presenceKey(auth.tenantId);
      const presenceMember = `${auth.sub}:${socket.id}`;
      const refreshPresence = () =>
        ensureRedis()
          .then(() => redis.zadd(key, Date.now(), presenceMember))
          .then(() => broadcastPresence(auth.tenantId))
          .catch((error) => logger.warn('Unable to update operations presence', { error }));
      void refreshPresence();
      const heartbeat = setInterval(refreshPresence, 20_000);
      socket.on('disconnect', () => {
        clearInterval(heartbeat);
        void redis
          .zrem(key, presenceMember)
          .then(() => broadcastPresence(auth.tenantId))
          .catch((error) => logger.warn('Unable to clear operations presence', { error }));
      });
    } else {
      socket.join(`${scope}customers`);
      const current = customerScopes.get(scope);
      customerScopes.set(scope, {
        tenantId: auth.tenantId,
        connections: (current?.connections ?? 0) + 1,
      });
      socket.on('disconnect', () => {
        const entry = customerScopes.get(scope);
        if (!entry || entry.connections <= 1) customerScopes.delete(scope);
        else customerScopes.set(scope, { ...entry, connections: entry.connections - 1 });
      });
      void readPresence(auth.tenantId)
        .then((payload) => socket.emit('operations:presence', payload))
        .catch((error) => logger.warn('Unable to read operations presence', { error }));
    }
    logger.info('Socket connected', {
      tenantId: auth.tenantId,
      userId: auth.sub,
      socketId: socket.id,
    });
  });
  const presenceSweep = setInterval(() => {
    for (const [scope, entry] of customerScopes) {
      void readPresence(entry.tenantId)
        .then((payload) => io?.to(`${scope}customers`).emit('operations:presence', payload))
        .catch((error) => logger.warn('Unable to refresh operations presence', { error }));
    }
  }, 20_000);
  presenceSweep.unref();
  const subscriber = redis.duplicate();
  void subscriber
    .subscribe(
      'moonsconfig:notifications',
      CHAT_EVENTS_CHANNEL,
      TRIP_EVENTS_CHANNEL,
      OPERATIONS_PRESENCE_CHANNEL,
    )
    .then(() => {
      subscriber.on('message', (channel: string, raw: string) => {
        try {
          if (channel === CHAT_EVENTS_CHANNEL) {
            const message = JSON.parse(raw) as ChatEventMessage;
            const scope = message.tenantId ? `tenant:${message.tenantId}:` : 'legacy:';
            for (const recipient of message.recipients ?? [])
              io?.to(`${scope}chat:${recipient}`).emit(message.event, message.payload);
            if (message.staffBroadcast)
              io?.to(`${scope}staff`).emit(message.event, message.payload);
            return;
          }
          if (channel === TRIP_EVENTS_CHANNEL) {
            const message = JSON.parse(raw) as TripEventMessage;
            const scope = roomScope(message.tenantId);
            io?.to(`${scope}user:${message.userId}`).emit(message.event, message.payload);
            if (message.staffBroadcast)
              io?.to(`${scope}staff`).emit(message.event, message.payload);
            return;
          }
          if (channel === OPERATIONS_PRESENCE_CHANNEL) {
            const message = JSON.parse(raw) as OperationsPresenceMessage;
            io?.to(`${roomScope(message.tenantId)}customers`).emit(
              'operations:presence',
              message.payload,
            );
            return;
          }
          const event = JSON.parse(raw) as {
            tenantId?: string;
            userId: number;
            notification: unknown;
          };
          emitNotification(event.userId, event.notification, event.tenantId);
        } catch (error) {
          logger.warn('Invalid pubsub event', { channel, error });
        }
      });
    });
  return io;
}

export function emitNotification(userId: number, notification: unknown, tenantId?: string) {
  const scope = tenantId ? `tenant:${tenantId}:` : 'legacy:';
  io?.to(`${scope}user:${userId}`).emit('notification', notification);
}
