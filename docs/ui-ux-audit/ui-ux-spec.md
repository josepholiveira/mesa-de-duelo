# Mesa de Duelo UI and gameplay specification

Make deck ownership obvious, make card information readable on a laptop, and let players follow each action. Choose the rules format and opponent before creating a match. Add Pauper through validated rules and a complete match lifecycle.

This is a proposal based on running the current app and reviewing its source. Application behavior is unchanged. Audit date: October 16, 2026. Baseline: [`ef1cb1a`](https://github.com/kassiogluten/mesa-de-duelo/tree/ef1cb1adc325ebd58f92b7e34b0d57449628fddd). Source locations below refer to that commit.

Read alongside the [screenshot evidence](screenshots.md), [interactive layout concepts](ui-concepts.html), [Pauper implementation plan](pauper-plan.md), [sound sketches](audio/index.html), and [verification record](verification.md). Open the HTML files locally to use their interactions.

## Decisions

1. **Personal decks first.** Always show “Meus decks” before “Decks prontos.” A fresh library has a create/import empty state, not a filters error. Ready-made decks stay usable without becoming personal property.
2. **Choose before creating.** Format → opponent → compatible deck → match summary → start/create room. Distinguish format, opponent, and match length.
3. **Library and editing are separate tasks.** Management opens a library. Editing opens one deck; card search appears when needed. Preserve card artwork, grouped lists, mana curves, and average cost.
4. **Every meaningful game action is visible.** Preserve ordered events from the engine, then present them. An animation cannot recover an event absent from the transport.
5. **A readable inspector is essential.** Card images complement selectable rules text and current properties. Inspection must work with mouse, keyboard, and touch.
6. **Pauper is enforced by the server.** A search filter or format badge is insufficient. Both players and the AI need valid decks.

## What was confirmed

The lobby puts 14 ready-made decks before personal decks and automatically selects the first template. Its personal-empty view offers only clearing filters. Management already groups personal decks first, but automatically opens a template and exposes library, editor, and card search at once. Importing four Lightning Bolts, twenty Mountains, and two sideboard Duress saved 24 main-deck cards and discarded the sideboard.

Real AI gameplay was exercised through turn five: keep opening hand, play lands, cast creatures, pay automatically, inspect the stack, deploy a flyer, attack, and deal damage. One observed AI turn appeared across received states in **475 ms**; its creature was present on the stack for approximately **423 ms**. Another AI turn had only one received snapshot before control returned 55 ms later. These are observations from one local match, not universal engine timings. See [sanitized timing evidence](gameplay-timing.json).

At 1280 × 720, the inspector was **288 CSS pixels wide**, with **13 px rules text** and `pointer-events: none`. A longer opponent-card fallback truncated the name and overlapped the life area. At 390 px, the deck-management button lost its accessible name when CSS hid its label. Desktop editor metadata commonly measured 12 px.

Three distinctions matter: the current shell uses **Outfit and Inter, both sans-serif**; the reported excess serif was not reproduced in this revision. A **right-side stack already exists**, but appears only with a nonempty current stack. **Flying already has a wing icon**, but lacks an atmospheric or elevated state. Improve these existing foundations rather than specifying them as wholly absent.

## Prioritized findings

P0 means address in the first usability release. P1 follows in the same redesign program. P2 is polish. HIGH denotes lost/unclear interactions or essential information; MEDIUM denotes substantial visual or interaction friction; LOW denotes isolated polish. Proposed “After” behavior is not implemented.

### Ownership and progressive disclosure

| Severity / priority | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH / P0 | `src/decks.ts:225`; `src/ui/lobby.ts:72,173,189` | Templates first; all-source default; personal-empty state offers only clearing filters. | Separate personal and ready-made sections; useful personal-empty state; preserve valid prior selection. | Players can identify their collection and their next action. |
| HIGH / P0 | `src/ui/deckbuilder.ts:43,75,126` | Management opens three work areas and an automatically selected template. | Library first; deliberate editor entry; template preview with use/copy actions. | Reduces simultaneous decisions and irrelevant editing controls. |
| HIGH / P0 for Pauper | `src/main.ts:164`; `src/forge/client.ts:115`; `forge-bridge/src/main/java/mesadeduelo/bridge/Main.java:54` | Match creation has no format contract; legality globally disabled. | Format/opponent selection before creation; server validation; room-owned settings. | A Pauper choice must actually constrain play. |
| HIGH / P1 | `src/decks.ts:219`; `src/ui/deckbuilder.ts:111,178` | Save failures are swallowed; imports commit partial results and omit sideboards. | Explicit save status, exportable recovery, import review, preserved sideboard. | Prevents false confidence that a deck was saved intact. |
| MEDIUM / P0 | `src/ui/lobby.ts:84,103`; `src/style.css:609` | Management lives in a small header action; no nearby create action. | Visible “Meus decks” navigation plus create/import in the deck section. | Management is discoverable where decks are chosen. |

### Readability and spatial clarity

| Severity / priority | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH / P0 | `src/style.css:391`; `src/ui/forgeTable.ts:679,789`; `src/style.css:745` | Proportional image inspector, tiny rules, no general pin/scroll behavior; builder image-only inspection. | Shared readable inspector with text, pin/expand, constrained height, keyboard/touch entry. | Rules must remain readable on laptop screens. |
| HIGH / P1 | `src/style.css:88,95,113`; `src/ui/forgeTable.ts:386` | Fixed clipped battlefield, nonwrapping rows, no strategy for many distinct permanents. | Defined density levels, inspectable groups, overflow lane or controlled row scrolling. | Every permanent remains selectable. Large-board failure is source-inferred; stress test required. |
| MEDIUM / P1 | `src/style.css:3,38,349,625,687` | Dominant navy, gold gradients/glows, dense multi-column layout, many small captions. | Warm charcoal surfaces, restrained accent, larger useful text, fewer concurrent panels. | Art carries the fantasy identity while controls stay legible. |
| MEDIUM / P1 | `src/ui/cardtext.ts:7`; `src/style.css:49` | Colored mana is usually an empty colored circle; tiny text and decorative badges compete. | Distinct mana glyphs with accessible names; icons for stable concepts; keep labels for decisions. | Color alone should not communicate mana identity or action meaning. |

### Temporal continuity and feedback

| Severity / priority | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH / P0 | `forge-bridge/src/main/java/mesadeduelo/bridge/Session.java:443`; `Rooms.java:46`; `src/forge/client.ts:164`; `src/ui/motion.ts:75` | Dirty flag collapses changes into latest snapshots every 50 ms; immediate rendering; overlapping movement. | Semantic event stream plus ordered presentation timeline and bounded catch-up. | Opponent actions remain understandable even without a legal response. |
| HIGH / P0 | `src/ui/forgeTable.ts:468,580`; `src/style.css:799` | Stack only exists visually while current array is nonempty; 54 × 75 px images, 12 px labels. | Stable activity rail with distinct pending stack, resolution, and recent history. | Players see what happened and what is still respondable. |
| MEDIUM / P1 | `src/ui/forgeTable.ts:299,357`; `src/style.css:175` | Flying is a small keyword marker. | Persistent wing marker plus subtle lift/shadow and optional wind/mist. | Improves recognition without making motion the only cue. |
| MEDIUM / P1 | `forge-bridge/src/main/java/mesadeduelo/bridge/HeadlessGui.java:96`; frontend audio absent | No gameplay sound layer. | Event-driven original sound cues, mute/volume, user-gesture activation, deduplication. | Adds tactile feedback with visual equivalents. |
| MEDIUM / P2 | `src/ui/motion.ts:112,123`; `src/style.css:353,370` | Strong entry scale, slow exits, varying press feedback. | Restrained entries, interruptible transitions, consistent 0.96 press feedback where useful. | Frequent controls remain immediate and predictable. |
| LOW / P2 | `src/style.css:537` | Malformed hover declaration produces a build warning. | Correct the declaration and validate the intended hover behavior. | Avoids silent styling failure. |

### Equivalent access and state integrity

| Severity / priority | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH / P1 | `src/ui/forgeTable.ts:553,570,597,602,805`; `src/ui/deckbuilder.ts:349` | Frequent subtree replacement; stack items not keyboard-focusable; incomplete modal focus management. | Stable entity/action identity, preserved focus, semantic buttons, complete dialogs. | Game updates and quantity edits must not break keyboard use. |
| HIGH / P1 | `src/style.css:609,759`; `src/ui/lobby.ts:84` | Narrow layout hides text while SVG remains aria-hidden; nameless management button reproduced at 390 px. | Keep compact visible labels; name every icon-only button. | The management action remains perceivable and operable. |
| MEDIUM / P1 | `src/ui/forgeTable.ts:597,598`; `src/ui/deckbuilder.ts:145,257` | Engine-oriented prompts, mixed-language logs, inconsistent count grammar and deck-size guidance. | Action-oriented PT-BR copy; localize semantic events; format-aware guidance. | Players should understand decisions without parsing engine output. |

## Lobby and deck management behavior

### First visit

Use a compact navigation bar with “Jogar” and “Meus decks.” Put new-match choices directly above deck selection: **Formato** (“Pauper” / “Livre”), then **Oponente** (“Computador” / “Outra pessoa”). Require an explicit format for the first match; restore a returning user's previous choice visibly. Existing behavior maps to Livre. Do not show unsupported formats as working options.

The personal section remains first even when empty. Proposed PT-BR copy:

> **Meus decks**
>
> Você ainda não tem nenhum deck.
>
> Crie seu primeiro deck, importe uma lista ou faça uma cópia de um deck pronto.
>
> **Criar deck** · **Importar lista**

Place “Decks prontos” below, with artwork and clear provenance. Keep a limited initial set visible, with “Ver todos” for the remainder. Do not silently add templates to personal storage. Keep management actions next to the personal section; header navigation is an additional route.

No selected deck means a clear selection request. A remembered valid selection remains selected. A ready-made selection remains labeled “Deck pronto.” Search-empty, personal-empty, and no-format-compatible-deck are different states with different actions. For the latter: “Você ainda não tem um deck válido para Pauper.” Offer creation/import and valid ready-made choices below.

### Returning players and editing

Personal cards show title, art, format preference, card count, and validation state. Open a deck preview before editing. Its primary action depends on context: play/select in the lobby; edit in the library. Templates offer “Usar este deck” and “Criar uma cópia.” A copy receives a new ID and retains no built-in flag.

The editor shows one deck, its grouped card list, and compact statistics. At laptop widths use two purposeful work areas; hide the full library once editing. Open “Adicionar cartas” on demand; advanced syntax and filters sit behind disclosure. Inspection and adding a card must be distinct actions. Keep counts and focus stable after each increment/decrement.

Preserve the grouped card list, artwork, mana curve, and weighted nonland average. Use one statistics calculation shared by preview/editor. If metadata is loading, label partial statistics rather than showing a definitive zero. Format validation is separate from editing: invalid drafts can be saved; invalid decks cannot start a constrained match.

Imports have three steps: paste → review recognized cards, main/sideboard and errors → confirm. Preserve the original input when resolution fails. Saving reports “Salvando…”, “Salvo neste navegador”, or “Não foi possível salvar”. On failure keep the draft available for export. Existing browser-local storage is not account synchronization; say “Seus decks ficam salvos neste navegador.” unobtrusively.

### Match and room creation

The final summary repeats format, opponent, selected deck, and match length. In network mode the host fixes settings before creating a room. Joining first retrieves room information; the joiner then selects a compatible deck and confirms. Invalid joins must not consume a seat. Reconnect and rematch retain settings. See [Pauper plan](pauper-plan.md) for the protocol and full best-of-three scope.

## Table, inspector, and stack

### Layout and typography

Use a dark warm-neutral table and quiet surfaces; let card art provide color. Keep mana colors for mana, red for damage/hostile state, and a restrained brass accent for the primary action. Remove redundant gradients, outer glows, and all-caps labels. Keep status cues redundant through icon/shape/text.

Start with 16 px body/rules at 1.45–1.6 line height, 14 px useful metadata, 18–22 px section titles, and tabular numerals. Select the final sans-serif family after visual comparison; changing a font alone will not resolve density. Card artwork retains its original typography.

For 1280 px and wider, explore an approximately 340 px pinned inspector, 256 px activity rail, and at least 560 px central play area, including deliberate spacing. These are initial layout budgets, not immutable dimensions. Below that budget, use an inspector drawer with explicit close/pin behavior; do not shrink rules text to retain every panel. Keep essential actions above the fold at 1280 × 720 and 1440 × 900. Match layouts must tolerate browser chrome, actual CSS viewport size, and zoom.

### Shared inspector

Use a single inspector across hand, battlefield, stack, deck preview, editor, graveyard, and exile. Show full name, mana, type, selectable rules, current/base power and toughness when changed, counters, granted abilities, token/copy state, and attachments. Preserve hidden-card privacy.

Initial hover delay: 120 ms. Once open, move between nearby cards immediately. Focus opens equivalent information. A separate inspect action or right-click pins; Escape dismisses and restores focus. Touch uses an explicit inspect affordance or tap-to-inspect with a separate play action. Never require a long press as the only accessible route.

Size the image from available space and use an appropriate image source. Constrain the complete inspector to the viewport; rules scroll within it. A missing image must show useful text without a large empty placeholder or a truncated full name. Hover preview may temporarily overlay unused space; pinned detail must avoid covering life, active choices, or stack items. Do not make essential reading depend on `pointer-events: none`.

### Stack and priority

Reserve a stable right rail for three distinct states: **Pilha** (pending), **Resolvendo** (presentation of the latest result), and **Histórico** (completed actions). Keep the next item to resolve obvious and show controller, source, targets, and relevant choices. Every item is inspectable and keyboard reachable. An empty stack can collapse to a small labeled state, retaining recent activity.

LIFO order must remain correct. Lands and mana abilities must not be portrayed as ordinary stack spells. A resolved/countered item is historical, not a fake response window. Give players an immediate legal action when priority is theirs; replace generic “OK” with the appropriate action where the protocol can identify it reliably. Keep phase/turn information compact and avoid repeating it inside every prompt.

### Event presentation contract

The bridge must preserve player-visible semantic events before snapshot coalescing: land played, spell/ability added, targets selected, resolved/countered, permanent entered/left, attackers/blockers committed, damage/life change, and turn/priority change. Attach monotonic sequence IDs, authoritative state version, card/entity identity, stack-instance identity, controller, and visible result. Never expose private hands through event payloads.

The client maintains current authoritative state separately from a presentation timeline. One coordinator owns movement, stack display, log, and sound. Snapshot arrival must not replay effects or erase queued visible actions. Incidental layout/mana updates may coalesce; meaningful casts and results may not. Avoid parsing translated log strings into events.

Suggested initial timing: 700 ms readable cast exposure, 300 ms card travel, 250 ms resolution beat; overlapping phases of a single event should avoid excessive total dwell. Test comprehension, then tune. A fast setting can reduce dwell. Reduced motion retains readable announcements and static state while removing travel, lift, and particles. Keyboard navigation and routine UI actions remain immediate.

When an input prompt becomes live, make its legal actions immediately available against the correct prompt generation. Never send an action against a stale presentation state or delay a multiplayer clock. On reconnect, rebuild from an authoritative snapshot and resume after the last acknowledged event; do not replay historical sounds. Bound backlog growth and offer catch-up without skipping a pending decision. Hidden/background tabs catch up silently on return.

### Flying and sound

Keep the wing symbol and an explicit “Voar” label in inspection. Add subtle elevation, a separated shadow, and a restrained wisp beneath a flying permanent. Keep power/toughness, tapping, attacks, and target marks legible. Gaining/losing flying updates both the static marker and atmosphere. Reduced motion removes the ambient movement; idle flyers remain silent.

Sound direction: parchment/leather for card handling, wood/stone for placement, muted bronze/air for casting, low drum and rough texture for combat. The [seven original sketches](audio/index.html) demonstrate possible materials; they are not integrated or aesthetically approved. Activate audio from a user gesture; provide persisted mute and volume. One cue per semantic event, capped simultaneous voices, reduced repeated identical cues, and no playback backlog on reconnect. Mute must preserve complete visual feedback.

## Delivery sequence and acceptance

| Slice | Scope | Acceptance gate |
| --- | --- | --- |
| A — readable personal library | Personal-first home, create/import empty state, visible management, focused editor, shared inspector, text sizes and narrow-screen names. | Fresh user finds create/import immediately; personal decks precede all templates; 1280 × 720 rules are readable; keyboard can inspect without playing. |
| B — understandable matches | Semantic events, timeline, stable stack/history, prompt identity, focus continuity, modest motion. | AI land → creature → effect visible in order with no response available; fast resolve retained; nested counterspell order correct; no stale input or duplicate audio. |
| C — usable Pauper | Format/opponent before creation; migration; server validation; valid starter decks; imports preserve sideboards; explicit single-game setting. | Direct start/join cannot bypass format; player/AI decks checked; invalid drafts save but cannot start; room settings persist. |
| D — complete match experience | Best-of-three continuation, sideboarding, score/reconnect, large-board layout, flying atmosphere, tuned audio. | Same match continues across games; sideboard pool/limits enforced; big boards stay operable; mute/reduced motion preserve information. |

B and the server work in C can proceed in parallel after agreeing on protocol ownership. D is required before claiming complete best-of-three Pauper support. Cosmetic refinement does not replace either correctness boundary.

Test the redesigned flows with first-time players: identify a personal deck, create a deck, inspect a ready-made deck, choose a format, and explain the opponent's last action. Initial success targets: each task completed without help; no accidental match start while inspecting; correct account of every action in a three-action AI sequence. Treat these as validation goals, not measured results from this audit.

Required regression cases: empty/one/many personal decks; no search results; failed image/metadata/save; long rules and missing artwork; keyboard focus across updates; 200% zoom; reduced motion; 15 distinct permanents plus attachments and 30 matching tokens; 10-card hand; nested stack/counterspell; reconnect; no response available; live priority during presentation. Pauper-specific legality and series tests are in the [format plan](pauper-plan.md).

## Implementation boundaries

Keep current TypeScript/Vite and the Forge rules engine. No framework migration is needed for this work. Suggested modules: `deckLibrary` selectors and ownership, shared `deckStats`, `cardInspector`, `matchSetup` configuration/preflight, `presentationTimeline`, `audio`, and server `DeckValidation`/`MatchConfig`. Split by coherent responsibilities, not every visual fragment.

Preserve existing deck IDs and last selection. Treat records without `builtin` as personal; never infer ownership from names or identical contents. Back up v1 storage before a versioned migration; add sideboard/format metadata idempotently and preserve unrecognized records for recovery. A deck's preferred format is not a cached proof of legality. Do not mutate stored decks when rules change.

The capture run also exposed an internally scrolled `.arena` after automated scrolling to a clipped hand card (`scrollTop: 76`), moving top controls outside the viewport. This is a separate investigation item, not a claim that ordinary pointer use always clips the header. The clean pointer capture is screenshot 26. Verify keyboard focus and any `scrollIntoView` behavior before choosing `overflow: clip` or a structural fix.

**Implementation review gate: Block** until HIGH findings and their acceptance cases are resolved. This gate concerns future implementation approval; the audit/specification deliverable is complete. Unverified scenarios are listed in the [verification record](verification.md).
