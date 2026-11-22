import { bounds, union } from '@kerfuffle/engine/geom';
import { parseSvgShape } from '../svg/svgShape';
import type { Icon } from './types';

/**
 * Reads an SVG's filled shapes into an {@link Icon}: the non-zero union of every shape, flipped so
 * y points up, scaled to 1 mm tall, with its bottom on y = 0 and its left on x = 0.
 */
export function loadIcon(
  svgText: string,
  meta: Omit<Icon, 'poly'>,
): Icon {
  const shape = parseSvgShape(svgText, 0);
  // The tolerance is in viewBox units; a thousandth of the width keeps curves smooth.
  const parsed = shape ? parseSvgShape(svgText, shape.viewBox.w / 1000) : null;
  if (!parsed || !parsed.poly.length) throw new Error(`Icon "${meta.id}" has no filled shapes.`);
  const b = bounds(parsed.poly)!;
  const k = 1 / b.h;
  const flipped = parsed.poly.map((c) => c.map((p) => ({ x: (p.x - b.x) * k, y: (b.y + b.h - p.y) * k })));
  return { ...meta, poly: union([flipped]) };
}
