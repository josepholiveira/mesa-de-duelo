import { COLORS, type CardDef, type CardType, type Color, type Effect, type Keyword, type ManaCost } from './types';
import { targetSpec } from './rules';

/** Subconjunto dos campos do Scryfall que o jogo usa. */
export interface ScryCard {
  name: string;
  layout: string;
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  color_identity?: string[];
  image_uris?: { small?: string; normal?: string; art_crop?: string };
  faces?: boolean;
  /** Impressão em português, quando existe. As regras continuam lendo o texto Oracle em inglês. */
  pt?: { name?: string; type_line?: string; text?: string; image_uris?: { small?: string; normal?: string; art_crop?: string } };
  /** Já procuramos a impressão em português (achando ou não). */
  ptChecked?: boolean;
}

const KW: Record<string, Keyword> = {
  flying: 'flying', reach: 'reach', haste: 'haste', vigilance: 'vigilance', trample: 'trample',
  deathtouch: 'deathtouch', lifelink: 'lifelink', 'first strike': 'first', 'double strike': 'double',
  defender: 'defender', menace: 'menace',
};
const BASIC: Record<string, Color> = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G', Wastes: 'C' };
const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const toNum = (s: string): number | undefined => (/^\d+$/.test(s) ? +s : NUM[s]);

export const emptyCost = (): ManaCost => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
export const cmcOf = (c: ManaCost) => c.generic + COLORS.reduce((s, k) => s + c[k], 0);

/** Retorna null para custos que o motor ainda não entende (X, híbrido, phyrexiano). */
export function parseManaCost(s = ''): ManaCost | null {
  const cost = emptyCost();
  const syms = s.match(/\{[^}]+\}/g) ?? [];
  if (syms.join('') !== s) return null;
  for (const raw of syms) {
    const x = raw.slice(1, -1);
    if (/^\d+$/.test(x)) cost.generic += +x;
    else if ((COLORS as string[]).includes(x)) cost[x as Color]++;
    else return null;
  }
  return cost;
}

const SUBJ = '(?:~|this spell|this creature)';
const DAMAGE_RE = new RegExp(
  `^${SUBJ} deals (\\w+) damage to (any target|target creature|target player or planeswalker|target player|target opponent or planeswalker|target opponent|each opponent)$`,
);

/** Interpreta uma frase do texto de regras (já normalizada: minúsculas, nome da carta = "~"). */
export function parseEffect(sentence: string): Effect | null {
  const s = sentence.trim().replace(/\.$/, '');
  let m: RegExpMatchArray | null;
  if ((m = s.match(DAMAGE_RE))) {
    const n = toNum(m[1]);
    if (!n) return null;
    const t = m[2] === 'any target' ? 'any'
      : m[2] === 'target creature' ? 'creature'
      : m[2].includes('opponent') ? 'opponent' : 'player';
    return { kind: 'damage', n, target: t };
  }
  if ((m = s.match(/^target creature gets \+(\d+)\/\+(\d+) until end of turn$/))) return { kind: 'pump', p: +m[1], t: +m[2] };
  if (s === "target creature you control fights target creature you don't control") return { kind: 'fight' };
  if (s === 'destroy target creature') return { kind: 'destroy' };
  if ((m = s.match(/^draw (\w+) cards?$/))) { const n = toNum(m[1]); return n ? { kind: 'draw', n } : null; }
  if ((m = s.match(/^you gain (\w+) life$/))) { const n = toNum(m[1]); return n ? { kind: 'gain', n } : null; }
  return null;
}

const stripReminder = (l: string) => l.replace(/\s*\([^)]*\)/g, '').trim();
const sentences = (l: string) => l.split(/\.\s*/).map(x => x.trim()).filter(Boolean);

export function toCardDef(sc: ScryCard): CardDef {
  const cost = parseManaCost(sc.mana_cost ?? '');
  const def: CardDef = {
    name: sc.name, label: sc.pt?.name || sc.name, labelType: sc.pt?.type_line || sc.type_line, printedText: sc.pt?.text,
    type: 'creature', typeLine: sc.type_line, manaCost: sc.mana_cost ?? '',
    cost: cost ?? emptyCost(), cmc: cost ? cmcOf(cost) : 0,
    colors: [], power: 0, toughness: 0, keywords: [], text: sc.oracle_text ?? '',
    produces: [], entersTapped: false, spell: [], etb: [],
    image: sc.pt?.image_uris?.normal ?? sc.image_uris?.normal,
    imageSmall: sc.pt?.image_uris?.small ?? sc.image_uris?.small,
    artCrop: sc.pt?.image_uris?.art_crop ?? sc.image_uris?.art_crop,
    supported: true,
  };
  const fail = (problem: string): CardDef => ({ ...def, supported: false, problem });

  if (sc.layout !== 'normal' || sc.faces) return fail('formato de carta não suportado');
  if (!cost) return fail('custo de mana não suportado');

  const tl = sc.type_line;
  let type: CardType;
  if (/\bLand\b/.test(tl)) { if (/Creature/.test(tl)) return fail('terreno-criatura'); type = 'land'; }
  else if (/\bCreature\b/.test(tl)) type = 'creature';
  else if (/\bInstant\b/.test(tl)) type = 'instant';
  else if (/\bSorcery\b/.test(tl)) type = 'sorcery';
  else return fail(`tipo não suportado (${tl})`);
  def.type = type;

  const colorSrc = type === 'land' ? sc.color_identity : sc.colors;
  def.colors = (colorSrc ?? []).filter((c): c is Color => (COLORS as string[]).includes(c));

  if (type === 'creature') {
    if (!/^\d+$/.test(sc.power ?? '') || !/^\d+$/.test(sc.toughness ?? '')) return fail('poder/resistência variável');
    def.power = +sc.power!;
    def.toughness = +sc.toughness!;
  }
  if (type === 'land') {
    const sub = tl.split('—')[1] ?? '';
    for (const w of sub.trim().split(/\s+/)) if (BASIC[w] && !def.produces.includes(BASIC[w])) def.produces.push(BASIC[w]);
  }

  const lines = def.text.split('\n').map(stripReminder).filter(Boolean);
  for (const raw of lines) {
    const l = raw.split(sc.name).join('~').toLowerCase().replace(/\.$/, '');
    const parts = l.split(/,\s*/);
    if (parts.every(p => KW[p])) { parts.forEach(p => def.keywords.push(KW[p])); continue; }

    if (l.startsWith('{t}: add ')) {
      const rest = l.slice('{t}: add '.length);
      const syms = [...rest.matchAll(/\{([wubrgc])\}/g)].map(x => x[1].toUpperCase() as Color);
      const leftover = rest.replace(/\{[wubrgc]\}/g, '').replace(/,|\bor\b|\s/g, '');
      if (syms.length && !leftover && !rest.includes('}{')) { def.produces.push(...syms.filter(c => !def.produces.includes(c))); continue; }
      return fail(`habilidade de mana não suportada: "${raw}"`);
    }
    if (type === 'land' && /^(?:this land|~) enters(?: the battlefield)? tapped$/.test(l)) { def.entersTapped = true; continue; }

    const etb = l.match(/^when (?:~|this creature) enters(?: the battlefield)?, (.+)$/);
    if (type === 'creature' && etb) {
      const effs = sentences(etb[1]).map(parseEffect);
      if (effs.every(Boolean)) { def.etb.push(...(effs as Effect[])); continue; }
      return fail(`habilidade não suportada: "${raw}"`);
    }
    if (type === 'instant' || type === 'sorcery') {
      const effs = sentences(l).map(parseEffect);
      if (effs.every(Boolean)) { def.spell.push(...(effs as Effect[])); continue; }
    }
    return fail(`texto não suportado: "${raw}"`);
  }

  if (type === 'land' && !def.produces.length) return fail('terreno sem habilidade de mana reconhecida');
  if ((type === 'instant' || type === 'sorcery') && !def.spell.length) return fail('mágica sem efeito reconhecido');
  if (def.spell.filter(e => targetSpec(e)).length > 1 || def.etb.filter(e => targetSpec(e)).length > 1) return fail('mais de um alvo');
  return def;
}
