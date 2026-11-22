/**
 * The 3D card: the same panels the export cuts, posed at the opening angle by `poseMatrix`, with the
 * jacket as two slabs hinged at the spine. Borrows Kerfuffle's look (room environment, ACES tone
 * mapping, one sun, damped orbit, a slow idle float).
 *
 * three.js loads by dynamic import, so the app shell and the tests never pull it in. Each panel is
 * built once, flat, in local (u, y, w) with w along its inner-face normal; posing only swaps each
 * mesh's matrix, so dragging the angle never rebuilds geometry.
 *
 * Lifetimes: renderer, environment, materials and controls live until `dispose`; panel geometries
 * live until the next `setCard`.
 */
import type * as T from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Card } from '../core/build';
import { CARD_THICKNESS_MM } from '../core/constants';
import { FOLD_STEPS } from '../core/foldSteps';
import { cardDims } from '../core/model';
import type { PanelFrame } from '../core/types';
import { poseMatrix, viewCamera, type ViewName } from './pose';
import { polyShapes } from './shapes';

type Three = typeof import('three');
type Highlight = (typeof FOLD_STEPS)[number]['highlight'];

/** Per nesting layer, panels sit this far proud of their parent, so coplanar faces never fight. */
const LAYER_GAP_MM = 0.05;
const ANIMATE_MS = 1500;
const FOV_DEG = 35;
const HIGHLIGHT = '#ffb000';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clampTheta = (deg: number) => Math.max(0, Math.min(180, deg));

interface Runtime {
  THREE: Three;
  renderer: T.WebGLRenderer;
  scene: T.Scene;
  env: { texture: T.Texture; dispose(): void };
  camera: T.PerspectiveCamera;
  controls: OrbitControls;
  sun: T.DirectionalLight;
  /** Carries the idle float; sits at the card's middle so it turns about it. */
  rig: T.Group;
  /** The card in world coordinates, offset back by the rig's position. */
  content: T.Group;
  mats: {
    page: T.MeshStandardMaterial;
    strip: T.MeshStandardMaterial;
    jacket: T.MeshStandardMaterial;
    edge: T.LineBasicMaterial;
    spine: T.MeshBasicMaterial;
    ground: T.ShadowMaterial;
  };
  observer: ResizeObserver;
  offscreen: { renderer: T.WebGLRenderer; env: { texture: T.Texture; dispose(): void } } | null;
}

interface Built {
  posed: { obj: T.Object3D; frame: PanelFrame }[];
  geometries: T.BufferGeometry[];
  spine: T.Mesh;
  W: number;
  L: number;
}

interface Animation {
  from: number;
  to: number;
  start: number;
  ms: number;
  resolve: () => void;
}

export class CardScene {
  /** Resolves once three.js has loaded and the renderer exists. */
  readonly ready: Promise<void>;
  /** Called whenever the shown angle changes (dragging, animating), for a slider to follow. */
  onTheta: ((deg: number) => void) | null = null;

  private rt: Runtime | null = null;
  private built: Built | null = null;
  private card: Card | null = null;
  private theta = 0;
  private highlight: Highlight | null = null;
  private anim: Animation | null = null;
  private frame = 0;
  private disposed = false;
  private dragging = false;
  private floatAmp = 1;
  private last = 0;
  private readonly start = typeof performance !== 'undefined' ? performance.now() : 0;
  private framed: { W: number; L: number; radius: number } | null = null;
  private firstShown = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const [THREE, { OrbitControls }, { RoomEnvironment }] = await Promise.all([
      import('three'),
      import('three/examples/jsm/controls/OrbitControls.js'),
      import('three/examples/jsm/environments/RoomEnvironment.js'),
    ]);
    if (this.disposed) return;

    const renderer = this.makeRenderer(THREE, this.canvas, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const env = this.makeEnv(THREE, RoomEnvironment, renderer);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.4;

    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.25;
    scene.add(sun, sun.target);

    const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 1, 10000);
    const controls = new OrbitControls(camera, this.canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.maxPolarAngle = 0.95 * Math.PI;
    controls.addEventListener('start', () => (this.dragging = true));
    controls.addEventListener('end', () => (this.dragging = false));

    const rig = new THREE.Group();
    const content = new THREE.Group();
    rig.add(content);
    scene.add(rig);

    const paper = { roughness: 0.88, metalness: 0 };
    const mats = {
      page: new THREE.MeshStandardMaterial(paper),
      strip: new THREE.MeshStandardMaterial(paper),
      jacket: new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }),
      edge: new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22 }),
      spine: new THREE.MeshBasicMaterial({ color: HIGHLIGHT, toneMapped: false }),
      ground: new THREE.ShadowMaterial({ opacity: 0.14 }),
    };

    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.canvas);

    this.rt = { THREE, renderer, scene, env, camera, controls, sun, rig, content, mats, observer, offscreen: null };
    this.resize();
    if (this.card) this.rebuild();
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private makeRenderer(THREE: Three, canvas: HTMLCanvasElement, preserve: boolean): T.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: preserve });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return renderer;
  }

  private makeEnv(
    THREE: Three,
    RoomEnvironment: typeof import('three/examples/jsm/environments/RoomEnvironment.js').RoomEnvironment,
    renderer: T.WebGLRenderer
  ) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room);
    room.dispose();
    pmrem.dispose();
    return { texture: target.texture, dispose: () => target.dispose() };
  }

  /** Shows a card. The first one opens from closed to 90° (straight to 90° under reduced motion). */
  setCard(card: Card): void {
    this.card = card;
    if (this.rt) this.rebuild();
  }

  /** Jumps to an opening angle (0 closed, 180 flat), stopping any animation. */
  setTheta(deg: number): void {
    this.stopAnimation();
    this.theta = clampTheta(deg);
    this.pose();
  }

  /** Eases to an opening angle over `ms` (1.5 s by default); instant under reduced motion. */
  async animateTo(deg: number, ms = ANIMATE_MS): Promise<void> {
    await this.ready;
    const to = clampTheta(deg);
    if (this.disposed || reducedMotion() || ms <= 0 || to === this.theta) {
      this.setTheta(to);
      return;
    }
    this.stopAnimation();
    return new Promise<void>((resolve) => {
      this.anim = { from: this.theta, to, start: performance.now(), ms, resolve };
    });
  }

  /** Fold it mode: shows step i's angle and highlights its part; null leaves the mode. */
  setFoldStep(i: number | null): void {
    const step = i === null ? null : FOLD_STEPS[i];
    this.highlight = step?.highlight ?? null;
    this.applyHighlight();
    if (step) void this.animateTo(step.theta);
  }

  /** A still at angle thetaDeg from a stock view, as PNG bytes. Browser only. */
  async renderPng(width: number, height: number, thetaDeg: number, view: ViewName): Promise<Uint8Array> {
    await this.ready;
    const rt = this.rt;
    if (!rt || !this.built) throw new Error('No card to render.');
    const { THREE } = rt;
    if (!rt.offscreen) {
      const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
      const renderer = this.makeRenderer(THREE, document.createElement('canvas'), true);
      rt.offscreen = { renderer, env: this.makeEnv(THREE, RoomEnvironment, renderer) };
    }
    const { renderer, env } = rt.offscreen;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);

    const shot = viewCamera(this.built.W, this.built.L, view, FOV_DEG, width / height, clampTheta(thetaDeg));
    const camera = new THREE.PerspectiveCamera(FOV_DEG, width / height, shot.radius / 50, shot.radius * 50);
    camera.position.set(...shot.position);
    camera.lookAt(...shot.target);

    // Pose for the still with the float at rest, render, and put everything back before awaiting.
    const saved = { theta: this.theta, rot: rt.rig.rotation.clone(), env: rt.scene.environment };
    this.poseAt(clampTheta(thetaDeg));
    rt.rig.rotation.set(0, 0, 0);
    rt.scene.environment = env.texture;
    renderer.render(rt.scene, camera);
    rt.scene.environment = saved.env;
    rt.rig.rotation.copy(saved.rot);
    this.poseAt(saved.theta);

    const canvas = renderer.domElement;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The 3D still could not be encoded.');
    return new Uint8Array(await blob.arrayBuffer());
  }

  dispose(): void {
    this.disposed = true;
    this.stopAnimation();
    cancelAnimationFrame(this.frame);
    const rt = this.rt;
    if (!rt) return;
    rt.observer.disconnect();
    rt.controls.dispose();
    this.release();
    Object.values(rt.mats).forEach((m) => m.dispose());
    rt.env.dispose();
    rt.renderer.dispose();
    if (rt.offscreen) {
      rt.offscreen.env.dispose();
      rt.offscreen.renderer.dispose();
      rt.offscreen.renderer.forceContextLoss();
    }
    this.rt = null;
  }

  // ── Building ─────────────────────────────────────────────────────────────────

  private release(): void {
    if (!this.built || !this.rt) return;
    for (const g of this.built.geometries) g.dispose();
    this.rt.content.clear();
    this.built = null;
  }

  private rebuild(): void {
    const rt = this.rt;
    const card = this.card;
    if (!rt || !card) return;
    const { THREE, content, mats } = rt;
    this.release();
    const { W, L } = cardDims(card.params);
    const t = CARD_THICKNESS_MM;
    const geometries: T.BufferGeometry[] = [];
    const posed: Built['posed'] = [];

    mats.page.color.set(card.params.colours.inner);
    mats.strip.color.set(card.params.colours.inner);
    mats.jacket.color.set(card.params.colours.jacket);

    const add = (geometry: T.BufferGeometry, material: T.Material, frame: PanelFrame) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), mats.edge);
      mesh.add(edges);
      geometries.push(geometry, edges.geometry);
      content.add(mesh);
      posed.push({ obj: mesh, frame });
    };

    // Inner panels: the flat poly extruded one card thickness behind its inner face.
    for (const panel of card.panels) {
      const shapes = polyShapes(THREE, panel.poly);
      if (shapes.length === 0) continue;
      const geometry = new THREE.ExtrudeGeometry(shapes, { depth: t, bevelEnabled: false, curveSegments: 1 });
      geometry.translate(0, 0, -t + panel.layer * LAYER_GAP_MM);
      add(geometry, panel.stepId === null ? mats.page : mats.strip, panel.frame);
    }

    // The jacket: two slabs, (W + o) × (L + 2o) each, outside the inner sheet's pages.
    const o = Math.max(0, card.params.advanced.overhangMm);
    for (const [frame, sign] of [[{ kind: 'back' }, -1], [{ kind: 'base' }, 1]] as const) {
      const geometry = new THREE.BoxGeometry(W + o, L + 2 * o, t);
      geometry.translate((sign * (W + o)) / 2, L / 2, -1.5 * t);
      add(geometry, mats.jacket, frame);
    }

    // The spine fold, shown in Fold it mode. It never moves: every pose keeps the spine at the origin.
    const spineGeo = new THREE.CylinderGeometry(1.2, 1.2, L, 12);
    spineGeo.rotateX(Math.PI / 2);
    spineGeo.translate(0, 0, -L / 2);
    const spine = new THREE.Mesh(spineGeo, mats.spine);
    content.add(spine);

    const shot = viewCamera(W, L, 'three-quarter', FOV_DEG, 1);
    const groundGeo = new THREE.PlaneGeometry(shot.radius * 8, shot.radius * 8);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, mats.ground);
    ground.position.set(shot.target[0], -2 * t - 0.05, shot.target[2]);
    ground.receiveShadow = true;
    content.add(ground);
    geometries.push(spineGeo, groundGeo);

    this.built = { posed, geometries, spine, W, L };
    this.frameCamera(W, L);
    this.applyHighlight();

    if (!this.firstShown) {
      this.firstShown = true;
      this.theta = reducedMotion() ? 90 : 0;
      this.pose();
      void this.animateTo(90);
    } else this.pose();
  }

  /** Aims at the card's middle. The first card gets the three-quarter shot; a new size keeps the user's angle. */
  private frameCamera(W: number, L: number): void {
    const rt = this.rt!;
    if (this.framed && this.framed.W === W && this.framed.L === L) return;
    const shot = viewCamera(W, L, 'three-quarter', FOV_DEG, rt.camera.aspect);
    const target = new rt.THREE.Vector3(...shot.target);
    if (this.framed) {
      const offset = rt.camera.position.clone().sub(rt.controls.target).multiplyScalar(shot.radius / this.framed.radius);
      rt.camera.position.copy(target).add(offset);
    } else rt.camera.position.set(...shot.position);
    rt.controls.target.copy(target);
    rt.rig.position.copy(target);
    rt.content.position.copy(target).negate();
    rt.controls.minDistance = shot.radius * 0.6;
    rt.controls.maxDistance = shot.radius * 6;
    rt.camera.near = shot.radius / 50;
    rt.camera.far = shot.radius * 50;
    rt.camera.updateProjectionMatrix();
    rt.controls.update();

    const sun = rt.sun;
    sun.position.copy(target).add(new rt.THREE.Vector3(1.2, 2.2, 0.9).setLength(shot.radius * 3));
    sun.target.position.copy(target);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -shot.radius * 1.3;
    cam.right = cam.top = shot.radius * 1.3;
    cam.near = shot.radius * 0.5;
    cam.far = shot.radius * 6;
    cam.updateProjectionMatrix();
    this.framed = { W, L, radius: shot.radius };
  }

  private applyHighlight(): void {
    const rt = this.rt;
    if (!rt) return;
    const glow = (m: T.MeshStandardMaterial, on: boolean) => {
      m.emissive.set(on ? HIGHLIGHT : '#000000');
      m.emissiveIntensity = on ? 0.6 : 0;
    };
    glow(rt.mats.strip, this.highlight === 'strips');
    glow(rt.mats.page, this.highlight === 'glue');
    if (this.built) this.built.spine.visible = this.highlight === 'spine';
  }

  // ── Posing and the frame loop ────────────────────────────────────────────────

  private poseAt(theta: number): void {
    if (!this.built) return;
    for (const { obj, frame } of this.built.posed) {
      obj.matrix.fromArray(poseMatrix(frame, theta));
      obj.matrixWorldNeedsUpdate = true;
    }
  }

  private pose(): void {
    this.poseAt(this.theta);
    this.onTheta?.(this.theta);
  }

  private stopAnimation(): void {
    const a = this.anim;
    this.anim = null;
    a?.resolve();
  }

  private resize(): void {
    const rt = this.rt;
    if (!rt) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    rt.camera.aspect = w / h;
    rt.camera.updateProjectionMatrix();
    rt.renderer.setSize(w, h, false);
  }

  private tick = (now: number): void => {
    const rt = this.rt;
    if (!rt || this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (this.anim) {
      const a = this.anim;
      const p = Math.min(1, (now - a.start) / a.ms);
      this.theta = a.from + (a.to - a.from) * easeInOut(p);
      this.pose();
      if (p >= 1) this.stopAnimation();
    }

    // The idle float fades out while the user drags and is off under reduced motion.
    if (reducedMotion()) {
      this.floatAmp = 0;
    } else {
      this.floatAmp += ((this.dragging ? 0 : 1) - this.floatAmp) * Math.min(1, dt * 3);
    }
    const s = (now - this.start) / 1000;
    rt.rig.rotation.set(0.012 * Math.sin(s * 0.37 + 1.3) * this.floatAmp, 0.03 * Math.sin(s * 0.53) * this.floatAmp, 0);

    rt.controls.update();
    rt.renderer.render(rt.scene, rt.camera);
  };
}
