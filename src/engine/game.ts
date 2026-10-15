import * as AI from './ai';
import { solvePayment } from './mana';
import { canAttack, canBlock, has, isCreature, isLand, isManaSource, pow, strikesFirst, targetSpec, tou } from './rules';
import {
  COLORS, isPlayerTarget,
  type Card, type CardDef, type Color, type Effect, type LogEntry, type ManaCost, type Mode,
  type Pending, type Phase, type Player, type Step, type Target, type TargetSpec,
} from './types';

export interface Hooks {
  change(): void;
  pause(ms: number): Promise<void>;
}

export interface DeckList { name: string; cards: CardDef[] }
export interface PlayerSetup { name: string; deck: DeckList; ai: boolean }

/** Interrompe o fluxo assíncrono de uma partida encerrada ou descartada. */
export class Stop extends Error {}

const zeroPool = (): Record<Color, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });

let uidSeq = 0;
export function makeCard(def: CardDef, owner: number): Card {
  return {
    uid: ++uidSeq, def, owner, tapped: false, sick: false, damage: 0, dt: false,
    pumpP: 0, pumpT: 0, attacking: false, blocking: null, wasBlocked: false,
  };
}

function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Estado e regras de uma partida. O jogador humano, quando existe, é sempre o índice 0.
 * A interface chama clickCard/clickPlayer/act e redesenha em hooks.change().
 */
export class Game {
  players: Player[];
  active = 0;
  phase: Phase = 'main1';
  step: Step = null;
  turn = 0;
  mode: Mode = null;
  sel: number | null = null;
  pending: Pending | null = null;
  log: LogEntry[] = [];
  over: { title: string; text: string; winner: number | null } | null = null;
  busy = false;
  hint = '';
  /** Alvos atingidos desde o último desenho (uid de carta ou "p0"/"p1"). */
  fx = new Set<string | number>();
  private waiter: (() => void) | null = null;
  private alive = true;

  constructor(setup: [PlayerSetup, PlayerSetup], private hooks: Hooks, private rng: () => number = Math.random) {
    this.players = setup.map((s, idx) => ({
      idx, name: s.name, ai: s.ai, deckName: s.deck.name, life: 20,
      library: shuffle(s.deck.cards.map(d => makeCard(d, idx)), rng),
      hand: [], bf: [], gy: [], pool: zeroPool(), landPlayed: false, decked: false,
    }));
  }

  // ---------- Consultas ----------
  get activePlayer() { return this.players[this.active]; }
  other(p: Player) { return this.players[1 - p.idx]; }
  onBF(c: Card) { return this.players.some(p => p.bf.includes(c)); }
  isMain() { return this.phase === 'main1' || this.phase === 'main2'; }
  get waitingHuman() { return !!this.waiter; }
  byUid(uid: number | null): Card | undefined {
    return uid == null ? undefined : this.players.flatMap(p => p.bf).find(c => c.uid === uid);
  }
  findCard(uid: number): { c: Card; p: Player; zone: 'hand' | 'bf' | 'gy' } | null {
    for (const p of this.players) {
      for (const zone of ['hand', 'bf', 'gy'] as const) {
        const c = p[zone].find(x => x.uid === uid);
        if (c) return { c, p, zone };
      }
    }
    return null;
  }
  attackers() { return this.activePlayer.bf.filter(c => c.attacking); }

  private say(p: Player | null, msg: string) {
    this.log.unshift({ msg, mine: !!p && !p.ai });
    if (this.log.length > 200) this.log.pop();
  }
  private emit() { this.hooks.change(); }
  tname(t: Target) { return isPlayerTarget(t) ? this.players[t.player].name.toLowerCase() : t.def.label; }

  // ---------- Fluxo de turno ----------
  start(first?: number) {
    for (const p of this.players) for (let i = 0; i < 7 && p.library.length; i++) p.hand.push(p.library.pop()!);
    const f = first ?? (this.rng() < 0.5 ? 0 : 1);
    this.say(null, `${this.players[f].name} começa.`);
    this.startTurn(f);
  }

  destroy() { this.alive = false; this.waiter = null; }

  private setPhase(ph: Phase) {
    this.phase = ph;
    for (const p of this.players) p.pool = zeroPool();
  }

  private startTurn(i: number) {
    if (!this.alive) return;
    this.turn++; this.active = i; this.step = null; this.mode = null; this.hint = ''; this.busy = false;
    const p = this.players[i];
    this.log.unshift({ msg: `Turno ${this.turn} · ${p.name}`, sep: true });
    this.setPhase('untap');
    p.bf.forEach(c => { c.tapped = false; c.sick = false; });
    p.landPlayed = false;
    this.setPhase('upkeep');
    this.setPhase('draw');
    if (this.turn > 1) this.draw(p);
    if (this.checkState()) { this.emit(); return; }
    this.setPhase('main1');
    this.emit();
    if (p.ai) void this.guard(this.aiTurn());
  }

  draw(p: Player, n = 1) {
    for (let i = 0; i < n; i++) {
      const c = p.library.pop();
      if (!c) { p.decked = true; this.say(p, `${p.name} não tem cartas para comprar.`); return; }
      p.hand.push(c);
      this.say(p, p.ai ? `${p.name} compra uma carta.` : `Você compra ${c.def.label}.`);
    }
  }

  private async guard(run: Promise<void>) {
    try { await run; } catch (e) { if (!(e instanceof Stop)) console.error(e); }
  }
  private async pause(ms: number) {
    await this.hooks.pause(ms);
    if (!this.alive || this.over) throw new Stop();
  }
  private waitHuman(): Promise<void> {
    return new Promise((res, rej) => {
      this.waiter = () => {
        this.waiter = null;
        if (!this.alive || this.over) rej(new Stop()); else res();
      };
    });
  }

  private async aiTurn() {
    const p = this.activePlayer;
    this.busy = true; this.emit();
    await this.pause(800);
    AI.mainPhase(this, p); this.emit();
    await this.pause(600);
    const atk = AI.chooseAttackers(this, p);
    if (atk.length) {
      this.declareAttackers(atk); this.emit();
      await this.pause(700);
      await this.combat();
    }
    this.setPhase('main2'); this.step = null; this.emit();
    await this.pause(500);
    AI.mainPhase(this, p); this.emit();
    await this.pause(500);
    await this.endTurn();
  }

  private declareAttackers(atk: Card[]) {
    const p = this.activePlayer;
    this.setPhase('combat'); this.step = 'attackers';
    atk.forEach(a => { a.attacking = true; if (!has(a, 'vigilance')) a.tapped = true; });
    this.say(p, `${p.name} ataca com ${atk.map(a => a.def.label).join(', ')}.`);
  }

  private async combat() {
    const A = this.activePlayer, D = this.other(A);
    const attackers = this.attackers();
    this.step = 'blockers';
    if (D.ai) AI.declareBlocks(this, D);
    else if (D.bf.some(b => attackers.some(a => canBlock(b, a)))) {
      this.mode = 'block'; this.sel = attackers[0].uid; this.busy = false; this.emit();
      await this.waitHuman();
      this.mode = null; this.sel = null; this.busy = true;
    }
    attackers.forEach(a => { a.wasBlocked = D.bf.some(b => b.blocking === a.uid); });
    const blocks = D.bf.filter(b => b.blocking !== null);
    this.say(D, blocks.length
      ? `${D.name} bloqueia: ${blocks.map(b => `${b.def.label} → ${this.byUid(b.blocking)!.def.label}`).join('; ')}.`
      : `${D.name} não bloqueia.`);
    this.emit();
    await this.pause(600);
    for (const p of [A, D]) if (p.ai && !this.over) AI.combatTricks(this, p);
    this.emit();
    if (this.over) return;
    if (this.players.some(p => !p.ai)) {
      this.step = 'tricks'; this.busy = false; this.emit();
      await this.waitHuman();
      this.busy = true;
    }
    this.resolveCombat(); this.emit();
    await this.pause(700);
    this.endCombat(); this.emit();
  }

  private async humanAttack() {
    const atk = this.attackers();
    this.mode = null;
    if (!atk.length) {
      this.step = null; this.setPhase('main2');
      this.say(this.players[0], 'Você não ataca.');
      this.emit();
      return;
    }
    this.busy = true;
    this.declareAttackers(atk); this.emit();
    await this.pause(500);
    await this.combat();
    this.setPhase('main2'); this.step = null; this.busy = false; this.emit();
  }

  private async endTurn() {
    const p = this.activePlayer;
    this.busy = true; this.setPhase('end'); this.step = null; this.mode = null; this.emit();
    if (p.hand.length > 7) {
      if (p.ai) AI.discardDown(this, p);
      else {
        this.mode = 'discard'; this.busy = false; this.emit();
        await this.waitHuman();
        this.mode = null; this.busy = true;
      }
    }
    for (const pl of this.players) pl.bf.forEach(c => { c.damage = 0; c.dt = false; c.pumpP = 0; c.pumpT = 0; });
    this.emit();
    await this.pause(450);
    this.startTurn(1 - this.active);
  }

  discard(p: Player, c: Card) {
    p.hand.splice(p.hand.indexOf(c), 1);
    p.gy.push(c);
    this.say(p, `${p.name} descarta ${c.def.label}.`);
  }

  // ---------- Mana ----------
  sources(p: Player) {
    return p.bf.filter(isManaSource).map(c => ({ uid: c.uid, colors: c.def.produces, land: isLand(c) }));
  }
  canPay(p: Player, cost: ManaCost) { return !!solvePayment(p.pool, this.sources(p), cost); }
  private pay(p: Player, cost: ManaCost) {
    const plan = solvePayment(p.pool, this.sources(p), cost);
    if (!plan) throw new Error('pagamento impossível');
    for (const c of COLORS) p.pool[c] -= plan.pool[c];
    for (const uid of plan.tap) p.bf.find(c => c.uid === uid)!.tapped = true;
  }
  tapForMana(p: Player, c: Card) {
    if (!isManaSource(c)) return false;
    c.tapped = true;
    p.pool[c.def.produces[0]]++;
    return true;
  }

  // ---------- Conjurar ----------
  timingOK(p: Player, c: Card) {
    if (c.def.type === 'instant') {
      return this.active === p.idx ? (this.isMain() && !this.step) || this.step === 'tricks' : this.step === 'tricks';
    }
    return this.active === p.idx && this.isMain() && !this.step;
  }
  targetedEffect(def: CardDef): Effect | undefined { return def.spell.find(e => targetSpec(e)); }
  hasTargets(p: Player, spec: TargetSpec | null) {
    if (!spec || spec === 'any' || spec === 'player') return true;
    const all = this.players.flatMap(x => x.bf.filter(isCreature));
    if (spec === 'creature') return all.length > 0;
    return all.some(x => x.owner === p.idx) && all.some(x => x.owner !== p.idx);
  }
  whyNot(p: Player, c: Card): string {
    if (isLand(c)) {
      if (this.active !== p.idx || !this.isMain() || this.step) return 'Terrenos só podem ser jogados na sua fase principal.';
      if (p.landPlayed) return 'Você já jogou um terreno neste turno.';
      return '';
    }
    if (!this.timingOK(p, c)) {
      return c.def.type === 'instant' ? 'Agora não é possível conjurar mágicas.' : 'Só pode ser conjurada na sua fase principal.';
    }
    if (!this.canPay(p, c.def.cost)) return 'Mana insuficiente.';
    const te = this.targetedEffect(c.def);
    if (te && !this.hasTargets(p, targetSpec(te))) return 'Não há alvos válidos.';
    return '';
  }
  canCast(p: Player, c: Card) { return !this.whyNot(p, c); }

  playLand(p: Player, c: Card) {
    p.hand.splice(p.hand.indexOf(c), 1);
    c.tapped = c.def.entersTapped;
    p.bf.push(c);
    p.landPlayed = true;
    this.say(p, `${p.name} joga ${c.def.label}.`);
  }

  castSpell(p: Player, c: Card, targets: Target[]) {
    this.pay(p, c.def.cost);
    p.hand.splice(p.hand.indexOf(c), 1);
    if (isCreature(c)) {
      c.sick = true;
      p.bf.push(c);
      this.say(p, `${p.name} conjura ${c.def.label}.`);
      this.enterBattlefield(p, c);
    } else {
      const on = targets.length ? ` em ${targets.map(t => this.tname(t)).join(' e ')}` : '';
      this.say(p, `${p.name} conjura ${c.def.label}${on}.`);
      for (const e of c.def.spell) this.resolveEffect(p, e, targetSpec(e) ? targets : [], null);
      p.gy.push(c);
    }
    this.checkState();
  }

  private enterBattlefield(p: Player, c: Card) {
    for (const e of c.def.etb) {
      const spec = targetSpec(e);
      if (!spec) { this.resolveEffect(p, e, [], c); continue; }
      if (!this.hasTargets(p, spec)) continue;
      if (p.ai) {
        const t = AI.chooseTargets(this, p, e, true);
        if (t) this.resolveEffect(p, e, t, c);
      } else {
        this.pending = { card: c, effect: e, spec, targets: [], from: 'etb', controller: p.idx };
      }
    }
  }

  resolveEffect(p: Player, e: Effect, targets: Target[], source: Card | null) {
    const alive = (t: Target | undefined): t is Target => !!t && (isPlayerTarget(t) || this.onBF(t));
    switch (e.kind) {
      case 'damage': {
        const t = e.target === 'opponent' ? { player: 1 - p.idx } : targets[0];
        if (alive(t)) { this.dealDamage(source, t, e.n); if (source) this.say(p, `${source.def.label} causa ${e.n} de dano a ${this.tname(t)}.`); }
        break;
      }
      case 'pump': {
        const t = targets[0];
        if (alive(t) && !isPlayerTarget(t)) { t.pumpP += e.p; t.pumpT += e.t; this.fx.add(t.uid); }
        break;
      }
      case 'fight': {
        const [a, b] = targets as Card[];
        if (alive(a) && alive(b)) {
          const pa = pow(a), pb = pow(b);
          this.dealDamage(a, b, pa); this.dealDamage(b, a, pb);
        }
        break;
      }
      case 'destroy': {
        const t = targets[0];
        if (alive(t) && !isPlayerTarget(t)) this.kill(t, 'é destruída');
        break;
      }
      case 'draw': this.draw(p, e.n); break;
      case 'gain': p.life += e.n; this.say(p, `${p.name} ganha ${e.n} de vida.`); break;
    }
  }

  // ---------- Dano e ações de estado ----------
  dealDamage(src: Card | null, t: Target, n: number) {
    if (n <= 0) return;
    if (isPlayerTarget(t)) { this.players[t.player].life -= n; this.fx.add('p' + t.player); }
    else { t.damage += n; if (src && has(src, 'deathtouch')) t.dt = true; this.fx.add(t.uid); }
    if (src && has(src, 'lifelink')) {
      const ctl = this.players[src.owner];
      ctl.life += n;
      this.say(ctl, `${src.def.label}: ${ctl.name.toLowerCase()} ganha ${n} de vida.`);
    }
  }

  private kill(c: Card, verb = 'morre') {
    const p = this.players[c.owner];
    p.bf.splice(p.bf.indexOf(c), 1);
    Object.assign(c, { tapped: false, sick: false, damage: 0, dt: false, pumpP: 0, pumpT: 0, attacking: false, blocking: null, wasBlocked: false });
    p.gy.push(c);
    this.say(null, `${c.def.label} (${p.name.toLowerCase()}) ${verb}.`);
    for (const x of this.players.flatMap(pl => pl.bf)) if (x.blocking === c.uid) x.blocking = null;
  }

  checkState(): boolean {
    for (const p of this.players) {
      for (const c of p.bf.filter(c => isCreature(c) && (tou(c) - c.damage <= 0 || (c.dt && c.damage > 0)))) this.kill(c);
    }
    const lost = this.players.filter(p => p.life <= 0 || p.decked);
    if (lost.length && !this.over) {
      const [h, o] = this.players;
      const hl = lost.includes(h), ol = lost.includes(o);
      this.over = hl && ol ? { title: 'Empate', text: 'Os dois jogadores caíram ao mesmo tempo.', winner: null }
        : hl ? { title: 'Derrota', text: h.decked ? 'Seu grimório acabou.' : 'Sua vida chegou a zero.', winner: 1 }
        : { title: 'Vitória', text: o.decked ? 'O grimório do oponente acabou.' : 'A vida do oponente chegou a zero.', winner: 0 };
      this.busy = true; this.pending = null; this.mode = null;
      this.log.unshift({ msg: `${this.over.title}. ${this.over.text}`, sep: true });
      this.waiter = null;
    }
    return !!this.over;
  }

  // ---------- Combate ----------
  resolveCombat() {
    const A = this.activePlayer, D = this.other(A);
    const blockersOf = (a: Card) => D.bf.filter(b => b.blocking === a.uid);
    const involved = [...this.attackers(), ...D.bf.filter(b => b.blocking !== null)];
    const steps: ((c: Card) => boolean)[] = involved.some(strikesFirst)
      ? [c => strikesFirst(c), c => !has(c, 'first')]
      : [() => true];

    for (const deals of steps) {
      const ev: [Card, Target, number][] = [];
      for (const a of this.attackers()) {
        if (!deals(a) || pow(a) <= 0) continue;
        const bs = blockersOf(a);
        if (!a.wasBlocked) { ev.push([a, { player: D.idx }, pow(a)]); continue; }
        if (!bs.length) { if (has(a, 'trample')) ev.push([a, { player: D.idx }, pow(a)]); continue; }
        let rem = pow(a);
        bs.forEach((b, i) => {
          if (rem <= 0) return;
          const lethal = has(a, 'deathtouch') ? 1 : Math.max(1, tou(b) - b.damage);
          const amt = i === bs.length - 1 && !has(a, 'trample') ? rem : Math.min(rem, lethal);
          ev.push([a, b, amt]);
          rem -= amt;
        });
        if (rem > 0 && has(a, 'trample')) ev.push([a, { player: D.idx }, rem]);
      }
      for (const b of D.bf.filter(c => c.blocking !== null)) {
        const a = this.attackers().find(x => x.uid === b.blocking);
        if (a && deals(b) && pow(b) > 0) ev.push([b, a, pow(b)]);
      }
      for (const [s, t, n] of ev) {
        this.dealDamage(s, t, n);
        this.say(this.players[s.owner], `${s.def.label} causa ${n} de dano a ${this.tname(t)}.`);
      }
      if (this.checkState()) return;
    }
  }

  private endCombat() {
    for (const p of this.players) p.bf.forEach(c => { c.attacking = false; c.blocking = null; c.wasBlocked = false; });
    this.step = null; this.sel = null;
  }

  // ---------- Entrada do jogador humano (índice 0) ----------
  humanCanAct() {
    if (this.over || this.busy || this.mode || this.pending) return false;
    return this.active === 0 ? (this.isMain() && !this.step) || this.step === 'tricks' : this.step === 'tricks';
  }

  validTarget(t: Target): boolean {
    const pd = this.pending;
    if (!pd) return false;
    if (isPlayerTarget(t)) return pd.spec === 'any' || pd.spec === 'player';
    if (!this.onBF(t) || !isCreature(t) || pd.spec === 'player') return false;
    if (pd.spec === 'fight') return pd.targets.length === 0 ? t.owner === pd.controller : t.owner !== pd.controller;
    return true;
  }

  private addTarget(t: Target) {
    const pd = this.pending!;
    pd.targets.push(t);
    if (pd.targets.length < (pd.spec === 'fight' ? 2 : 1)) return;
    this.pending = null;
    const p = this.players[pd.controller];
    if (pd.from === 'spell') this.castSpell(p, pd.card, pd.targets);
    else { this.resolveEffect(p, pd.effect, pd.targets, pd.card); this.checkState(); }
  }

  clickCard(uid: number) {
    this.hint = '';
    this.handleCard(uid);
    this.emit();
  }

  private handleCard(uid: number) {
    if (this.over) return;
    const f = this.findCard(uid);
    if (!f) return;
    const { c, p, zone } = f;
    const me = this.players[0];

    if (this.pending) {
      if (zone === 'bf' && this.validTarget(c)) this.addTarget(c);
      else this.hint = 'Esse alvo não é válido.';
      return;
    }
    if (this.mode === 'discard') {
      if (zone === 'hand' && p === me) {
        this.discard(me, c);
        if (me.hand.length <= 7) this.waiter?.();
      }
      return;
    }
    if (this.mode === 'attack') {
      if (zone === 'bf' && p === me && isCreature(c)) {
        if (c.attacking) c.attacking = false;
        else if (canAttack(c)) c.attacking = true;
        else this.hint = c.tapped ? 'Criaturas viradas não podem atacar.'
          : has(c, 'defender') ? 'Criaturas com Defensor não atacam.'
          : 'Esta criatura está com enjoo de invocação.';
      }
      return;
    }
    if (this.mode === 'block') {
      if (zone === 'bf' && p !== me && c.attacking) { this.sel = c.uid; return; }
      if (zone === 'bf' && p === me && isCreature(c)) {
        if (c.blocking !== null) { c.blocking = null; return; }
        const a = this.byUid(this.sel);
        if (!a) this.hint = 'Selecione primeiro um atacante.';
        else if (c.tapped) this.hint = 'Criaturas viradas não podem bloquear.';
        else if (!canBlock(c, a)) this.hint = `${a.def.label} tem Voar: só criaturas com Voar ou Alcance a bloqueiam.`;
        else c.blocking = a.uid;
      }
      return;
    }
    if (!this.humanCanAct() || p !== me) return;
    if (zone === 'hand') {
      const why = this.whyNot(me, c);
      if (why) { this.hint = why; return; }
      if (isLand(c)) { this.playLand(me, c); return; }
      const te = this.targetedEffect(c.def);
      if (te) this.pending = { card: c, effect: te, spec: targetSpec(te)!, targets: [], from: 'spell', controller: 0 };
      else this.castSpell(me, c, []);
      return;
    }
    if (zone === 'bf' && c.def.produces.length) {
      if (!this.tapForMana(me, c)) this.hint = c.tapped ? 'Já está virado.' : 'Esta criatura está com enjoo de invocação.';
    }
  }

  clickPlayer(i: number) {
    if (this.over || !this.pending) return;
    this.hint = '';
    if (this.validTarget({ player: i })) this.addTarget({ player: i });
    else this.hint = 'Escolha uma criatura como alvo.';
    this.emit();
  }

  act(name: 'cancel' | 'combat' | 'attack' | 'blocks' | 'resolve' | 'endturn') {
    if (this.over) return;
    this.hint = '';
    switch (name) {
      case 'cancel':
        if (this.pending?.from === 'spell') this.pending = null;
        break;
      case 'combat':
        if (!this.humanCanAct() || this.active !== 0 || this.phase !== 'main1') break;
        this.setPhase('combat'); this.step = 'attackers'; this.mode = 'attack';
        if (!this.players[0].bf.some(canAttack)) this.hint = 'Nenhuma criatura pode atacar agora.';
        break;
      case 'attack':
        if (this.mode === 'attack') { void this.guard(this.humanAttack()); return; }
        break;
      case 'blocks': {
        if (this.mode !== 'block' || !this.waiter) break;
        const me = this.players[0];
        const bad = this.attackers().find(a => has(a, 'menace') && me.bf.filter(b => b.blocking === a.uid).length === 1);
        if (bad) { this.hint = `${bad.def.label} tem Ameaçar: precisa de dois ou mais bloqueadores.`; break; }
        this.waiter();
        break;
      }
      case 'resolve':
        if (this.step === 'tricks' && this.waiter) this.waiter();
        break;
      case 'endturn':
        if (this.humanCanAct() && this.active === 0 && this.isMain()) { void this.guard(this.endTurn()); return; }
        break;
    }
    this.emit();
  }
}
