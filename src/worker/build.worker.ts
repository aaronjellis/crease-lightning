/**
 * The build worker: `build()` off the main thread (R30). The page sends one request at a time and
 * gets back a plain `Card`.
 *
 * The listener is registered before anything heavy loads. HarfBuzz starts with a top-level await,
 * and a module worker that is still awaiting drops the messages that arrive meanwhile, so the build
 * code loads with a dynamic import and each message waits for it, in order.
 */
import type { ToWorker } from './protocol';

const ready = import('./handle');
// If the build code can't load, an uncaught error reaches the page's `error` listener, which then
// builds on the page instead.
ready.catch((err) => setTimeout(() => {
  throw err;
}));
let queue: Promise<void> = Promise.resolve();

self.addEventListener('message', (e: MessageEvent<ToWorker>) => {
  queue = queue.then(async () => (await ready).handle(e.data)).catch((err) => console.error(err));
});
