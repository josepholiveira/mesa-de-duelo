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
  /** Impressão em português, quando existe. */
  pt?: { name?: string; type_line?: string; text?: string; image_uris?: { small?: string; normal?: string; art_crop?: string } };
  /** Já procuramos a impressão em português (achando ou não). */
  ptChecked?: boolean;
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

const images = (u: any) => u && { small: u.small, normal: u.normal, art_crop: u.art_crop };

/** Nome, tipo, texto e imagem de uma impressão em português (cartas de duas faces juntam as faces). */
function slimPt(c: any): ScryCard['pt'] {
  const faces: any[] = Array.isArray(c.card_faces) ? c.card_faces : [];
  const join = (k: string, sep: string) => faces.map(f => f[k]).filter(Boolean).join(sep) || undefined;
  return {
    name: c.printed_name ?? join('printed_name', ' // '),
    type_line: c.printed_type_line ?? join('printed_type_line', ' // '),
    text: c.printed_text ?? join('printed_text', '\n—\n'),
    // Sem scan da impressão traduzida o Scryfall devolve um aviso no lugar da arte; aí vale a imagem em inglês.
    image_uris: c.image_status === 'placeholder' || c.image_status === 'missing'
      ? undefined : images(c.image_uris ?? faces[0]?.image_uris),
  };
}

function slim(c: any): ScryCard {
  const pt = c.lang === 'pt';
  return {
    name: c.name,
    layout: c.layout,
    mana_cost: c.mana_cost,
    type_line: c.type_line,
    oracle_text: c.oracle_text,
    power: c.power,
    toughness: c.toughness,
    colors: c.colors,
    color_identity: c.color_identity,
    image_uris: c.image_status === 'placeholder' || c.image_status === 'missing' ? undefined : images(c.image_uris),
    faces: Array.isArray(c.card_faces) || undefined,
    pt: pt ? slimPt(c) : undefined,
    ptChecked: pt || undefined,
  };
}

export function cacheGet(name: string): ScryCard | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + name.toLowerCase());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function cachePut(card: ScryCard) {
  try { localStorage.setItem(CACHE_PREFIX + card.name.toLowerCase(), JSON.stringify(card)); } catch { /* cache cheio ou bloqueado */ }
}

/**
 * Completa as cartas com a impressão em português, em lotes de buscas `lang:pt (!"A" or !"B" …)`.
 * Cartas sem tradução ficam marcadas para não serem procuradas de novo; falha de rede não marca nada.
 */
async function addPortuguese(cards: ScryCard[]) {
  const todo = cards.filter(c => !c.ptChecked);
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
export async function fetchByNames(names: string[]): Promise<Map<string, ScryCard>> {
  const out = new Map<string, ScryCard>();
  const missing: string[] = [];
  for (const n of new Set(names)) {
    const c = cacheGet(n);
    if (c) out.set(n.toLowerCase(), c); else missing.push(n);
  }
  for (let i = 0; i < missing.length; i += 75) {
    const chunk = missing.slice(i, i + 75);
    const { json } = await request('/cards/collection', { identifiers: chunk.map(name => ({ name })) });
    for (const d of json?.data ?? []) {
      const s = slim(d);
      cachePut(s);
      out.set(s.name.toLowerCase(), s);
    }
  }
  await addPortuguese([...out.values()]);
  return out;
}

export async function searchCards(q: string, page = 1): Promise<{ cards: ScryCard[]; hasMore: boolean; total: number }> {
  // Multilíngue para aceitar também o nome em português ("Golpe Relampejante").
  const { status, json } = await request(`/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=name&include_multilingual=true&page=${page}`);
  if (status === 404) return { cards: [], hasMore: false, total: 0 };
  const cards: ScryCard[] = (json.data ?? []).map(slim);
  cards.forEach(cachePut);
  await addPortuguese(cards);
  return { cards, hasMore: !!json.has_more, total: json.total_cards ?? cards.length };
}
