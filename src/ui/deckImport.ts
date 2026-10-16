import { countEntries, type DeckData, type DeckEntry } from '../decks';

export type DeckImportMode = 'merge' | 'replace';

/** Storage adds these defaults; they are not changes to a freshly created deck. */
export function deckImportSnapshot(deck: DeckData): string {
  const { builtin: _builtin, format, sideboard, ...rest } = deck;
  return JSON.stringify({ ...rest, builtin: false, format: format ?? 'free', sideboard: sideboard ?? [] });
}

function combine(entries: DeckEntry[]): DeckEntry[] {
  const result: DeckEntry[] = [];
  for (const entry of entries) {
    if (!entry.name.trim() || !Number.isSafeInteger(entry.count) || entry.count <= 0) throw new Error('A lista contém uma quantidade inválida.');
    const previous = result.find(e => (e.oracleId && entry.oracleId && e.oracleId === entry.oracleId) || e.name.toLowerCase() === entry.name.toLowerCase());
    if (previous) {
      if (!Number.isSafeInteger(previous.count + entry.count)) throw new Error(`Quantidade muito grande para ${entry.name}.`);
      previous.count += entry.count;
      previous.oracleId ??= entry.oracleId;
    } else result.push({ ...entry });
  }
  if (!Number.isSafeInteger(countEntries(result))) throw new Error('A lista contém cartas demais.');
  return result;
}

/** Build a review without changing the original deck or its identity/metadata. */
export function applyDeckImport(target: DeckData, incoming: DeckData, mode: DeckImportMode): DeckData {
  if (target.builtin) throw new Error('Crie uma cópia deste deck pronto antes de importar cartas.');
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Escolha como aplicar a lista.');
  if (!incoming.cards.length && !incoming.sideboard?.length) throw new Error('A lista não contém cartas para importar.');
  const cards = combine([...(mode === 'merge' ? target.cards : []), ...incoming.cards]);
  const sideboard = combine([...(mode === 'merge' ? target.sideboard ?? [] : []), ...(incoming.sideboard ?? [])]);
  const unresolved = [...new Set([...(mode === 'merge' ? target.unresolved ?? [] : []), ...(incoming.unresolved ?? [])])]
    .filter(name => [...cards, ...sideboard].some(entry => entry.name.toLowerCase() === name.toLowerCase()));
  return {
    ...target, cards, sideboard, unresolved,
    importHistory: [...new Set([...(target.importHistory ?? []), ...(target.importSource ? [target.importSource] : [])])],
    importSource: incoming.importSource ?? target.importSource,
    updatedAt: new Date().toISOString(),
  };
}
