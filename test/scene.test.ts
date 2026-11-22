import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CardScene, type ThreeModules } from '../src/view3d/scene';
import { build } from '../src/core/build';
import { defaultParams } from '../src/core/model';
import { testFonts } from './helpers/fonts';

/** A canvas with no WebGL: getContext gives nothing. */
const fakeCanvas = () =>
  ({ getContext: () => null, addEventListener() {}, removeEventListener() {}, clientWidth: 0, clientHeight: 0 }) as unknown as HTMLCanvasElement;

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('CardScene without 3D', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
  });
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  const card = build(defaultParams('en-US'), { fonts: testFonts() }, 'blade', { strokeCheck: false });

  test('a failed three.js import resolves ready with the error, and every call stays safe', async () => {
    const scene = new CardScene(fakeCanvas(), { load: () => Promise.reject(new Error('import failed')) });
    const seen: number[] = [];
    scene.onTheta = (deg) => seen.push(deg);
    scene.setCard(card);
    scene.setFoldStep(1);
    scene.setTheta(45);
    scene.setFoldStep(null);
    const status = await scene.ready;
    expect(status.ok).toBe(false);
    expect(!status.ok && status.error.message).toBe('import failed');
    await expect(scene.animateTo(120)).resolves.toBeUndefined();
    await expect(scene.renderPng(100, 100, 90, 'front')).rejects.toThrow("3D preview isn't available in this browser: import failed");
    scene.setFoldStep(3);
    await settle();
    // With no frame loop, angles jump: the fold step's 90°, then 45, then 120, then step 4's 180.
    expect(seen).toEqual([45, 90, 120, 180]);
    scene.dispose();
    await settle();
    expect(unhandled).toEqual([]);
  });

  test('real three.js with no WebGL context fails the same way', async () => {
    const scene = new CardScene(fakeCanvas());
    scene.setCard(card);
    scene.setFoldStep(0);
    const status = await scene.ready;
    expect(status.ok).toBe(false);
    expect(!status.ok && status.error).toBeInstanceOf(Error);
    await expect(scene.renderPng(64, 64, 0, 'three-quarter')).rejects.toThrow("3D preview isn't available");
    scene.dispose();
    await settle();
    expect(unhandled).toEqual([]);
  }, 30_000);

  test('dispose before three.js arrives leaves ready resolved, not rejected', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const scene = new CardScene(fakeCanvas(), { load: async () => (await gate, {} as ThreeModules) });
    scene.setCard(card);
    scene.dispose();
    open();
    const status = await scene.ready;
    expect(status.ok).toBe(false);
    expect(!status.ok && status.error.message).toMatch(/closed/);
    await expect(scene.renderPng(64, 64, 90, 'front')).rejects.toThrow("3D preview isn't available");
    await settle();
    expect(unhandled).toEqual([]);
  });
});
