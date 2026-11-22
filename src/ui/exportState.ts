/** Why a card can't be exported, in words, for the export bar and the export modal. */
import { EMPTY_MESSAGE_NOTE, type Card } from '../core/build';
import { CHECK_NAMES, EXPORT } from './strings';

export function blockingReasons(card: Card): string[] {
  if (card.exportable) return [];
  if (card.notes.some((n) => n.message === EMPTY_MESSAGE_NOTE)) return [EMPTY_MESSAGE_NOTE];
  const failed = card.checks.filter((c) => !c.ok).map((c) => CHECK_NAMES[c.id].fail + (c.detail ? `: ${c.detail}` : '.'));
  return failed.length ? failed : [EXPORT.notExportable];
}

/** The one line under the Export button: the empty-message note, or a pointer to Checks. */
export function exportNote(card: Card | null): string {
  if (!card || card.exportable) return '';
  const reasons = blockingReasons(card);
  return reasons[0] === EMPTY_MESSAGE_NOTE ? EMPTY_MESSAGE_NOTE : EXPORT.notExportable;
}
