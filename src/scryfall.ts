type Images = { small?: string; normal?: string; art_crop?: string };

/**
 * Versão do formato guardado no cache. Cartas de duas faces salvas antes da v2 ficaram sem imagem
 * (o Scryfall põe as imagens dentro de cada face) e são buscadas de novo.
 */
const FORMAT = 3;
const LEGALITY_TTL = 24 * 60 * 60 * 1000;
const memory = new Map<string, ScryCard>();

/** Subconjunto dos campos do Scryfall que o jogo usa. */
export interface ScryCard {
  name: string;
  oracle_id?: string;
  cmc?: number;
  rarity?: string;
  legalities?: Record<string, 'legal' | 'not_legal' | 'restricted' | 'banned'>;
  fetchedAt?: number;
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
  /** Nome e imagem de cada face (cartas de duas faces: o Forge chama a carta pelo nome da face visível). */
  faceNames?: string[];
  faceImages?: (Images | undefined)[];
  /** Impressão em português, quando existe. */
  pt?: { name?: string; type_line?: string; text?: string; image_uris?: Images; faceNames?: string[]; faceImages?: (Images | undefined)[] };
  /** Já procuramos a impressão em português (achando ou não). */
  ptChecked?: boolean;
  v?: number;
}

/**
 * Cliente mínimo da API do Scryfall (https://scryfall.com/docs/api).
 * Respeita o intervalo pedido pela API entre requisições e guarda as cartas no localStorage.
 */
const API = 'https://api.scryfall.com';
const CACHE_PREFIX = 'scry:v1:';
const MIN_INTERVAL = 110;

let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastAt + MIN_INTERVAL - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function request(path: string, body?: unknown): Promise<{ status: number; json: any }> {
  return throttled(async () => {
    const res = await fetch(API + path, body === undefined
      ? { headers: { Accept: 'application/json' } }
      : { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok && res.status !== 404) throw new Error(json?.details ?? `Scryfall respondeu ${res.status}`);
    return { status: res.status, json };
  });
}

const images = (u: any): Images | undefined => u && { small: u.small, normal: u.normal, art_crop: u.art_crop };
/**
 * Arte fixa dos terrenos básicos: série de Magali Villeneuve em Dominaria United (DMU 277–281, arte cheia).
 * Vale em todas as telas, inclusive no lugar da impressão em português.
 */
const BASIC_ART: Record<string, string> = { plains: '277', island: '278', swamp: '279', mountain: '280', forest: '281' };
const basicImages = (num: string): Images => {
  const url = (version: string) => `${API}/cards/dmu/${num}?format=image&version=${version}`;
  return { small: url('small'), normal: url('normal'), art_crop: url('art_crop') };
};
function withBasicArt(c: ScryCard): ScryCard {
  const num = BASIC_ART[c.name.toLowerCase()];
  return num ? { ...c, image_uris: basicImages(num), pt: c.pt && { ...c.pt, image_uris: undefined } } : c;
}

/** O /cards/collection não acha "Frente // Verso" (nem cartas divididas como "Fire // Ice"), só o nome da frente. */
const lookupName = (name: string) => name.split(' // ')[0];
const noScan = (c: any) => c.image_status === 'placeholder' || c.image_status === 'missing';

/** Nome, tipo, texto e imagem de uma impressão em português (cartas de duas faces juntam as faces). */
function slimPt(c: any): ScryCard['pt'] {
  const faces: any[] = Array.isArray(c.card_faces) ? c.card_faces : [];
  const join = (k: string, sep: string) => faces.map(f => f[k]).filter(Boolean).join(sep) || undefined;
  // Sem scan da impressão traduzida o Scryfall devolve um aviso no lugar da arte; aí vale a imagem em inglês.
  const faceImages = noScan(c) ? undefined : faces.map(f => images(f.image_uris));
  return {
    name: c.printed_name ?? join('printed_name', ' // '),
    type_line: c.printed_type_line ?? join('printed_type_line', ' // '),
    text: c.printed_text ?? join('printed_text', '\n—\n'),
    image_uris: noScan(c) ? undefined : images(c.image_uris) ?? faceImages?.[0],
    faceNames: faces.length ? faces.map(f => f.printed_name) : undefined,
    faceImages: faceImages?.length ? faceImages : undefined,
  };
}

function slim(c: any): ScryCard {
  const pt = c.lang === 'pt';
  const faces: any[] = Array.isArray(c.card_faces) ? c.card_faces : [];
  const faceImages = noScan(c) ? [] : faces.map(f => images(f.image_uris));
  return {
    v: FORMAT,
    name: c.name,
    oracle_id: c.oracle_id,
    cmc: c.cmc,
    rarity: c.rarity,
    legalities: c.legalities,
    fetchedAt: Date.now(),
    layout: c.layout,
    mana_cost: c.mana_cost ?? faces[0]?.mana_cost,
    type_line: c.type_line,
    oracle_text: c.oracle_text ?? (faces.length ? faces.map(f => `${f.name}\n${f.oracle_text ?? ''}`).join('\n—\n') : undefined),
    power: c.power,
    toughness: c.toughness,
    colors: c.colors,
    color_identity: c.color_identity,
    image_uris: noScan(c) ? undefined : images(c.image_uris) ?? faceImages[0],
    faces: faces.length > 0 || undefined,
    faceNames: faces.length ? faces.map(f => f.name) : undefined,
    faceImages: faceImages.some(Boolean) ? faceImages : undefined,
    pt: pt ? slimPt(c) : undefined,
    ptChecked: pt || undefined,
  };
}

export function legalityFresh(card: ScryCard): boolean {
  return !!card.legalities && !!card.fetchedAt && Date.now() - card.fetchedAt < LEGALITY_TTL;
}

export function cacheGet(name: string): ScryCard | null {
  const cached = memory.get(name.toLowerCase());
  if (cached) return withBasicArt(cached);
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + name.toLowerCase());
    const c: ScryCard | null = raw ? JSON.parse(raw) : null;
    if (!c || c.v !== FORMAT || typeof c.name !== 'string' || typeof c.type_line !== 'string' || typeof c.layout !== 'string') return null;
    memory.set(name.toLowerCase(), c);
    return withBasicArt(c);
  } catch { return null; }
}

/** A carta vista por uma das faces: imagem e nome em português daquela face. */
function faceView(card: ScryCard, i: number): ScryCard {
  return {
    ...card,
    image_uris: card.faceImages?.[i] ?? card.image_uris,
    pt: card.pt && { ...card.pt, name: card.pt.faceNames?.[i] ?? card.pt.name, image_uris: card.pt.faceImages?.[i] ?? card.pt.image_uris },
  };
}

/** Guarda a carta pelo nome completo e também pelo nome de cada face ("The Enigma Jewel", "Locus of Enlightenment"). */
function cachePut(card: ScryCard) {
  memory.set(card.name.toLowerCase(), card);
  card.faceNames?.forEach((fn, i) => { if (fn) memory.set(fn.toLowerCase(), faceView(card, i)); });
  try {
    localStorage.setItem(CACHE_PREFIX + card.name.toLowerCase(), JSON.stringify(card));
    card.faceNames?.forEach((fn, i) => {
      if (fn && fn.toLowerCase() !== card.name.toLowerCase()) localStorage.setItem(CACHE_PREFIX + fn.toLowerCase(), JSON.stringify(faceView(card, i)));
    });
  } catch { /* cache cheio ou bloqueado */ }
}

/**
 * Completa as cartas com a impressão em português, em lotes de buscas `lang:pt (!"A" or !"B" …)`.
 * Cartas sem tradução ficam marcadas para não serem procuradas de novo; falha de rede não marca nada.
 */
async function addPortuguese(cards: ScryCard[]) {
  // Registros guardados pelo nome de uma face apontam para a carta inteira: a tradução é gravada nela.
  const todo = [...new Map(cards.filter(c => !c.ptChecked).map(c => [c.name, cacheGet(c.name) ?? c])).values()];
  for (let i = 0; i < todo.length; i += 30) {
    const chunk = todo.slice(i, i + 30);
    const q = `lang:pt (${chunk.map(c => `!"${c.name.replace(/"/g, '')}"`).join(' or ')})`;
    try {
      const { status, json } = await request(`/cards/search?q=${encodeURIComponent(q)}&unique=cards`);
      const found = new Map<string, any>((status === 404 ? [] : json?.data ?? []).map((d: any) => [d.name.toLowerCase(), d]));
      for (const c of chunk) {
        const d = found.get(c.name.toLowerCase());
        if (d) c.pt = slimPt(d);
        c.ptChecked = true;
        cachePut(c);
      }
    } catch { /* sem rede: fica em inglês e tenta de novo depois */ }
  }
}

/** Busca cartas pelo nome exato. A chave do mapa é o nome em minúsculas. */
export async function fetchByNames(names: string[], refreshLegality = false): Promise<Map<string, ScryCard>> {
  const out = new Map<string, ScryCard>();
  const missing: string[] = [];
  for (const n of new Set(names)) {
    const c = cacheGet(n);
    if (c && (!refreshLegality || legalityFresh(c))) out.set(n.toLowerCase(), c); else missing.push(n);
  }
  for (let i = 0; i < missing.length; i += 75) {
    const chunk = missing.slice(i, i + 75);
    const { json } = await request('/cards/collection', { identifiers: chunk.map(name => ({ name: lookupName(name) })) });
    for (const d of json?.data ?? []) {
      const s = slim(d);
      cachePut(s);
      out.set(s.name.toLowerCase(), s);
    }
  }
  await addPortuguese([...out.values()]);
  return out;
}

export async function searchCards(q: string, page = 1, format?: 'free' | 'pauper' | 'commander'): Promise<{ cards: ScryCard[]; hasMore: boolean; total: number }> {
  if (format === 'pauper' || format === 'commander') q = `(${q}) f:${format}`;
  // Multilíngue para aceitar também o nome em português ("Golpe Relampejante").
  const { status, json } = await request(`/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=name&include_multilingual=true&page=${page}`);
  if (status === 404) return { cards: [], hasMore: false, total: 0 };
  const cards: ScryCard[] = (json.data ?? []).map(slim);
  cards.forEach(cachePut);
  await addPortuguese(cards);
  return { cards: cards.map(withBasicArt), hasMore: !!json.has_more, total: json.total_cards ?? cards.length };
}

/**
 * Confere nomes digitados ou colados contra o Scryfall e devolve o nome oficial (em inglês) de cada um.
 * Aceita a face da frente de cartas de duas faces e, para o que não achar, tenta o nome impresso
 * em outros idiomas (ex.: "Golpe Relampejante"). A chave do mapa é o nome de entrada em minúsculas.
 */
export async function resolveCardNames(names: string[]): Promise<{ found: Map<string, string>; missing: string[] }> {
  const found = new Map<string, string>();
  const todo: string[] = [];
  for (const n of new Set(names)) {
    const c = cacheGet(n);
    if (c) found.set(n.toLowerCase(), c.name); else todo.push(n);
  }
  for (let i = 0; i < todo.length; i += 75) {
    const chunk = todo.slice(i, i + 75);
    const { json } = await request('/cards/collection', { identifiers: chunk.map(name => ({ name: lookupName(name) })) });
    const byName = new Map<string, string>();
    for (const d of json?.data ?? []) {
      const s = slim(d);
      cachePut(s);
      byName.set(s.name.toLowerCase(), s.name);
      for (const f of d.card_faces ?? []) if (f.name) byName.set(String(f.name).toLowerCase(), s.name);
    }
    for (const n of chunk) { const hit = byName.get(n.toLowerCase()); if (hit) found.set(n.toLowerCase(), hit); }
  }
  const missing: string[] = [];
  for (const n of todo.filter(n => !found.has(n.toLowerCase()))) {
    try {
      const r = await searchCards(`!"${n.replace(/"/g, '')}"`);
      if (r.cards[0]) found.set(n.toLowerCase(), r.cards[0].name); else missing.push(n);
    } catch { missing.push(n); }
  }
  return { found, missing };
}
