import type { ClientMessage, FState } from '../forge/client';

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

/** All selected creatures must be able to attack the same exact defender. */
export function legalAttackGroupTargets(state: FState, attackers: number[], gen: number): Defender[] {
  if (!attackers.length || gen !== state.input.gen) return [];
  const choices = attackers.map(attacker => legalAttackTargets(state, { attacker, gen }));
  return choices[0].filter(target => choices.every(list => list.some(other => other.id === target.id && other.kind === target.kind)));
}
export function attackGroupAction(state: FState, attackers: number[], defender: Defender | null, gen: number) {
  const ids = [...new Set(attackers)];
  if (!ids.length || gen !== state.input.gen || !ids.every(attacker => validAttackSelection(state, { attacker, gen }))) return null;
  if (defender === null) return { type: 'attack-group' as const, attackers: ids, defender: null, gen };
  if (!legalAttackGroupTargets(state, ids, gen).some(target => target.id === defender.id && target.kind === defender.kind)) return null;
  return { type: 'attack-group' as const, attackers: ids, defender: defender.id, defenderKind: defender.kind, gen };
}
export function availableAttackTargets(state: FState): Defender[] {
  const targets = new Map<string, Defender>();
  for (const attacker of state.input.attacking?.attackers ?? []) {
    for (const defender of legalAttackTargets(state, { attacker, gen: state.input.gen })) targets.set(`${defender.kind}:${defender.id}`, defender);
  }
  return [...targets.values()];
}
export function attackScope(state: FState): string | null {
  return state.input.attacking && !state.gameOver && !state.question && !state.spectating &&
    state.players.some(player => player.id === state.you && !player.eliminated)
    ? JSON.stringify([state.matchId ?? state.session?.code, state.you, state.turn, state.phase, state.activePlayer]) : null;
}
type AttackCommand = Extract<ClientMessage, { type: 'attack-group' | 'attack-all' }>;
/** Serialize attack edits against acknowledged prompts; rapid clicks never reuse an in-flight generation. */
export class AttackQueue {
  private scope: string | null = null;
  private pending: { gen: number; version?: number; attackers: number[]; defender: Defender | null } | null = null;
  private requests: { attackers: number[]; defender: Defender | null }[] = [];
  get busy() { return this.pending !== null || this.requests.length > 0; }
  get queuedAttackers() { return this.requests.flatMap(request => request.attackers); }
  clear(reset = false) { this.requests = []; if (reset) { this.pending = null; this.scope = null; } }
  observe(state: FState) {
    const scope = attackScope(state);
    if (scope !== this.scope || scope === null) { this.clear(true); this.scope = scope; return; }
    const pending = this.pending;
    if (!pending) return;
    const generationChanged = state.input.gen !== pending.gen;
    const progressed = generationChanged || (state.stateVersion !== undefined && state.stateVersion !== pending.version);
    if (progressed && this.applied(state, pending.attackers, pending.defender)) this.pending = null;
  }
  enqueue(attackers: number[], defender: Defender | null) {
    const last = this.requests.at(-1);
    if (last && last.defender?.id === defender?.id && last.defender?.kind === defender?.kind) last.attackers = [...new Set([...last.attackers, ...attackers])];
    else this.requests.push({ attackers: [...attackers], defender });
  }
  deselect(attacker: number) {
    this.requests = this.requests.map(request => ({ ...request, attackers: request.attackers.filter(id => id !== attacker) })).filter(request => request.attackers.length);
  }
  private applied(state: FState, attackers: number[], defender: Defender | null) {
    return attackers.every(attacker => {
      const assignment = state.combat.find(pair => pair.attacker === attacker);
      return defender === null ? !assignment : assignment?.defender === defender.id && assignment.defenderKind === defender.kind;
    });
  }
  markSent(state: FState, action: AttackCommand) {
    const defender: Defender | null = action.defender === null ? null : { id: action.defender, kind: action.defenderKind };
    const attackers = action.type === 'attack-group' ? action.attackers : (state.input.attacking?.attackers ?? []).filter(attacker =>
      legalAttackTargets(state, { attacker, gen: state.input.gen }).some(target => target.id === defender!.id && target.kind === defender!.kind));
    this.pending = { gen: state.input.gen, version: state.stateVersion, attackers: [...attackers], defender };
  }
  next(state: FState): ClientMessage | null {
    this.observe(state);
    if (!this.scope || this.pending) return null;
    while (this.requests.length) {
      const request = this.requests.shift()!;
      const action = attackGroupAction(state, request.attackers, request.defender, state.input.gen);
      if (action) {
        if (this.applied(state, action.attackers, request.defender)) continue;
        this.markSent(state, action); return action;
      }
    }
    return null;
  }
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
