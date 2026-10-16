import './decks.css';
import { DEFAULT_DECKS, countEntries, deckEntries, deckSize, exportDeckList, exportDeckRecovery, getDeckStorageState, loadUserDecks, parseDeckList, saveUserDecks, type DeckData, type DeckEntry, type DeckFormat, type ParsedList } from '../decks';
import { cardInfo, type Color } from '../cards';
import { cacheGet, fetchByNames, resolveCardNames, searchCards, type ScryCard } from '../scryfall';
import { esc, manaHTML, pip } from './cardtext';
import { deckArt, deckColors, groupedRows, statsHTML } from './deckStats';
import { cardCopyLimit, copiesInDeck, validateDeckLocal, type ServerDeckValidation } from './deckRules';
import { inspectCard, showCardPreview, hideCardPreview } from './cardInspector';
import { openDeckPreview } from './deckPreview';
import { mountAppHeader } from './appHeader';

interface BuilderOptions {
  onBack(): void;
  onChange(): void;
  initialFormat?: DeckFormat;
  onFormatChange?(format: DeckFormat): void;
  onPlay?(deck: DeckData): void;
  validateDeck?(deck: DeckData, format: DeckFormat): Promise<ServerDeckValidation>;
}
export interface DeckBuilderOpen { action: 'create' | 'import' | 'library'; format?: DeckFormat }
const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
const COLOR_NAME: Record<Color, string> = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde' };
const TYPE_FILTERS = [['Todos os tipos', ''], ['Criatura', 't:creature'], ['Instantânea', 't:instant'], ['Feitiço', 't:sorcery'], ['Artefato', 't:artifact'], ['Encantamento', 't:enchantment'], ['Terreno', 't:land']];
const formatLabel = (format: DeckFormat) => format === 'pauper' ? 'Pauper' : 'Livre';
const formatOptions = (format: DeckFormat) => `<option value="free" ${format === 'free' ? 'selected' : ''}>Livre</option><option value="pauper" ${format === 'pauper' ? 'selected' : ''}>Pauper</option>`;

function download(text: string, name: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountDeckBuilder(root: HTMLElement, opts: BuilderOptions) {
  let user = loadUserDecks();
  let format: DeckFormat = opts.initialFormat ?? 'free';
  let selected: string | null = null;
  let view: 'library' | 'edit' | 'import' = 'library';
  let listQuery = '';
  let showReady = false;
  let notice = '';
  let saveError = getDeckStorageState().error ?? '';
  let removed: { deck: DeckData; index: number } | null = null;
  let section: 'main' | 'sideboard' = 'main';
  let searchOpen = false;
  let searchQuery = '';
  let searchType = '';
  const searchColors = new Set<Color>();
  let results: ScryCard[] = [];
  let searchSeq = 0;
  let nextPage = 1;
  let hasMore = false;
  let total = 0;
  let searching = false;
  let searchError = '';
  let validation: ServerDeckValidation | null = null;
  let validating = false;
  let validationSeq = 0;
  let validationError = '';
  let importDraft = { name: '', text: '' };
  let importBusy = false;
  let importError = '';
  let importSeq = 0;
  let importReview: { deck: DeckData; parsed: ParsedList; missing: string[] } | null = null;
  let importAcknowledged = false;
  const current = () => [...user, ...DEFAULT_DECKS].find(d => d.id === selected);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;

  root.innerHTML = `<div class="deck-workspace"><header data-app-header></header><div id="dwStatus" class="dw-status" role="status" aria-live="polite"></div><main id="dwContent"></main></div>`;
  function goHome() { importSeq++; importBusy = false; validationSeq++; validating = false; hideCardPreview(); opts.onBack(); }
  function goLibrary() { importSeq++; importBusy = false; validationSeq++; validating = false; view = 'library'; selected = null; hideCardPreview(); render(); }
  mountAppHeader(root.querySelector('[data-app-header]')!, { active: 'decks', onPlay: goHome, onDecks: goLibrary });

  function renderStatus() {
    const recovery = getDeckStorageState().recovery.length;
    $('#dwStatus').innerHTML = `${saveError ? `<p class="dw-error">${esc(saveError)} <button type="button" class="dw-button" data-b="retry-save">Tentar salvar</button> <button type="button" class="dw-button" data-b="recovery">Exportar recuperação</button></p>` : notice ? `<p>${esc(notice)}</p>` : '<p>Seus decks ficam salvos neste navegador.</p>'}${recovery && !saveError ? `<p class="dw-error">Há ${recovery} registros preservados para recuperação. <button type="button" class="dw-button" data-b="recovery">Exportar recuperação</button></p>` : ''}${removed ? `<p>Deck excluído. <button type="button" class="dw-button" data-b="undo">Desfazer</button></p>` : ''}`;
  }
  function persist(message = 'Salvo neste navegador.') {
    const result = saveUserDecks(user);
    saveError = result.ok ? '' : result.error;
    notice = result.ok ? message : '';
    renderStatus(); opts.onChange();
  }
  function changed(deck: DeckData) {
    deck.updatedAt = new Date().toISOString();
    validationSeq++; validation = null; validationError = ''; validating = false;
    persist();
  }
  function preserveRender(render: () => void) {
    const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    const key = active?.dataset.focus;
    const input = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
    const range = input && ['text', 'search', 'textarea'].includes(input.type) ? [input.selectionStart, input.selectionEnd] : null;
    const x = window.scrollX, y = window.scrollY;
    render();
    if (key) {
      const target = [...root.querySelectorAll<HTMLElement>('[data-focus]')].find(el => el.dataset.focus === key);
      target?.focus({ preventScroll: true });
      if (range && target instanceof HTMLInputElement && range[0] !== null && range[1] !== null) target.setSelectionRange(range[0], range[1]);
    }
    window.scrollTo(x, y);
  }
  function cardTile(deck: DeckData, personal: boolean) {
    const art = deckArt(deck), local = validateDeckLocal(deck, format);
    return `<article class="dw-deck"><button type="button" class="dw-cover" data-peek="${esc(deck.id)}" aria-label="Ver cartas de ${esc(deck.name)}">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : '<span aria-hidden="true">▱</span>'}<span>${personal ? 'Seu deck' : 'Deck pronto'}</span></button><div class="dw-deck-info"><h3>${esc(deck.name)}</h3><p>${deckColors(deck).map(pip).join('')}<span>${deckSize(deck)} cartas${deck.sideboard?.length ? ` · ${countEntries(deck.sideboard)} no sideboard` : ''}</span></p><p class="dw-deck-valid ${local.status}">${formatLabel(deck.format ?? 'free')}${format === 'pauper' ? ` · ${local.status === 'valid' ? 'Compatível com Pauper' : local.status === 'invalid' ? 'Precisa de ajustes' : 'Não verificado'}` : ''}</p><div class="dw-actions"><button type="button" class="dw-button ${personal ? 'primary' : ''}" data-select="${esc(deck.id)}" data-focus="deck:${esc(deck.id)}">${personal ? 'Editar deck' : 'Ver deck'}</button>${!personal ? `<button type="button" class="dw-button" data-copy="${esc(deck.id)}">Criar cópia</button>` : ''}</div></div></article>`;
  }
  function renderLibrary() {
    const match = (d: DeckData) => d.name.toLocaleLowerCase('pt-BR').includes(listQuery.toLocaleLowerCase('pt-BR'));
    const mine = user.filter(match), ready = DEFAULT_DECKS.filter(match).filter(d => format === 'free' || d.format === 'pauper');
    $('#dwContent').innerHTML = `<section class="dw-library"><div class="dw-title"><div><p class="dw-eyebrow">Sua coleção</p><h1>Meus decks <small>${user.length}</small></h1><p>Crie, ajuste e escolha o seu próximo deck.</p></div><div class="dw-actions"><button type="button" class="dw-button" data-b="import">Importar lista</button><button type="button" class="dw-button primary" data-b="new">Criar deck</button></div></div><div class="dw-library-tools"><label class="dw-search"><span>Buscar deck</span><input type="search" id="dwListQuery" data-focus="library-search" value="${esc(listQuery)}" placeholder="Nome do deck" autocomplete="off"></label><label class="dw-field">Formato<select id="dwFormat" data-focus="library-format">${formatOptions(format)}</select></label></div>${mine.length ? `<div class="dw-deck-grid">${mine.map(d => cardTile(d, true)).join('')}</div>` : `<div class="dw-empty"><h2>${user.length ? 'Nenhum deck com esse nome.' : 'Você ainda não tem nenhum deck.'}</h2><p>${user.length ? 'Tente outro nome ou limpe a busca.' : 'Crie seu primeiro deck, importe uma lista ou faça uma cópia de um deck pronto.'}</p><div class="dw-actions">${user.length ? '<button type="button" class="dw-button" data-b="clear-search">Limpar busca</button>' : '<button type="button" class="dw-button primary" data-b="new">Criar deck</button><button type="button" class="dw-button" data-b="import">Importar lista</button>'}</div></div>`}<details class="dw-ready" ${showReady ? 'open' : ''}><summary>Decks prontos <small>${ready.length}</small><span>Escolha um ponto de partida</span></summary><div class="dw-deck-grid">${ready.map(d => cardTile(d, false)).join('') || '<p>Nenhum deck pronto com esse nome.</p>'}</div></details></section>`;
    root.querySelector('.dw-ready')?.addEventListener('toggle', e => { const next = (e.target as HTMLDetailsElement).open; if (next !== showReady) { showReady = next; if (next) void loadData(); } });
  }
  function validationHTML(deck: DeckData) {
    const local = validateDeckLocal(deck, deck.format ?? 'free');
    const issues = validation?.issues ?? local.issues;
    const title = validation ? validation.valid ? 'Deck validado pelo servidor' : 'O deck precisa de ajustes' : local.status === 'invalid' ? 'O deck precisa de ajustes' : local.status === 'unknown' ? 'Legalidade não verificada' : 'Pronto para conferir';
    return `<div class="dw-validity ${validation?.valid === false || local.status === 'invalid' ? 'invalid' : ''}"><div><strong>${title}</strong><p>${validation?.valid ? `Regras: ${esc(validation.rulesVersion ?? 'versão atual')}` : 'Você pode salvar um rascunho. A partida só começa após a validação do servidor.'}</p></div>${opts.validateDeck ? `<button type="button" class="dw-button" data-b="validate" data-focus="validate" ${validating ? 'disabled' : ''}>${validating ? 'Conferindo…' : 'Conferir deck'}</button>` : ''}${issues.length ? `<details><summary>${issues.length} ${issues.length === 1 ? 'ponto para revisar' : 'pontos para revisar'}</summary><ul>${issues.map(i => `<li>${esc(i.card && !i.message.includes(i.card) ? `${i.card}: ${i.message}` : i.message)}</li>`).join('')}</ul></details>` : ''}${validationError ? `<p class="dw-error">${esc(validationError)}</p>` : ''}</div>`;
  }
  function entriesHTML(deck: DeckData) {
    const entries = section === 'main' ? deck.cards : deck.sideboard ?? [];
    return groupedRows(entries).map(group => `<section class="dw-card-group"><h3>${group.label}<span>${countEntries(group.rows)}</span></h3><ul>${group.rows.map(row => {
      const label = row.info?.label ?? row.name;
      return `<li><button type="button" class="dw-card-name" data-inspect="${esc(row.name)}" data-focus="inspect:${esc(row.name)}"><span class="dw-card-art">${row.info?.artCrop ? `<img src="${esc(row.info.artCrop)}" alt="" loading="lazy">` : ''}</span><span>${esc(label)}</span><span class="dw-mana">${row.info ? manaHTML(row.info.manaCost) : ''}</span></button>${deck.builtin ? `<b class="dw-count">${row.count}</b>` : `<div class="dw-stepper"><button type="button" data-dec="${esc(row.name)}" data-focus="dec:${esc(row.name)}" aria-label="Remover uma cópia de ${esc(label)}">−</button><span>${row.count}</span><button type="button" data-add="${esc(row.name)}" data-focus="add:${esc(row.name)}" aria-label="Adicionar uma cópia de ${esc(label)}">+</button></div>`}<button type="button" class="dw-transfer" data-move="${esc(row.name)}" data-focus="move:${esc(row.name)}" ${deck.builtin ? 'hidden' : ''} title="${section === 'main' ? 'Mover uma cópia para o sideboard' : 'Mover uma cópia para o deck principal'}" aria-label="${section === 'main' ? 'Mover uma cópia para o sideboard' : 'Mover uma cópia para o deck principal'}: ${esc(label)}">${section === 'main' ? '→' : '←'}</button></li>`;
    }).join('')}</ul></section>`).join('') || `<div class="dw-empty compact"><h3>${section === 'main' ? 'Seu deck começa aqui.' : 'Sideboard vazio.'}</h3><p>${section === 'main' ? 'Abra a busca e adicione suas primeiras cartas.' : 'Adicione até 15 cartas de reserva para ajustar sua estratégia entre os jogos.'}</p>${!deck.builtin ? '<button type="button" class="dw-button primary" data-b="open-search">Adicionar cartas</button>' : ''}</div>`;
  }
  function renderEdit() {
    const deck = current(); if (!deck) { view = 'library'; renderLibrary(); return; }
    const art = deckArt(deck);
    $('#dwContent').innerHTML = `<section class="dw-editor"><button type="button" class="dw-button subtle" data-b="library">← Voltar aos meus decks</button><div class="dw-edit-head">${art ? `<img class="dw-edit-cover" src="${esc(art)}" alt="">` : ''}<div class="dw-edit-name"><p class="dw-eyebrow">${deck.builtin ? 'Deck pronto' : 'Seu deck'}</p>${deck.builtin ? `<h1>${esc(deck.name)}</h1>` : `<label class="dw-field">Nome do deck<input id="dwName" data-focus="deck-name" maxlength="80" value="${esc(deck.name)}"></label>`}<p>${deckColors(deck).map(pip).join('')} ${deckSize(deck)} cartas · ${countEntries(deck.sideboard ?? [])} no sideboard</p></div><label class="dw-field">Formato<select id="dwDeckFormat" data-focus="deck-format" ${deck.builtin ? 'disabled' : ''}>${formatOptions(deck.format ?? 'free')}</select></label><div class="dw-actions"><button type="button" class="dw-button" data-b="export">Exportar lista</button>${deck.importSource ? '<button type="button" class="dw-button" data-b="source">Lista original</button>' : ''}<button type="button" class="dw-button" data-b="dup">${deck.builtin ? 'Criar uma cópia' : 'Duplicar'}</button>${!deck.builtin ? '<button type="button" class="dw-button danger" data-b="del">Excluir</button>' : ''}</div></div>${deck.builtin ? '<p class="dw-template-note">Este deck pronto pode ser usado como está. Crie uma cópia para editar suas cartas.</p>' : ''}<div class="dw-edit-layout ${searchOpen && !deck.builtin ? 'search-open' : ''}"><section class="dw-deck-panel">${statsHTML(deck)}${validationHTML(deck)}<div class="dw-section-tabs" role="group" aria-label="Seção do deck"><button type="button" class="dw-button" data-section="main" data-focus="section-main" aria-pressed="${section === 'main'}">Principal <b>${deckSize(deck)}</b></button><button type="button" class="dw-button" data-section="sideboard" data-focus="section-sideboard" aria-pressed="${section === 'sideboard'}">Sideboard <b>${countEntries(deck.sideboard ?? [])}</b></button>${!deck.builtin ? `<button type="button" class="dw-button primary" data-b="search" data-focus="toggle-search" aria-expanded="${searchOpen}">${searchOpen ? 'Fechar busca' : 'Adicionar cartas'}</button>` : ''}</div><div class="dw-card-list">${entriesHTML(deck)}</div></section>${searchOpen && !deck.builtin ? `<aside class="dw-search-panel" aria-label="Buscar cartas"><h2>Adicionar ao ${section === 'main' ? 'deck principal' : 'sideboard'}</h2><form id="dwSearchForm"><label class="dw-field">Nome ou texto da carta<input id="dwCardQuery" data-focus="card-search" type="search" value="${esc(searchQuery)}" placeholder="Busque em português ou inglês" autocomplete="off"></label><button class="dw-button primary" type="submit">Buscar</button></form><details class="dw-filters"><summary>Filtros e busca avançada</summary><div class="dw-colors">${COLORS.map(c => `<button type="button" data-color="${c}" aria-label="Filtrar por ${COLOR_NAME[c].toLowerCase()}" aria-pressed="${searchColors.has(c)}">${pip(c)}</button>`).join('')}</div><label class="dw-field">Tipo<select id="dwSearchType">${TYPE_FILTERS.map(([label, value]) => `<option value="${value}" ${value === searchType ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p>Busca avançada: <code>mv&lt;=2</code> para custo, <code>o:"draw a card"</code> para texto. As cores incluem cartas incolores.</p></details><p class="dw-note">${deck.format === 'pauper' ? 'Mostrando cartas legais no Pauper. ' : ''}Toque na imagem para ler; use + para adicionar.</p><div id="dwResults"></div></aside>` : ''}</div></section>`;
    if (searchOpen && !deck.builtin) renderResults();
  }
  function renderResults() {
    const el = root.querySelector('#dwResults'), deck = current(); if (!el || !deck) return;
    if (searchError) { el.innerHTML = `<p class="dw-error" role="alert">${esc(searchError)}</p><button type="button" class="dw-button" data-b="retry-search">Tentar novamente</button>`; return; }
    if (searching && !results.length) { el.innerHTML = '<p role="status">Buscando cartas…</p>'; return; }
    if (!results.length) { el.innerHTML = `<p class="dw-note">${searchQuery || searchType || searchColors.size ? 'Nenhuma carta encontrada. Tente outros termos.' : 'Busque uma carta para começar.'}</p>`; return; }
    el.innerHTML = `<p class="dw-note" role="status">${total} ${total === 1 ? 'carta encontrada' : 'cartas encontradas'}</p><div class="dw-results">${results.map(sc => {
      const info = cardInfo(sc), count = (section === 'main' ? deck.cards : deck.sideboard ?? []).find(e => e.name === sc.name)?.count ?? 0;
      const full = deck.format === 'pauper' && copiesInDeck(deck, sc.name) >= cardCopyLimit(sc.name, sc);
      return `<article><button type="button" class="dw-result-art" data-inspect="${esc(sc.name)}" aria-label="Ler ${esc(info.label)}">${info.imageSmall ? `<img src="${esc(info.imageSmall)}" alt="" loading="lazy">` : esc(info.label)}</button><p title="${esc(info.label)}">${esc(info.label)}</p><div class="dw-stepper"><button type="button" data-dec="${esc(sc.name)}" data-focus="result-dec:${esc(sc.name)}" ${!count ? 'disabled' : ''} aria-label="Remover uma cópia de ${esc(info.label)}">−</button><span>${count}</span><button type="button" data-add="${esc(sc.name)}" data-focus="result-add:${esc(sc.name)}" ${full ? 'disabled' : ''} aria-label="Adicionar uma cópia de ${esc(info.label)}">+</button></div></article>`;
    }).join('')}</div>${hasMore ? `<button type="button" class="dw-button dw-more" data-b="more" ${searching ? 'disabled' : ''}>${searching ? 'Carregando…' : 'Mais resultados'}</button>` : ''}`;
  }
  function renderImport() {
    const review = importReview;
    $('#dwContent').innerHTML = `<section class="dw-import"><button type="button" class="dw-button subtle" data-b="library">← Voltar aos meus decks</button><p class="dw-eyebrow">${review ? '2. Revise sua lista' : '1. Cole sua lista'}</p><h1 tabindex="-1" id="dwImportHeading">Importar deck</h1><p>Deck principal e sideboard serão preservados.</p>${review ? `<div class="dw-import-review"><h2>${esc(review.deck.name)}</h2><p>${deckSize(review.deck)} cartas no principal · ${countEntries(review.deck.sideboard ?? [])} no sideboard · ${formatLabel(review.deck.format ?? 'free')}</p>${review.missing.length ? `<div class="dw-error"><strong>Cartas não reconhecidas</strong><p>Estas cartas serão preservadas no rascunho, sem permitir iniciar uma partida até serem corrigidas:</p><ul>${review.missing.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}${review.parsed.skipped.length || review.parsed.ignored.length ? `<div class="dw-error"><p>Algumas linhas não serão adicionadas às cartas. A lista original ficará salva no rascunho.</p><ul>${[...review.parsed.skipped, ...review.parsed.ignored].map(line => `<li>${esc(line)}</li>`).join('')}</ul><label><input type="checkbox" id="dwImportAck" ${importAcknowledged ? 'checked' : ''}> Revisei as linhas acima e quero guardar o rascunho.</label></div>` : ''}${validationHTML(review.deck)}<details><summary>Lista reconhecida</summary><pre>${esc(exportDeckList(review.deck))}</pre></details><div class="dw-actions"><button type="button" class="dw-button" data-b="import-edit">Voltar à lista</button><button type="button" class="dw-button primary" data-b="import-save" ${(review.parsed.skipped.length || review.parsed.ignored.length) && !importAcknowledged ? 'disabled' : ''}>Salvar ${review.missing.length ? 'rascunho' : 'deck'}</button></div></div>` : `<form id="dwImportForm"><div class="dw-import-fields"><label class="dw-field">Nome do deck<input id="dwImportName" data-focus="import-name" ${importBusy ? 'disabled' : ''} maxlength="80" value="${esc(importDraft.name)}" placeholder="Meu novo deck" required></label><label class="dw-field">Formato<select id="dwImportFormat" data-focus="import-format" ${importBusy ? 'disabled' : ''}>${formatOptions(format)}</select></label></div><label class="dw-field">Lista de cartas<textarea id="dwImportText" data-focus="import-text" ${importBusy ? 'disabled' : ''} rows="13" spellcheck="false" required placeholder="Deck&#10;4 Lightning Bolt&#10;20 Mountain&#10;&#10;Sideboard&#10;2 Duress">${esc(importDraft.text)}</textarea></label><p class="dw-note">Arena, MTGO, Moxfield ou Archidekt. Uma carta por linha; nomes em português ou inglês. Maybeboard, fichas e comandantes aparecem na revisão, sem entrar no deck.</p>${importError ? `<p class="dw-error" role="alert">${esc(importError)}</p>` : ''}<div class="dw-actions"><button class="dw-button primary" ${importBusy ? 'disabled' : ''}>${importBusy ? 'Conferindo cartas…' : 'Revisar importação'}</button><button type="button" class="dw-button" data-b="export-import">Baixar lista original</button></div></form>`}</section>`;
  }
  function render() { renderStatus(); if (view === 'library') renderLibrary(); else if (view === 'import') renderImport(); else renderEdit(); }
  async function loadData() {
    if (view === 'import') return;
    const requestView = view, requestSelected = selected;
    const target = view === 'edit' ? current() : undefined;
    const decks = target ? [target] : [...user, ...(showReady ? DEFAULT_DECKS : [])];
    try { await fetchByNames(decks.flatMap(d => deckEntries(d).map(e => e.name)), true); if (view === requestView && selected === requestSelected) preserveRender(render); }
    catch { if (view === 'edit') { notice = 'Alguns dados das cartas não foram carregados. O deck continua disponível.'; renderStatus(); } }
  }
  function resetSearch() { searchSeq++; results = []; searchQuery = ''; searchType = ''; searchColors.clear(); hasMore = false; searching = false; searchError = ''; }
  function edit(deck: DeckData) {
    importSeq++; importBusy = false; validationSeq++; validating = false;
    selected = deck.id; view = 'edit'; section = 'main'; searchOpen = !deck.cards.length && !deck.builtin;
    validation = null; validationError = ''; resetSearch(); hideCardPreview(); render(); void loadData();
  }
  function create() {
    const deck: DeckData = { id: crypto.randomUUID(), name: 'Novo deck', cards: [], sideboard: [], format, updatedAt: new Date().toISOString() };
    user.unshift(deck); persist(); edit(deck); $('#dwName')?.focus(); ($('#dwName') as HTMLInputElement)?.select();
  }
  function duplicate(source: DeckData) {
    const deck: DeckData = { ...source, id: crypto.randomUUID(), name: `${source.name} (cópia)`, builtin: false, cards: source.cards.map(e => ({ ...e })), sideboard: source.sideboard?.map(e => ({ ...e })) ?? [], sourceTemplateId: source.builtin ? source.id : source.sourceTemplateId, updatedAt: new Date().toISOString() };
    user.unshift(deck); persist('Cópia criada nos seus decks.'); edit(deck);
  }
  function change(name: string, delta: number, move = false) {
    const deck = current(); if (!deck || deck.builtin) return;
    const pool = section === 'main' ? deck.cards : deck.sideboard ?? (deck.sideboard = []);
    const existing = pool.find(e => e.name === name);
    if (delta > 0 && deck.format === 'pauper' && copiesInDeck(deck, name) >= cardCopyLimit(name)) { notice = 'Você já tem o limite de cópias entre o deck e o sideboard.'; renderStatus(); return; }
    if (existing) { existing.count = Math.max(0, existing.count + delta); if (!existing.count) pool.splice(pool.indexOf(existing), 1); }
    else if (delta > 0) pool.push({ name, count: 1, oracleId: cacheGet(name)?.oracle_id });
    else return;
    if (move) {
      const other = section === 'main' ? deck.sideboard ?? (deck.sideboard = []) : deck.cards;
      const destination = other.find(e => e.name === name); if (destination) destination.count++; else other.push({ name, count: 1, oracleId: cacheGet(name)?.oracle_id });
    }
    deck.unresolved = deck.unresolved?.filter(n => deckEntries(deck).some(e => e.name === n));
    changed(deck); preserveRender(renderEdit);
  }
  async function runSearch(more = false) {
    const deck = current(); if (!deck) return;
    const q = [searchQuery, searchColors.size ? `id<=${COLORS.filter(c => searchColors.has(c)).join('').toLowerCase()}` : '', searchType].filter(Boolean).join(' ');
    const seq = ++searchSeq;
    if (!q) { results = []; searching = false; renderResults(); return; }
    searching = true; searchError = ''; if (!more) { results = []; nextPage = 1; } renderResults();
    try {
      const result = await searchCards(q, nextPage, deck.format);
      if (seq !== searchSeq) return;
      results = more ? [...results, ...result.cards] : result.cards; hasMore = result.hasMore; total = result.total; nextPage++;
    } catch (error) { if (seq !== searchSeq) return; searchError = `Não foi possível buscar as cartas: ${(error as Error).message}`; }
    searching = false; renderResults();
  }
  async function reviewImport() {
    const source = { ...importDraft }, importFormat = format;
    const parsed = parseDeckList(source.text);
    if (!parsed.main.length) { importError = 'Nenhuma carta reconhecida no deck principal. Confira a lista.'; renderImport(); return; }
    const seq = ++importSeq; importBusy = true; importError = ''; renderImport();
    try {
      const resolved = await resolveCardNames([...parsed.main, ...parsed.sideboard].map(e => e.name));
      if (seq !== importSeq || view !== 'import') return;
      const normalize = (entries: DeckEntry[]) => {
        const merged = new Map<string, DeckEntry>();
        for (const e of entries) {
          const name = resolved.found.get(e.name.toLowerCase()) ?? e.name, oracleId = cacheGet(name)?.oracle_id;
          const key = oracleId ?? name.toLowerCase(), previous = merged.get(key);
          if (previous) { if (!Number.isSafeInteger(previous.count + e.count)) throw new Error(`Quantidade muito grande para ${name}.`); previous.count += e.count; } else merged.set(key, { name, count: e.count, oracleId });
        }
        return [...merged.values()];
      };
      importReview = { deck: { id: crypto.randomUUID(), name: source.name.trim() || 'Deck importado', format: importFormat, cards: normalize(parsed.main), sideboard: normalize(parsed.sideboard), importSource: source.text, unresolved: resolved.missing, updatedAt: new Date().toISOString() }, parsed, missing: resolved.missing };
      importAcknowledged = false; validation = null;
    } catch (error) { if (seq === importSeq) importError = `Não foi possível conferir as cartas. Sua lista foi preservada. ${(error as Error).message}`; }
    if (seq === importSeq) { importBusy = false; renderImport(); $('#dwImportHeading')?.focus(); }
  }
  async function validate() {
    const deck = view === 'import' ? importReview?.deck : current(); if (!deck || !opts.validateDeck) return;
    const snapshot = JSON.stringify(deck), seq = ++validationSeq;
    const stillCurrent = () => { const now = view === 'import' ? importReview?.deck : current(); return seq === validationSeq && now && JSON.stringify(now) === snapshot; };
    validating = true; validationError = ''; preserveRender(render);
    try { const result = await opts.validateDeck(deck, deck.format ?? 'free'); if (stillCurrent()) validation = result; }
    catch (error) { if (stillCurrent()) validationError = `Não foi possível conferir no servidor: ${(error as Error).message}`; }
    if (seq === validationSeq) { validating = false; preserveRender(render); }
  }

  root.addEventListener('click', e => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!target || (target as HTMLButtonElement).disabled) return;
    const ds = target.dataset;
    if (ds.inspect) { hideCardPreview(); inspectCard({ name: ds.inspect }, target); return; }
    if (ds.peek) { const deck = [...user, ...DEFAULT_DECKS].find(d => d.id === ds.peek); if (deck) openDeckPreview(deck, { selected: false, onPick: () => edit(deck), pickLabel: deck.builtin ? 'Ver deck' : 'Editar deck' }); return; }
    if (ds.select) { const deck = [...user, ...DEFAULT_DECKS].find(d => d.id === ds.select); if (deck) edit(deck); return; }
    if (ds.copy) { const deck = DEFAULT_DECKS.find(d => d.id === ds.copy); if (deck) duplicate(deck); return; }
    if (ds.section) { section = ds.section as 'main' | 'sideboard'; preserveRender(renderEdit); return; }
    if (ds.add) { change(ds.add, 1); return; }
    if (ds.dec) { change(ds.dec, -1); return; }
    if (ds.move) { change(ds.move, -1, true); return; }
    if (ds.color) { const color = ds.color as Color; searchColors.has(color) ? searchColors.delete(color) : searchColors.add(color); target.setAttribute('aria-pressed', String(searchColors.has(color))); void runSearch(); return; }
    switch (ds.b) {
      case 'home': goHome(); break;
      case 'library': goLibrary(); break;
      case 'new': create(); break;
      case 'import': importSeq++; importBusy = false; validationSeq++; validating = false; view = 'import'; importReview = null; validation = null; render(); break;
      case 'dup': { const deck = current(); if (deck) duplicate(deck); break; }
      case 'del': { const deck = current(); if (deck && !deck.builtin) { removed = { deck, index: user.indexOf(deck) }; user = user.filter(d => d.id !== deck.id); selected = null; view = 'library'; persist('Deck excluído.'); render(); } break; }
      case 'undo': if (removed) { user.splice(removed.index, 0, removed.deck); removed = null; persist('Deck restaurado.'); render(); } break;
      case 'export': { const deck = current(); if (deck) download(exportDeckList(deck), `${deck.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 70) || 'deck'}.txt`); break; }
      case 'source': { const source = current()?.importSource; if (source) download(source, 'lista-original.txt'); break; }
      case 'export-import': download(importDraft.text, 'lista-original.txt'); break;
      case 'recovery': download(exportDeckRecovery(), 'recuperacao-decks.json', 'application/json'); break;
      case 'retry-save': persist(); break;
      case 'clear-search': listQuery = ''; renderLibrary(); break;
      case 'search': searchOpen = !searchOpen; hideCardPreview(); renderEdit(); if (searchOpen) $('#dwCardQuery')?.focus(); break;
      case 'open-search': searchOpen = true; renderEdit(); $('#dwCardQuery')?.focus(); break;
      case 'more': void runSearch(true); break;
      case 'retry-search': void runSearch(); break;
      case 'validate': void validate(); break;
      case 'import-edit': validationSeq++; validating = false; importReview = null; validation = null; renderImport(); break;
      case 'import-save': if (importReview && (!(importReview.parsed.skipped.length || importReview.parsed.ignored.length) || importAcknowledged)) { const deck = importReview.deck; user.unshift(deck); importReview = null; importDraft = { name: '', text: '' }; persist('Deck importado. Principal e sideboard preservados.'); edit(deck); } break;
    }
  });
  root.addEventListener('submit', e => {
    e.preventDefault(); const form = e.target as HTMLFormElement;
    if (form.id === 'dwImportForm') { if (!importBusy) void reviewImport(); }
    if (form.id === 'dwSearchForm') void runSearch();
  });
  root.addEventListener('input', e => {
    const input = e.target as HTMLInputElement;
    if (input.id === 'dwListQuery') { listQuery = input.value; preserveRender(renderLibrary); }
    if (input.id === 'dwCardQuery') searchQuery = input.value;
    if (input.id === 'dwImportName') importDraft.name = input.value;
    if (input.id === 'dwImportText') importDraft.text = input.value;
    if (input.id === 'dwName') { const deck = current(); if (deck && !deck.builtin) { deck.name = input.value; changed(deck); } }
  });
  root.addEventListener('change', e => {
    const input = e.target as HTMLInputElement;
    if (input.id === 'dwFormat' || input.id === 'dwImportFormat') { format = input.value as DeckFormat; opts.onFormatChange?.(format); if (view === 'library') renderLibrary(); }
    if (input.id === 'dwDeckFormat') { const deck = current(); if (deck && !deck.builtin) { deck.format = input.value as DeckFormat; format = deck.format; changed(deck); resetSearch(); preserveRender(renderEdit); void loadData(); } }
    if (input.id === 'dwSearchType') { searchType = input.value; void runSearch(); }
    if (input.id === 'dwImportAck') { importAcknowledged = input.checked; const button = root.querySelector<HTMLButtonElement>('[data-b="import-save"]'); if (button) button.disabled = !input.checked; }
  });
  const preview = (e: Event) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-inspect]');
    if (card) showCardPreview({ name: card.dataset.inspect! }, card);
  };
  root.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') preview(e); });
  root.addEventListener('focusin', preview);
  root.addEventListener('pointerout', e => { if (!(e.relatedTarget instanceof Node) || !(e.target as HTMLElement).closest('[data-inspect]')?.contains(e.relatedTarget)) hideCardPreview(); });
  root.addEventListener('focusout', () => hideCardPreview());
  render();
  return {
    refresh(nextFormat?: DeckFormat) { user = loadUserDecks(); if (nextFormat) format = nextFormat; saveError = getDeckStorageState().error ?? ''; preserveRender(render); },
    open(options: DeckBuilderOpen) {
      importSeq++; importBusy = false; validationSeq++; validating = false; validation = null; validationError = ''; hideCardPreview();
      if (options.format) format = options.format;
      user = loadUserDecks();
      if (options.action === 'create') create();
      else { view = options.action === 'import' ? 'import' : 'library'; selected = null; importReview = null; render(); void loadData(); }
    },
  };
}
