import { countEntries, deckEntries, isBasic, type DeckData, type DeckFormat } from '../decks';
import { cacheGet, legalityFresh, type ScryCard } from '../scryfall';

export interface DeckIssue { code: string; message: string; card?: string; section?: 'main' | 'sideboard' }
export interface ServerDeckValidation { valid: boolean; issues: DeckIssue[]; rulesVersion?: string; engineVersion?: string }
export interface LocalDeckValidation { status: 'valid' | 'invalid' | 'unknown'; issues: DeckIssue[] }
const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
export function cardCopyLimit(name: string, card: ScryCard | null = cacheGet(name)): number {
  if (isBasic(name) || /\bBasic\b.*\bLand\b/.test(card?.type_line ?? '')) return Infinity;
  const limit = card?.oracle_text?.match(/A deck can have (any number of|up to (\w+)) cards named/i);
  return !limit ? 4 : !limit[2] ? Infinity : NUMBERS[limit[2].toLowerCase()] ?? (Number(limit[2]) || 4);
}
export function copiesInDeck(deck: DeckData, name: string): number {
  const card = cacheGet(name), key = card?.oracle_id ?? card?.name.toLowerCase() ?? name.toLowerCase();
  return deckEntries(deck).reduce((sum, e) => {
    const sc = cacheGet(e.name), entryKey = e.oracleId ?? sc?.oracle_id ?? sc?.name.toLowerCase() ?? e.name.toLowerCase();
    return sum + (entryKey === key ? e.count : 0);
  }, 0);
}
/** Provisional feedback only. Match creation is always validated again by the bridge. */
export function validateDeckLocal(deck: DeckData, format: DeckFormat = deck.format ?? 'free'): LocalDeckValidation {
  const issues: DeckIssue[] = [], unknown = new Set<string>();
  const main = countEntries(deck.cards), side = countEntries(deck.sideboard ?? []);
  if (!main || (format === 'pauper' && main < 60)) issues.push({ code: 'main_count', message: format === 'pauper' ? `O deck principal precisa de pelo menos 60 cartas. Faltam ${60 - main}.` : 'Adicione cartas ao deck principal.', section: 'main' });
  if (format === 'pauper' && side > 15) issues.push({ code: 'sideboard_count', message: `O sideboard pode ter até 15 cartas. Remova ${side - 15}.`, section: 'sideboard' });
  const copies = new Map<string, { count: number; name: string; card: ScryCard | null }>();
  for (const [section, entries] of [['main', deck.cards], ['sideboard', deck.sideboard ?? []]] as const) {
    for (const entry of entries) {
      if (!Number.isSafeInteger(entry.count) || entry.count < 1) { issues.push({ code: 'quantity', card: entry.name, section, message: `Quantidade inválida: ${entry.name}.` }); continue; }
      const card = cacheGet(entry.name);
      if (format === 'pauper') {
        if (!card || !legalityFresh(card) || !card.legalities?.pauper) unknown.add(entry.name);
        else if (card.legalities.pauper !== 'legal') issues.push({ code: card.legalities.pauper === 'banned' ? 'banned' : 'format', card: entry.name, section, message: `${card.pt?.name || entry.name}: ${card.legalities.pauper === 'banned' ? 'banida no Pauper' : 'não é válida no Pauper'}.` });
      }
      const key = entry.oracleId ?? card?.oracle_id ?? card?.name.toLowerCase() ?? entry.name.toLowerCase();
      const previous = copies.get(key);
      if (previous) previous.count += entry.count; else copies.set(key, { count: entry.count, name: entry.name, card });
    }
  }
  if (format === 'pauper') for (const { count, name, card } of copies.values()) {
    const limit = cardCopyLimit(name, card);
    if (count > limit && (card || isBasic(name))) issues.push({ code: 'copies', card: name, message: `${name}: ${count} cópias entre deck e sideboard; o limite é ${limit}.` });
  }
  for (const name of deck.unresolved ?? []) issues.push({ code: 'unresolved', card: name, message: `Carta não reconhecida na importação: ${name}.` });
  if (unknown.size) issues.push({ code: 'unverified', message: `A legalidade de ${unknown.size} ${unknown.size === 1 ? 'carta ainda não foi verificada' : 'cartas ainda não foi verificada'}.` });
  return { status: issues.some(i => i.code !== 'unverified') ? 'invalid' : unknown.size ? 'unknown' : 'valid', issues };
}
