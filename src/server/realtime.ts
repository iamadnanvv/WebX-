import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyAuthToken } from './auth.ts';

export type RealtimeEventType =
  | 'ledger:updated'
  | 'accounts:updated'
  | 'rates:updated'
  | 'closing:updated'
  | 'staff:updated'
  | 'settings:updated'
  | 'activity:updated'
  | 'support:updated';

export interface RealtimeEvent {
  type: RealtimeEventType;
  entityId?: string | number;
  timestamp: string;
  adminOnly?: boolean;
}

interface AuthenticatedSocket extends WebSocket {
  isAuthenticated?: boolean;
  isAlive?: boolean;
  userId?: number;
  role?: 'ADMIN' | 'STAFF';
}

let wss: WebSocketServer | null = null;

export function initRealtimeServer(httpServer: HttpServer): void {
  if (wss) return;

  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket: AuthenticatedSocket) => {
    socket.isAuthenticated = false;
    socket.isAlive = true;

    const authTimeout = setTimeout(() => {
      if (!socket.isAuthenticated) {
        socket.close(4001, 'Authentication timeout');
      }
    }, 5000);

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString('utf8'));
        if (msg?.type === 'auth') {
          const token = typeof msg.token === 'string' ? msg.token : '';
          let user = null;
          try {
            user = token ? await verifyAuthToken(token) : null;
          } catch {
            user = null;
          }
          if (!user) {
            socket.close(4003, 'Unauthorized');
            return;
          }
          clearTimeout(authTimeout);
          socket.isAuthenticated = true;
          socket.userId = user.id;
          socket.role = user.role;
          socket.send(
            JSON.stringify({
              type: 'connected',
              userId: user.id,
              role: user.role,
              timestamp: new Date().toISOString(),
            })
          );
        }
      } catch {
        // Ignore malformed packets
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimeout);
    });
  });

  const heartbeat = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((client) => {
      const ws = client as AuthenticatedSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });
}

export function broadcastRealtimeEvent(
  type: RealtimeEventType,
  options?: { entityId?: string | number; adminOnly?: boolean }
): void {
  if (!wss) return;
  const payload: RealtimeEvent = {
    type,
    entityId: options?.entityId,
    timestamp: new Date().toISOString(),
    adminOnly: options?.adminOnly,
  };
  const serialized = JSON.stringify(payload);

  wss.clients.forEach((client) => {
    const ws = client as AuthenticatedSocket;
    if (ws.readyState !== WebSocket.OPEN || !ws.isAuthenticated) return;
    if (options?.adminOnly && ws.role !== 'ADMIN') return;
    ws.send(serialized);
  });
}
