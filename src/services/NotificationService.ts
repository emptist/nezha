import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger.js';

export interface NotificationMessage {
  type: 'health_update' | 'reminder' | 'broadcast' | 'ping' | 'pong';
  data?: unknown;
  content?: string;
  timestamp: string;
}

export interface WsClient {
  id: string;
  ws: WebSocket;
  agentId?: string;
  connectedAt: Date;
  isAlive: boolean;
}

export class NotificationService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WsClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private db: unknown;

  constructor(db: unknown) {
    this.db = db;
  }

  async start(port: number = 4098): Promise<void> {
    if (this.wss) {
      logger.warn('[NotificationService] Already started');
      return;
    }

    this.wss = new WebSocketServer({ port, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      const client: WsClient = {
        id: clientId,
        ws,
        connectedAt: new Date(),
        isAlive: true,
      };
      this.clients.set(clientId, client);
      logger.info(`[NotificationService] Client connected: ${clientId}`);

      ws.on('message', (data: Buffer) => {
        this.handleMessage(clientId, data);
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info(`[NotificationService] Client disconnected: ${clientId}`);
      });

      ws.on('error', (err) => {
        logger.error(`[NotificationService] Client error: ${clientId}`, err);
        this.clients.delete(clientId);
      });

      ws.on('pong', () => {
        const client = this.clients.get(clientId);
        if (client) client.isAlive = true;
      });

      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString(),
      }));
    });

    this.startPingInterval();
    logger.info(`[NotificationService] Started on port ${port}`);
  }

  private handleMessage(clientId: string, data: Buffer): void {
    try {
      const msg = JSON.parse(data.toString()) as { type: string; agentId?: string };
      const client = this.clients.get(clientId);
      if (!client) return;

      switch (msg.type) {
        case 'register':
          client.agentId = msg.agentId;
          logger.info(`[NotificationService] Client registered: ${clientId} as ${msg.agentId}`);
          break;
        case 'ping':
          client.ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
      }
    } catch (err) {
      logger.error(`[NotificationService] Failed to parse message from ${clientId}`, err);
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.clients.forEach((client, id) => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(id);
          return;
        }
        client.isAlive = false;
        client.ws.ping();
      });
    }, 30000);
  }

  async notify(type: NotificationMessage['type'], content: string, data?: unknown): Promise<void> {
    const message: NotificationMessage = {
      type,
      content,
      data,
      timestamp: new Date().toISOString(),
    };

    const payload = JSON.stringify(message);
    let sent = 0;

    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
        sent++;
      }
    });

    logger.debug(`[NotificationService] Sent ${type} to ${sent} clients`);
  }

  async stop(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    this.clients.forEach((client) => {
      client.ws.close();
    });
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info('[NotificationService] Stopped');
  }

  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
