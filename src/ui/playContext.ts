import type { FCard, FState } from '../forge/client';

/** Visibility follows engine permissions, never affordability or an inferred expiry date. */
export function exileShelfCards(state: FState): { card: FCard; suspended: boolean; permission: boolean; choosing: boolean }[] {
  const permitted = new Set(state.playableExile ?? []);
  const suspended = new Set(state.suspendedExile ?? []);
  const choosing = state.input.suspendCast?.card.id;
  return state.players.flatMap(player => player.exile).filter(card => !card.faceDown && !!card.name &&
    (permitted.has(card.id) || suspended.has(card.id) || card.id === choosing)).map(card => ({
      card, suspended: suspended.has(card.id), permission: permitted.has(card.id), choosing: card.id === choosing,
    }));
}

export function canPlayExileCard(state: FState, id: number, gen: number) {
  return state.input.gen === gen && !!state.input.priority && state.input.ok.enabled && !state.gameOver && !state.question && !state.sideboarding &&
    !state.input.paying && !state.input.targeting && !state.input.suspendCast && !!state.playableExile?.includes(id) &&
    state.players.some(player => player.exile.some(card => card.id === id && !card.faceDown)) &&
    (!!state.castable?.includes(id) || !!state.input.actionable?.includes(id));
}

export interface BlockSelection { blocker: number; gen: number }
export function validBlockSelection(state: FState, selected: BlockSelection | null): selected is BlockSelection {
  return !!selected && selected.gen === state.input.gen && !state.gameOver && !state.question && !state.sideboarding &&
    !!state.input.blocking?.blockers.includes(selected.blocker) &&
    !!state.players.find(player => player.id === state.you)?.battlefield.some(card => card.id === selected.blocker);
}
export function legalBlockTargets(state: FState, selected: BlockSelection | null): number[] {
  if (!validBlockSelection(state, selected)) return [];
  return state.input.blocking?.legalAssignments?.find(pair => pair.blocker === selected.blocker)?.attackers ?? [];
}
/** One exact pair reaches Forge; the engine's implicit preselected attacker is never consulted. */
export function blockPairAction(state: FState, selected: BlockSelection | null, attacker: number, gen: number) {
  if (gen !== state.input.gen || !validBlockSelection(state, selected) || !state.input.blocking?.attackers.includes(attacker) ||
    !legalBlockTargets(state, selected).includes(attacker) || !state.players.some(player => player.battlefield.some(card => card.id === attacker))) return null;
  return { type: 'block' as const, blocker: selected.blocker, attacker, gen };
}

/** Selection is authoritative: hovering and a local click never mark a cost as paid. */
export function selectedForInput(state: FState, id: number) {
  return !state.gameOver && !state.question && !state.input.priority && !!state.input.selection?.cards.includes(id);
}
export function canSelectExileCard(state: FState, id: number, gen: number) {
  return gen === state.input.gen && !state.gameOver && !state.question && !state.input.priority &&
    !!(state.input.selection || state.input.targeting) && state.players.some(player => player.exile.some(card => card.id === id && !card.faceDown)) &&
    (state.input.selectable.includes(id) || !!state.input.actionable?.includes(id) || selectedForInput(state, id));
}
