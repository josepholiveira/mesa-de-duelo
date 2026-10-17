import type { FState } from '../forge/client';

/** Rotate actual seats around the viewer; IDs are never array offsets. */
export function tablePlayers(state: FState) {
  const seats = [...state.players].sort((a, b) => (a.seat ?? state.players.indexOf(a)) - (b.seat ?? state.players.indexOf(b)));
  const index = seats.findIndex(player => player.id === state.you);
  if (index < 0) return { me: undefined, opponents: [] };
  return { me: seats[index], opponents: [...seats.slice(index + 1), ...seats.slice(0, index)] };
}
export interface AttackSelection { attacker: number; gen: number }
export interface Defender { id: number; kind: 'player' | 'card' }
export function validAttackSelection(state: FState, selected: AttackSelection | null): selected is AttackSelection {
  return !!selected && selected.gen === state.input.gen && !state.gameOver && !state.question && !state.spectating &&
    !!state.input.attacking?.attackers.includes(selected.attacker) &&
    !!state.players.find(player => player.id === state.you && !player.eliminated)?.battlefield.some(card => card.id === selected.attacker);
}
export function legalAttackTargets(state: FState, selected: AttackSelection | null): Defender[] {
  if (!validAttackSelection(state, selected)) return [];
  return (state.input.attacking?.legalAssignments.find(pair => pair.attacker === selected.attacker)?.defenders ?? []).filter(target =>
    target.kind === 'player' ? state.players.some(player => player.id === target.id && !player.eliminated && player.id !== state.you)
      : state.players.some(player => !player.eliminated && player.battlefield.some(card => card.id === target.id)));
}
export function attackPairAction(state: FState, selected: AttackSelection | null, defender: Defender, gen: number) {
  if (gen !== state.input.gen || !validAttackSelection(state, selected) || !legalAttackTargets(state, selected).some(target => target.id === defender.id && target.kind === defender.kind)) return null;
  return { type: 'attack' as const, attacker: selected.attacker, defender: defender.id, defenderKind: defender.kind, gen };
}

/** Bulk declaration uses the union of legal exact targets; each creature still obeys its own assignment. */
export function legalAttackAllTargets(state: FState, gen: number): Defender[] {
  if (gen !== state.input.gen || state.combat.length || !state.input.cancel?.enabled) return [];
  const targets = new Map<string, Defender>();
  for (const attacker of state.input.attacking?.attackers ?? []) {
    for (const defender of legalAttackTargets(state, { attacker, gen })) targets.set(`${defender.kind}:${defender.id}`, defender);
  }
  return [...targets.values()];
}
export function attackAllAction(state: FState, defender: Defender, gen: number) {
  if (!legalAttackAllTargets(state, gen).some(target => target.id === defender.id && target.kind === defender.kind)) return null;
  return { type: 'attack-all' as const, defender: defender.id, defenderKind: defender.kind, gen };
}

export function canPlayCommander(state: FState, id: number, gen: number) {
  return gen === state.input.gen && !state.gameOver && !state.question && !state.spectating && !state.input.paying && !state.input.targeting &&
    !!state.input.priority && state.input.ok.enabled &&
    !!state.players.find(player => player.id === state.you && !player.eliminated)?.commandZone?.some(card => card.id === id && !card.faceDown) &&
    (!!state.castable?.includes(id) || !!state.input.actionable?.includes(id));
}
