'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

/**
 * Connects to the OmniNinja Event Stream WebSocket gateway (port 3003).
 * Frontend ALWAYS uses io("/?XTransformPort=3003") per gateway rules.
 * In the demo, events are replayed client-side; this hook makes the
 * real-time channel functional so production wiring is drop-in.
 */
export function useEventStream(taskId: string | null) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!taskId) return;
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('subscribe', { taskId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('reconnect', () => setConnected(true));
    socket.on('event', (data: any) => setLastEvent(data));

    return () => {
      socket.emit('unsubscribe', { taskId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [taskId]);

  return { connected, lastEvent };
}
