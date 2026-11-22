/** The folding steps shared by the how-to PDF and the 3D view. `theta` is the card opening in degrees. */
export const FOLD_STEPS: { id: string; text: string; theta: number; highlight: 'spine' | 'strips' | 'glue' }[] = [
  { id: 'spine', text: 'Fold the card in half along the spine.', theta: 0, highlight: 'spine' },
  { id: 'push', text: 'Open to 90° and push each strip toward you until it stands.', theta: 90, highlight: 'strips' },
  { id: 'crease', text: 'Crease every fold with the edge of a credit card.', theta: 90, highlight: 'strips' },
  { id: 'glue', text: 'Glue the inner sheet into the jacket. Keep glue off the strips and their openings.', theta: 180, highlight: 'glue' },
];
