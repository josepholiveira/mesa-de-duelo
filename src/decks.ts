import starterDecks from '../shared/starter-decks.json' with { type: 'json' };

export type DeckFormat = 'free' | 'pauper';
export interface DeckEntry { name: string; count: number; oracleId?: string }
export interface DeckData {
  id: string;
  name: string;
  cards: DeckEntry[];
  sideboard?: DeckEntry[];
  builtin?: boolean;
  format?: DeckFormat;
  updatedAt?: string;
  sourceTemplateId?: string;
  importSource?: string;
  importHistory?: string[];
  unresolved?: string[];
}
export const DEFAULT_DECKS = starterDecks as DeckData[];
const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes', 'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest'].map(n => n.toLowerCase()));
export const isBasic = (name: string) => BASICS.has(name.toLowerCase());
export const countEntries = (entries: DeckEntry[]) => entries.reduce((s, e) => s + e.count, 0);
export const deckSize = (d: DeckData) => countEntries(d.cards);
export const deckEntries = (d: DeckData) => [...d.cards, ...(d.sideboard ?? [])];
export const allDecks = (): DeckData[] => [...loadUserDecks(), ...DEFAULT_DECKS];

export const DECK_STORAGE_KEY = 'mesa:decks:v2';
export const LEGACY_DECK_KEY = 'mesa:decks:v1';
export interface DeckStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface LibraryState { decks: DeckData[]; recovery: unknown[]; error?: string; backup?: string }
export type SaveResult = { ok: true } | { ok: false; error: string };
let state: LibraryState = { decks: [], recovery: [] };
let volatileDecks: DeckData[] | null = null;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function validEntries(v: unknown): v is DeckEntry[] {
  return Array.isArray(v) && v.every(e => object(e) && typeof e.name === 'string' && !!e.name.trim()
    && Number.isSafeInteger(e.count) && Number(e.count) > 0 && (e.oracleId === undefined || typeof e.oracleId === 'string'));
}
function validDeck(v: unknown): v is DeckData {
  return object(v) && typeof v.id === 'string' && !!v.id && typeof v.name === 'string' && validEntries(v.cards)
    && (v.sideboard === undefined || validEntries(v.sideboard)) && (v.format === undefined || v.format === 'free' || v.format === 'pauper')
    && (v.unresolved === undefined || (Array.isArray(v.unresolved) && v.unresolved.every(n => typeof n === 'string')));
}

/** Invalid records are retained verbatim for export; migration never rewrites v1. */
export function readDeckLibrary(storage: DeckStorage): LibraryState {
  let raw: string | null = null;
  let legacy = false;
  try {
    raw = storage.getItem(DECK_STORAGE_KEY);
    if (raw === null) { raw = storage.getItem(LEGACY_DECK_KEY); legacy = raw !== null; }
    if (raw === null) return { decks: [], recovery: [] };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
      return { decks: [], recovery: [raw], error: 'Não foi possível ler seus decks. Exporte a recuperação antes de continuar.' };
    }
    const records = legacy && Array.isArray(parsed) ? parsed : object(parsed) && parsed.version === 2 && Array.isArray(parsed.decks) ? parsed.decks : null;
    if (!records) return { decks: [], recovery: [raw], error: 'O arquivo de decks tem um formato desconhecido. Os dados originais foram preservados.' };
    const recovery: unknown[] = object(parsed) && Array.isArray(parsed.recovery) ? [...parsed.recovery] : [];
    const seen = new Set<string>();
    const decks: DeckData[] = [];
    for (const record of records) {
      if (!validDeck(record) || seen.has(record.id)) { recovery.push(record); continue; }
      seen.add(record.id);
      decks.push({ ...record, builtin: false, format: record.format ?? 'free', sideboard: record.sideboard ?? [] });
    }
    const result: LibraryState = { decks, recovery };
    if (recovery.length) result.error = 'Alguns registros precisam de recuperação. Exporte os dados originais; seus decks reconhecidos continuam disponíveis.';
    if (legacy) {
      const backup = 'mesa:decks:v1:backup';
      try {
        if (storage.getItem(backup) === null) storage.setItem(backup, raw);
        storage.setItem(DECK_STORAGE_KEY, JSON.stringify({ version: 2, decks, recovery }));
        result.backup = backup;
      } catch { result.error = 'Não foi possível concluir a migração. Seus decks antigos continuam preservados.'; }
    }
    return result;
  } catch { return { decks: [], recovery: raw ? [raw] : [], error: 'O armazenamento deste navegador não está disponível.' }; }
}

export function loadUserDecks(): DeckData[] {
  if (volatileDecks) return volatileDecks;
  try { state = readDeckLibrary(localStorage); }
  catch { state = { decks: [], recovery: [], error: 'O armazenamento deste navegador não está disponível.' }; }
  return state.decks;
}
export function getDeckStorageState(): LibraryState { return state; }
export function exportDeckRecovery(): string {
  const original: Record<string, string | null> = {};
  try { for (const key of [LEGACY_DECK_KEY, DECK_STORAGE_KEY, 'mesa:decks:v1:backup']) original[key] = localStorage.getItem(key); } catch { /* Include in-memory drafts even without storage. */ }
  return JSON.stringify({ exportedAt: new Date().toISOString(), decks: volatileDecks ?? state.decks, recovery: state.recovery, original }, null, 2);
}
export function writeDeckLibrary(storage: DeckStorage, decks: DeckData[], recovery: unknown[] = []): SaveResult {
  if (!decks.every(validDeck)) return { ok: false, error: 'Há dados inválidos no deck. Exporte uma cópia para preservar suas alterações.' };
  try {
    const raw = storage.getItem(DECK_STORAGE_KEY);
    if (raw !== null) {
      // Keep an exact recovery copy before replacing malformed/partially recoverable data.
      let needsBackup = false;
      try {
        const parsed: unknown = JSON.parse(raw);
        needsBackup = !object(parsed) || parsed.version !== 2 || !Array.isArray(parsed.decks) || parsed.decks.some(d => !validDeck(d));
      } catch { needsBackup = true; }
      if (needsBackup) storage.setItem(`mesa:decks:recovery:${Date.now()}`, raw);
    }
    storage.setItem(DECK_STORAGE_KEY, JSON.stringify({ version: 2, decks, recovery }));
    return { ok: true };
  } catch { return { ok: false, error: 'Não foi possível salvar neste navegador. Suas alterações estão nesta aba; exporte uma cópia ou tente novamente.' }; }
}
export function saveUserDecks(decks: DeckData[]): SaveResult {
  let result: SaveResult;
  try { result = writeDeckLibrary(localStorage, decks, state.recovery); }
  catch { result = { ok: false, error: 'O armazenamento não está disponível. Exporte uma cópia para guardar suas alterações.' }; }
  state = { ...state, decks, error: result.ok ? undefined : result.error };
  volatileDecks = result.ok ? null : decks;
  return result;
}

export interface ParsedList { main: DeckEntry[]; sideboard: DeckEntry[]; skipped: string[]; ignored: string[] }
const SECTION = /^(deck|main ?deck|mainboard|commanders?|companions?|sideboard|maybeboard|considering|tokens?)$/i;

/** Preserve sideboards and reject malformed quantities instead of quietly shortening a deck. */
export function parseDeckList(text: string): ParsedList {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim());
  const sectionOf = (line: string) => {
    const h = line.replace(/^\/\/\s*/, '').replace(/\s*\(\d+\)\s*$/, '').replace(/:\s*$/, '').trim();
    return SECTION.test(h) ? h.toLowerCase() : null;
  };
  const hasHeaders = lines.some(l => sectionOf(l));
  const main = new Map<string, DeckEntry>(), sideboard = new Map<string, DeckEntry>();
  const skipped: string[] = [], ignored: string[] = [];
  let section: 'main' | 'sideboard' | 'ignored' = 'main';
  let seenCard = false;
  for (const raw of lines) {
    if (!raw) { if (!hasHeaders && seenCard) section = 'sideboard'; continue; }
    const header = sectionOf(raw);
    if (header) { section = /^(deck|main)/.test(header) ? 'main' : header === 'sideboard' ? 'sideboard' : 'ignored'; continue; }
    if (/^(\/\/|#)/.test(raw) || /^(about|name)\s/i.test(raw)) continue;
    const sb = /^SB:\s*/i.test(raw);
    const line = raw.replace(/^SB:\s*/i, '');
    const m = line.match(/^(?:(\d+)\s*x?\s+)?(.+)$/i);
    if (!m || (!m[1] && /^[+\-\d]/.test(line) && /^[+\-]?\d*(?:[.,]\d+|\s*x?\s)/i.test(line))) { skipped.push(raw); continue; }
    const count = m[1] ? Number(m[1]) : 1;
    const tag = /\[[^\]]*\b(sideboard|maybeboard|considering|tokens?)\b[^\]]*\]/i.exec(m[2]);
    const name = m[2].replace(/\s*\^[^^]*\^/g, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\*[A-Z]+\*/g, '')
      .replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+[\w★-]+)?\s*$/, '').replace(/\s*\/\/\s*/g, ' // ').trim();
    if (!name || !Number.isSafeInteger(count) || count <= 0) { skipped.push(raw); continue; }
    seenCard = true;
    if ((!sb && section === 'ignored') || (tag && tag[1].toLowerCase() !== 'sideboard')) { ignored.push(raw); continue; }
    const pool = sb || section === 'sideboard' || tag ? sideboard : main;
    const key = name.toLowerCase(), previous = pool.get(key);
    if (previous && !Number.isSafeInteger(previous.count + count)) { skipped.push(raw); continue; }
    if (previous) previous.count += count; else pool.set(key, { name, count });
  }
  return { main: [...main.values()], sideboard: [...sideboard.values()], skipped, ignored };
}
export function exportDeckList(deck: DeckData): string {
  return `Deck\n${deck.cards.map(e => `${e.count} ${e.name}`).join('\n')}${deck.sideboard?.length ? `\n\nSideboard\n${deck.sideboard.map(e => `${e.count} ${e.name}`).join('\n')}` : ''}\n`;
}
