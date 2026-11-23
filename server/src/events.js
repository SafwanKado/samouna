import { EventEmitter } from 'node:events';

// In-process bus: routes publish domain events after COMMIT, the WebSocket
// hub fans them out. Swap for Postgres LISTEN/NOTIFY or Redis when running
// more than one API instance.
export const bus = new EventEmitter();
bus.setMaxListeners(50);

export function publish(channel, event) {
  bus.emit('publish', { channel, event });
}
