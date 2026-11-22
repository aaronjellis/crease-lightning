import { afterEach } from 'vitest';

/** Lets the worker's timers and RPC run between synchronous tests, so a long file never starves vitest's heartbeat. */
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
