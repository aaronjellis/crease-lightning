/**
 * Draws the original icons (subjects Phosphor lacks) into src/themes/icons/<id>.svg, in Phosphor's
 * fill style: a 256 × 256 viewBox, heavy silhouettes with rounded corners, details as 14–16 unit
 * gaps of paper. Each icon is built from circles, rounded rectangles, and thick lines with polygon
 * booleans, softened, and written as one even-odd path. Run: npx vite-node scripts/draw-originals.ts
 */
import { writeFileSync } from 'node:fs';
import { difference, grow, offsetOpen, union, type Poly, type Pt } from '@kerfuffle/engine/geom';

const TOL = 0.1;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- shapes (y down, as in SVG)

const ellipse = (cx: number, cy: number, rx: number, ry: number = rx, rotDeg = 0): Poly => {
  const n = 96;
  const r = (rotDeg * Math.PI) / 180;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    pts.push({ x: cx + x * Math.cos(r) - y * Math.sin(r), y: cy + x * Math.sin(r) + y * Math.cos(r) });
  }
  return union([[pts]]);
};
const circle = (cx: number, cy: number, r: number): Poly => ellipse(cx, cy, r);
const polygon = (...xy: number[]): Poly => {
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) pts.push({ x: xy[i], y: xy[i + 1] });
  return union([[pts]]);
};
const rect = (x: number, y: number, w: number, h: number): Poly => polygon(x, y, x + w, y, x + w, y + h, x, y + h);
/** A rectangle with corner radius `r`. */
const rrect = (x: number, y: number, w: number, h: number, r: number): Poly => {
  // A radius of half the height (or width) makes a capsule: the core rectangle is then a line.
  const k = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
  return grow(rect(x + k, y + k, w - 2 * k, h - 2 * k), k, TOL);
};
/** A thick line `w` wide through the points, with round caps and joins. */
const line = (w: number, ...xy: number[]): Poly => {
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) pts.push({ x: xy[i], y: xy[i + 1] });
  const ends = [pts[0], pts[pts.length - 1]].map((p) => circle(p.x, p.y, w / 2));
  return union([offsetOpen(pts, w / 2, TOL), ...ends]);
};
/** A thick arc `w` wide round (cx, cy), from angle a0 to a1 in degrees (0 is +x, 90 is down). */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, w: number): Poly => {
  const pts: number[] = [];
  const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 4));
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return line(w, ...pts);
};
/** A quadratic curve from p0 through control c to p1, as a thick line `w` wide. */
const curve = (w: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): Poly => {
  const pts: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const u = 1 - t;
    pts.push(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1);
  }
  return line(w, ...pts);
};
/** The convex hull of the shapes' points. */
const hull = (...polys: Poly[]): Poly => {
  const pts = polys.flat(2).sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return union([[[...lower.slice(0, -1), ...upper.slice(0, -1)]]]);
};
const pt = (x: number, y: number): Poly => [[{ x, y }, { x: x + 0.01, y }, { x, y: y + 0.01 }]];
/** A teardrop: a circle drawn out to a point. */
const drop = (cx: number, cy: number, r: number, tipX: number, tipY: number): Poly => soft(hull(circle(cx, cy, r), pt(tipX, tipY)), 4);

const U = (...p: Poly[]): Poly => union(p);
const D = (a: Poly, ...b: Poly[]): Poly => difference(a, union(b));
/** `a` with a gap `g` wide cut round `b`: the way Phosphor separates overlapping parts. */
const apart = (a: Poly, b: Poly, g = 14): Poly => difference(a, grow(b, g, TOL));
/** Rounds convex corners to radius `r` (an opening), then concave ones (a closing). */
const soft = (p: Poly, r = 6): Poly => erode(grow(grow(erode(p, r), r, TOL), r / 2, TOL), r / 2);
/** Removes parts thinner than 2·r (a crescent's horns, a sharp tip) and rounds convex corners to r. */
const open = (p: Poly, r: number): Poly => grow(erode(p, r), r, TOL);
/** Shrinks `p` by `r` (or grows it, for a negative `r`): the paper round it grown, which is far faster than a negative offset. */
function erode(p: Poly, r: number): Poly {
  if (r < 0) return grow(p, -r, TOL);
  const frame = rect(-64, -64, 384, 384);
  return difference(frame, grow(difference(frame, p), r, TOL));
}
const rotate = (p: Poly, deg: number, cx = 128, cy = 128): Poly => {
  const r = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return p.map((ring) => ring.map((q) => ({ x: cx + (q.x - cx) * c - (q.y - cy) * s, y: cy + (q.x - cx) * s + (q.y - cy) * c })));
};

// ---------------------------------------------------------------- the icons

/** A heart with its point at (cx, bottom), `w` wide. */
const heartShape = (cx: number, top: number, w: number): Poly => {
  const r = w / 4;
  const tip = pt(cx, top + w * 0.9);
  return U(hull(circle(cx - r, top + r, r), tip), hull(circle(cx + r, top + r, r), tip));
};

/** A holly leaf: an ellipse with bites taken out of both edges, so it ends in points. */
const hollyLeaf = (cx: number, cy: number, len: number, wid: number, rotDeg: number): Poly => {
  let leaf = ellipse(0, 0, len / 2, wid / 2);
  const bites: Poly[] = [];
  for (const t of [-0.5, 0.05, 0.6]) {
    for (const side of [-1, 1]) bites.push(circle(t * len * 0.5, side * (wid / 2 + wid * 0.22), wid * 0.34));
  }
  leaf = D(leaf, ...bites);
  const r = (rotDeg * Math.PI) / 180;
  const placed = leaf.map((ring) => ring.map((q) => ({ x: cx + q.x * Math.cos(r) - q.y * Math.sin(r), y: cy + q.x * Math.sin(r) + q.y * Math.cos(r) })));
  return grow(erode(placed, 3), 3, TOL);
};

const OPEN_R: Record<string, number> = { holly: 5, 'candy-cane': 6, stork: 6 };

const ICONS: Record<string, () => Poly> = {
  candle: () => {
    const flame = drop(128, 70, 22, 128, 22);
    const body = rrect(98, 108, 60, 120, 12);
    const stripes = U(line(14, 70, 160, 186, 128), line(14, 70, 206, 186, 174));
    return U(flame, D(body, stripes));
  },

  candles: () => {
    const one = (x: number, top: number) => {
      const body = rrect(x, top, 44, 228 - top, 10);
      const flame = drop(x + 22, top - 32, 16, x + 22, top - 70);
      return U(flame, D(body, line(14, x - 10, top + 56, x + 54, top + 36)));
    };
    return U(one(36, 124), one(106, 96), one(176, 132));
  },

  stork: () => {
    // Flying left, wings up, a bundle hanging from the beak.
    const body = ellipse(150, 112, 50, 26, -12);
    const neck = curve(24, 112, 116, 84, 104, 76, 66);
    const head = circle(72, 60, 20);
    const beak = soft(polygon(58, 50, 74, 74, 18, 100), 2);
    const wing = soft(polygon(118, 108, 170, 100, 240, 32, 212, 22, 140, 62), 6);
    const tail = soft(polygon(188, 102, 238, 112, 198, 132), 4);
    const legs = line(20, 178, 124, 238, 156);
    const bird = U(body, neck, head, beak, wing, tail, legs);
    // The bundle: a sling knotted at the top, hanging on a short strap from the beak tip.
    const strap = line(18, 24, 96, 40, 146);
    const sling = hull(ellipse(46, 196, 36, 32), ellipse(46, 150, 26, 10));
    return U(bird, strap, sling);
  },

  rattle: () => {
    // Head, collar, handle, and knob down the diagonal from the head's centre.
    const at = (d: number) => 92 + d / Math.SQRT2;
    const head = circle(92, 92, 66);
    const band = line(14, 20, 80, 164, 104);
    const collar = rotate(rrect(at(90) - 30, at(90) - 11, 60, 22, 8), 45, at(90), at(90));
    const handle = line(30, at(116), at(116), at(150), at(150));
    const knob = circle(at(166), at(166), 24);
    return U(D(head, band), collar, handle, knob);
  },

  'baby-bottle': () => {
    const teat = soft(polygon(112, 30, 144, 30, 158, 78, 98, 78), 10);
    const collar = rrect(82, 72, 92, 32, 12);
    const body = rrect(92, 118, 72, 110, 22);
    const marks = U(rect(134, 144, 40, 14), rect(134, 172, 40, 14), rect(134, 200, 40, 14));
    return U(teat, collar, D(body, marks));
  },

  pacifier: () => {
    const ring = arc(128, 64, 32, 135, 405, 22);
    const shield = soft(hull(ellipse(76, 128, 48, 34, -14), ellipse(180, 128, 48, 34, 14)), 10);
    const teat = U(rrect(108, 150, 40, 30, 8), ellipse(128, 198, 34, 30));
    return U(apart(ring, shield, 14), shield, apart(teat, shield, 0));
  },

  'teddy-bear': () => {
    const head = circle(128, 86, 50);
    const ears = U(circle(76, 38, 28), circle(180, 38, 28));
    const body = ellipse(128, 182, 50, 46);
    const arms = U(circle(68, 158, 24), circle(188, 158, 24));
    const feet = U(circle(90, 212, 22), circle(166, 212, 22));
    return U(head, apart(ears, head, 15), apart(body, head, 14), apart(arms, body, 14), apart(feet, body, 14));
  },

  'party-hat': () => {
    const pom = circle(128, 38, 20);
    const brim = rrect(44, 202, 168, 28, 14);
    const cone = soft(polygon(128, 50, 200, 214, 56, 214), 10);
    const stripes = U(line(14, 40, 118, 220, 168), line(14, 40, 168, 220, 218));
    return U(pom, brim, apart(D(cone, stripes), U(pom, brim)));
  },

  cupcake: () => {
    const cherry = circle(146, 38, 18);
    const frosting = soft(U(ellipse(128, 120, 90, 30), ellipse(128, 92, 66, 28), ellipse(122, 66, 40, 22)), 8);
    const swirl = curve(14, 30, 112, 128, 80, 226, 112);
    const wrapper = soft(polygon(48, 150, 208, 150, 180, 230, 76, 230), 8);
    const pleats = U(line(14, 100, 150, 104, 210), line(14, 156, 150, 152, 210));
    return U(apart(cherry, frosting, 0), D(frosting, swirl), apart(D(wrapper, pleats), frosting));
  },

  fireworks: () => {
    const parts: Poly[] = [circle(128, 128, 18)];
    for (let k = 0; k < 8; k++) {
      const a = (k * 45 * Math.PI) / 180;
      const b = ((k * 45 + 22.5) * Math.PI) / 180;
      parts.push(line(22, 128 + 46 * Math.cos(a), 128 + 46 * Math.sin(a), 128 + 92 * Math.cos(a), 128 + 92 * Math.sin(a)));
      parts.push(circle(128 + 100 * Math.cos(b), 128 + 100 * Math.sin(b), 12));
    }
    return U(...parts);
  },

  holly: () => {
    const berries = U(circle(112, 174, 22), circle(144, 174, 22), circle(128, 202, 22));
    // Two leaves in a V over the berries; each vein runs from the leaf's inner end toward its tip.
    const leaves = U(hollyLeaf(70, 100, 136, 64, 38), hollyLeaf(186, 100, 136, 64, -38));
    const veins = U(line(14, 118, 138, 70, 100), line(14, 138, 138, 186, 100));
    return U(berries, apart(D(leaves, veins), berries));
  },

  snowman: () => {
    const hat = U(rrect(100, 8, 56, 40, 6), rrect(78, 42, 100, 16, 8));
    const head = U(circle(124, 98, 38), soft(polygon(150, 88, 198, 100, 150, 112), 3));
    const body = circle(124, 180, 56);
    return U(hat, apart(head, hat, 14), apart(body, head, 14));
  },

  'candy-cane': () => {
    const cane = U(line(40, 160, 226, 160, 92), arc(116, 92, 44, 0, -180, 40), line(40, 72, 92, 72, 118));
    // Slanted stripes down the shaft; on the hook they run across it, toward the hook's centre.
    const stripes: Poly[] = [];
    for (const y of [206, 150]) stripes.push(line(14, 124, y + 18, 196, y - 18));
    for (const a of [-60, -150]) {
      const r = (a * Math.PI) / 180;
      stripes.push(line(14, 116 + 16 * Math.cos(r), 92 + 16 * Math.sin(r), 116 + 72 * Math.cos(r), 92 + 72 * Math.sin(r)));
    }
    return D(cane, ...stripes);
  },

  mitten: () => {
    const hand = rrect(76, 32, 112, 152, 54);
    const thumb = ellipse(58, 124, 32, 48, -28);
    const cuff = rrect(64, 188, 136, 42, 12);
    return U(cuff, apart(U(hand, apart(thumb, hand, 14)), cuff));
  },

  ring: () => {
    const band = D(circle(128, 162, 68), circle(128, 162, 46));
    const crown = soft(polygon(100, 26, 156, 26, 176, 54, 80, 54), 4);
    const pavilion = soft(polygon(80, 66, 176, 66, 128, 112), 4);
    const gem = U(crown, pavilion);
    return U(gem, apart(band, gem, 14));
  },

  pumpkin: () => {
    const body = U(ellipse(128, 150, 46, 76), ellipse(82, 152, 54, 68), ellipse(174, 152, 54, 68));
    const grooves = U(curve(14, 106, 80, 88, 150, 106, 224), curve(14, 150, 80, 168, 150, 150, 224));
    const stem = soft(polygon(116, 22, 140, 26, 136, 72, 116, 72), 6);
    return U(apart(stem, body, 0), D(soft(body, 6), grooves));
  },

  crib: () => {
    const posts = U(rrect(28, 40, 28, 188, 12), rrect(200, 40, 28, 188, 12));
    const knobs = U(circle(42, 30, 18), circle(214, 30, 18));
    const rails = U(rect(40, 64, 176, 24), rect(40, 168, 176, 24));
    const slats: Poly[] = [];
    for (let k = 0; k < 3; k++) slats.push(rect(80 + k * 38, 80, 22, 96));
    return U(apart(knobs, posts, 0), posts, rails, ...slats);
  },

  'heart-stand': () => {
    const heart = heartShape(128, 24, 184);
    const stem = rrect(116, 176, 24, 30, 6);
    const base = rrect(64, 204, 128, 28, 14);
    return U(heart, apart(U(stem, base), heart, 0), base);
  },

  snowflake: () => {
    const parts: Poly[] = [circle(128, 128, 24)];
    for (let k = 0; k < 6; k++) {
      const a = ((k * 60 - 90) * Math.PI) / 180;
      const [c, sn] = [Math.cos(a), Math.sin(a)];
      parts.push(line(24, 128, 128, 128 + 100 * c, 128 + 100 * sn));
      // Two ticks off each arm, swept outward at 45 degrees.
      for (const side of [-1, 1]) {
        const b = a + (side * Math.PI) / 4;
        const [x0, y0] = [128 + 62 * c, 128 + 62 * sn];
        parts.push(line(20, x0, y0, x0 + 34 * Math.cos(b), y0 + 34 * Math.sin(b)));
      }
    }
    return U(...parts);
  },

  'baby-face': () => {
    // Drawn as an outline, so the face can be cut inside it; the paper face hangs on one bridge.
    const ring = D(circle(128, 140, 88), circle(128, 140, 64));
    const curl = drop(122, 60, 18, 150, 14);
    const ears = U(circle(34, 140, 22), circle(222, 140, 22));
    const eyes = U(circle(100, 128, 13), circle(156, 128, 13));
    const smile = arc(128, 150, 30, 25, 155, 22);
    return U(ring, curl, apart(ears, ring, 14), eyes, smile);
  },

  mortarboard: () => {
    const board = soft(polygon(128, 36, 244, 92, 128, 148, 12, 92), 8);
    const cap = soft(U(polygon(64, 132, 192, 132, 192, 196, 64, 196), ellipse(128, 196, 64, 24)), 8);
    const cord = line(22, 128, 92, 214, 116, 214, 176);
    const tassel = soft(polygon(204, 170, 228, 170, 234, 214, 198, 214), 6);
    return U(board, apart(cap, board, 12), apart(U(cord, tassel), cap, 12), apart(cord, board, 0));
  },

  gift: () => {
    const knot = circle(128, 68, 18);
    const loops = U(hull(ellipse(80, 46, 30, 22, 20), circle(116, 64, 14)), hull(ellipse(176, 46, 30, 22, -20), circle(140, 64, 14)));
    const bow = U(loops, knot);
    const lid = rrect(28, 90, 200, 42, 10);
    const box = rrect(44, 146, 168, 86, 10);
    const ribbon = rect(119, 80, 18, 160);
    return U(bow, apart(D(U(lid, box), ribbon), bow, 12));
  },

  confetti: () => {
    // A scatter of paper bits: two squares, two dots, and a curled streamer.
    const sq = (cx: number, cy: number, deg: number) => rotate(rrect(cx - 22, cy - 22, 44, 44, 8), deg, cx, cy);
    return U(sq(60, 60, 20), sq(200, 200, -25), circle(196, 56, 24), circle(56, 200, 24), arc(128, 128, 36, 160, 390, 30));
  },

  tree: () => {
    // An evergreen in three tiers on a trunk thick enough to cut small.
    const tiers = U(polygon(128, 14, 184, 92, 72, 92), polygon(128, 54, 206, 152, 50, 152), polygon(128, 104, 226, 210, 30, 210));
    return U(soft(tiers, 8), rrect(110, 196, 36, 46, 6));
  },

  dot: () => circle(128, 128, 104),

  scallop: () => {
    const bumps: Poly[] = [circle(128, 128, 76)];
    for (let k = 0; k < 8; k++) {
      const a = (k * 45 * Math.PI) / 180;
      bumps.push(circle(128 + 72 * Math.cos(a), 128 + 72 * Math.sin(a), 34));
    }
    return U(...bumps);
  },
};

// ---------------------------------------------------------------- output

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Drops points within `eps` of the line through their neighbours (Douglas–Peucker on a closed ring). */
function simplify(ring: Pt[], eps = 0.15): Pt[] {
  if (ring.length < 8) return ring;
  const dist = (p: Pt, a: Pt, b: Pt) => {
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const l = Math.hypot(dx, dy);
    return l < 1e-9 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x)) / l;
  };
  const dp = (pts: Pt[]): Pt[] => {
    let [far, at] = [0, 0];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > far) [far, at] = [d, i];
    }
    if (far <= eps) return [pts[0], pts[pts.length - 1]];
    return [...dp(pts.slice(0, at + 1)).slice(0, -1), ...dp(pts.slice(at))];
  };
  // Split at the point farthest from the first, so the ring's two halves simplify on their own.
  let k = 0;
  for (let i = 1; i < ring.length; i++) if (Math.hypot(ring[i].x - ring[0].x, ring[i].y - ring[0].y) > Math.hypot(ring[k].x - ring[0].x, ring[k].y - ring[0].y)) k = i;
  return [...dp(ring.slice(0, k + 1)).slice(0, -1), ...dp([...ring.slice(k), ring[0]]).slice(0, -1)];
}
const only = process.argv.slice(2);
for (const [id, draw] of Object.entries(ICONS)) {
  if (only.length && !only.includes(id)) continue;
  // Every icon is opened: no horn or tip thinner than 20 units, and every convex corner rounded to
  // 10, which is both Phosphor's softness and a radius the blade can follow at the icon's minimum.
  // Holly keeps sharper points, as holly should.
  const poly = open(draw(), OPEN_R[id] ?? 10);
  const d = poly.map((ring) => `M${simplify(ring).map((q) => `${fmt(q.x)} ${fmt(q.y)}`).join('L')}Z`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path fill-rule="evenodd" d="${d}"/></svg>\n`;
  writeFileSync(new URL(`../src/themes/icons/${id}.svg`, import.meta.url), svg);
}
console.log('Drew', only.length ? only.join(', ') : Object.keys(ICONS).join(', '));
