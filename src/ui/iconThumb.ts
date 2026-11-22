/** A small drawing of an icon from its source SVG, so a list of them never builds an icon's `poly`. */
import { iconSvgSource } from '../themes';
import { svgFrom } from './dom';

export function iconThumb(id: string): SVGSVGElement {
  const svg = svgFrom(iconSvgSource(id));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  return svg;
}
