import { afterEach } from 'vitest';

/**
 * Lets the worker's timers and RPC run between synchronous tests, so a long file never starves vitest's heartbeat.
 * It only helps between tests: a single test that blocks past the worker RPC timeout (about 60 s) brings the
 * "Timeout calling onTaskUpdate" error back, so keep long matrices split into short tests.
 */
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
