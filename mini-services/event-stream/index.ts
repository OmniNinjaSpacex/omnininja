/**
 * OmniNinja — Event Stream WebSocket Gateway (Seção 9 / Seção 11.2)
 *
 * Two planes on one process:
 *  - DATA plane: socket.io on port 3003, path '/' (required by Caddy gateway).
 *    Frontend connects via io("/?XTransformPort=3003") and subscribes to
 *    `task:{taskId}` channels to receive agent events.
 *  - CONTROL plane: plain HTTP on port 3004 (internal) for /health and /emit
 *    (used by the orchestrator worker in production to publish events).
 *
 * Split is necessary because socket.io with path '/' intercepts all requests
 * on its port, so custom HTTP routes need a separate listener.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { Server } from 'socket.io';

const IO_PORT = 3003;
const CTRL_PORT = 3004;

/* ---------------- Data plane: socket.io ---------------- */
const httpServer = createServer();
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on('connection', (socket) => {
  socket.on('subscribe', (data: { taskId?: string }) => {
    if (!data?.taskId) return;
    socket.join(`task:${data.taskId}`);
    socket.emit('subscribed', { taskId: data.taskId });
  });
  socket.on('unsubscribe', (data: { taskId?: string }) => {
    if (!data?.taskId) return;
    socket.leave(`task:${data.taskId}`);
  });
  socket.on('ping', () => socket.emit('pong', { ts: Date.now() }));
});

httpServer.listen(IO_PORT, () => {
  console.log(`OmniNinja Event Stream (socket.io) listening on :${IO_PORT}`);
});

/* ---------------- Control plane: HTTP ---------------- */
const ctrlServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'omninja-event-stream',
      ioPort: IO_PORT,
      ctrlPort: CTRL_PORT,
      rooms: io.sockets.adapter.rooms.size,
      sockets: io.sockets.sockets.size,
    }));
    return;
  }

  // POST /emit { taskId, event } → broadcast to subscribers of task:{taskId}
  if (req.method === 'POST' && req.url === '/emit') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const { taskId, event } = JSON.parse(body);
      if (!taskId || !event) { res.writeHead(400); res.end('taskId and event required'); return; }
      io.to(`task:${taskId}`).emit('event', { taskId, event });
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, delivered: true }));
    } catch {
      res.writeHead(400); res.end('invalid json');
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found', endpoints: ['GET /health', 'POST /emit'] }));
});

ctrlServer.listen(CTRL_PORT, () => {
  console.log(`OmniNinja Event Stream (control HTTP) listening on :${CTRL_PORT}`);
});

/* ---------------- graceful shutdown ---------------- */
const shutdown = (sig: string) => () => {
  console.log(`Received ${sig}, shutting down…`);
  io.close();
  httpServer.close();
  ctrlServer.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));
