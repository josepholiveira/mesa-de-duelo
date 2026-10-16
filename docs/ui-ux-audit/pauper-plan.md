# Pauper and pre-match format selection

Implementation specification · audited October 16, 2026.

This adds Pauper to the existing Forge-backed game while making the rules format an explicit choice before creating a match. It covers deck discovery, construction, validation, imports, sideboards, and complete match flow. Application reference: [`ef1cb1a`](https://github.com/kassiogluten/mesa-de-duelo/tree/ef1cb1adc325ebd58f92b7e34b0d57449628fddd). Forge reference: [`0b0f7ec`](https://github.com/Card-Forge/forge/tree/0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53).

Pauper was **not played end to end** during this audit. Browser observations, source findings, and proposed behavior are distinguished below.

## 1. Player flow

Choose **Formato** → **Oponente** → **Deck** before creating the match. Initial supported formats: **Pauper** and **Livre**. Opponent choices remain **Computador** and **Outra pessoa**. Match length is a separate choice: **Partida única** or **Melhor de três**. Keep these compact; do not introduce another dashboard of settings. Other formats appear only when their rules are enforced.

The selected format governs deck selection, creation, import feedback, and the final match summary. In Pauper, display **Meus decks** first, then **Decks prontos**. With no compatible personal deck, show:

> Você ainda não tem um deck válido para Pauper.

Provide **Criar deck Pauper** and **Importar lista**, followed by ready-made decks. **Mostrar decks incompatíveis** reveals existing personal decks with specific problems and an **Editar** action. Switching formats never deletes, modifies, or claims ownership of a deck. Preserve the last valid selection per format. An unfinished deck may be saved; it cannot start a Pauper match.

The new-deck flow inherits the selected format and allows an explicit change. Keep format, ownership, and validity separate: “personal” does not mean “legal,” and “ready-made” does not mean “Pauper.”

For network play, the host fixes format and match length before creating the room. A joiner enters the code, reads the room configuration, chooses a compatible deck, then confirms. This needs a read-only room lookup: the existing [`join`](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/forge-bridge/src/main/java/mesadeduelo/bridge/Rooms.java#L159) immediately binds the player and starts the game. Validation must precede binding or leaving another session. Reconnection and rematch retain the selected configuration.

## 2. Rules baseline

Pauper permits cards with an eligible common printing in paper or Magic Online; the player may use another printing of that card. Main decks contain at least 60 cards; an optional sideboard contains up to 15. Normally, no more than four copies of a card are allowed across main deck and sideboard combined, with basic-land exemptions. Testing only the displayed printing’s rarity is insufficient. [Official Pauper rules](https://magic.wizards.com/en/formats/pauper).

Bans apply to both sections. Validation must include the current named bans, cards bringing stickers or Attractions into the game, and universally banned cards. The October 12, 2026 announcement made no Pauper changes. This audit uses a snapshot verified October 16, 2026; future releases must recheck it. [Official banned list](https://magic.wizards.com/en/banned-restricted-list), [October 12 announcement](https://www.magic.wizards.com/en/news/announcements/banned-and-restricted-october-12-2026).

Use the normal London mulligan: redraw seven, then put cards equal to the mulligans taken on the bottom when keeping. Do not introduce a free first mulligan for this two-player format. [Wizards’ London mulligan explanation](https://magic.wizards.com/en/news/announcements/london-mulligan-2019-06-03). Respect explicit card-text copy-limit exceptions through Forge’s rules metadata. Starting life remains the normal Constructed value of 20; include it in runtime verification.

## 3. Current gaps and implementation

| Area | Before | Required behavior |
| --- | --- | --- |
| Format selection | Lobby exposes only AI/network choices. | Add format above deck selection; carry it through creation, import, match summary, and room state. |
| Legality | Bridge explicitly disables deck legality and accepts main-deck payloads without format. | Validate both player and AI decks on the server before creating a session. |
| Search | Optional Standard filter; compact card cache omits legality and Oracle identity. | Format-aware search and cached legality feedback, with server enforcement. |
| Imports | Sideboard entries are discarded. | Preserve and validate both sections; review import discrepancies before completion. |
| Match lifecycle | Engine defaults and frontend rematch behavior do not form a complete Bo3 flow. | Explicit match length, continuation of the same match, sideboarding, score, and reconnection. |

The relevant application entry points are [`lobby.ts`](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/src/ui/lobby.ts#L89), [`Main.java`](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/forge-bridge/src/main/java/mesadeduelo/bridge/Main.java#L54), [`Rooms.java`](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/forge-bridge/src/main/java/mesadeduelo/bridge/Rooms.java#L95), and [`Decks.java`](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/forge-bridge/src/main/java/mesadeduelo/bridge/Decks.java#L80).

### Server validation

Forge already supplies a [Pauper format definition](https://github.com/Card-Forge/forge/blob/0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53/forge-gui/res/formats/Sanctioned/Pauper.txt). Reuse both:

```java
DeckFormat.Constructed.getDeckConformanceProblem(deck);
FModel.getFormats().getPauper().getDeckConformanceProblem(deck);
```

These checks are complementary. [`GameFormat`](https://github.com/Card-Forge/forge/blob/0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53/forge-game/src/main/java/forge/game/GameFormat.java#L306) checks the card pool; it does not enforce minimum deck size or the ordinary four-copy limit. [`DeckFormat.Constructed`](https://github.com/Card-Forge/forge/blob/0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53/forge-core/src/main/java/forge/deck/DeckFormat.java#L269) handles construction, normalized duplicate counts, and copy exceptions.

Normalize identities and aggregate duplicate rows before constructing the engine deck. Reject negative, fractional, or malformed quantities. Report structured reasons: unknown card, unsupported engine card, banned card, wrong format, insufficient main deck, oversized sideboard, or excess copies. Do not silently omit unknown cards and start with a smaller deck. Expose every actionable problem instead of only the first free-text engine error.

Changing the global `ENFORCE_DECK_LEGALITY` preference is insufficient. Validate explicit payloads at start, host, join, and sideboard submission. Random AI selection uses the same validated format pool. No compatible AI deck produces a recoverable selection state.

### Card discovery and imports

Extend [`ScryCard`](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/src/scryfall.ts#L10) with Oracle identity, legalities, fetch time, and schema version. Use `f:pauper` for discovery; `r:common` filters printings by rarity and does not enforce Pauper legality. A direct [Scryfall API request](https://api.scryfall.com/cards/named?exact=Lightning%20Bolt) returned `legalities.pauper = "legal"` during the audit, and a matching format search returned Lightning Bolt. Server validation remains authoritative.

Browser observation: importing `4 Lightning Bolt`, `20 Mountain`, and sideboard `2 Duress` produced **24 main-deck cards**, with the two sideboard cards discarded. [Import result screenshot](screenshots/11-import-result-1280.png). This agrees with [`parseDeckList`](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/src/decks.ts#L229), which retains only the sideboard count. Preserve section entries, original input, unresolved names, and unsupported sections. Show a review before committing partial imports. Import/export must round-trip both sections.

Replace the frontend’s [hard-coded basic names and copy logic](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/src/ui/deckbuilder.ts#L10) with shared normalized rules: snow-covered basics and explicit exceptions require correct handling. A convenience stepper ceiling is not a format rule.

### Match length and sideboarding

[`Session.start`](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/forge-bridge/src/main/java/mesadeduelo/bridge/Session.java#L113) uses the `GameType` overload, which reads global preferences; local runtime specified three games. Construct per-session `GameRules` and use the existing [`HostedMatch` overload](https://github.com/Card-Forge/forge/blob/0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53/forge-gui/src/main/java/forge/gamemodes/match/HostedMatch.java#L109). Set one game or three explicitly. Avoid changing shared preferences per room.

Current [rematch handling](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/forge-bridge/src/main/java/mesadeduelo/bridge/Rooms.java#L201) creates another `HostedMatch`. Bo3 must continue the same match, preserving score and registered card pool; rematch remains a fresh match.

Forge emits a [`sideboard` protocol request](https://github.com/Card-Forge/forge/blob/0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53/forge-gui/src/main/java/forge/gamemodes/net/ProtocolGuiGame.java#L432), but the bridge’s [question translation](https://github.com/kassiogluten/mesa-de-duelo/blob/ef1cb1adc325ebd58f92b7e34b0d57449628fddd/forge-bridge/src/main/java/mesadeduelo/bridge/Session.java#L243) lacks it and falls through to a null default. Implement private main/sideboard pools, moves between sections, legality feedback, ready confirmation, wait state, and reconnect restoration. Prevent adding cards outside the registered pool. Handle draws and match completion through engine results.

Select AI sideboarding behavior deliberately; Forge supports AI, Off, and HumanForAI. Never inherit HumanForAI accidentally or expose AI choices. The installed engine defaults to [London mulligan](https://github.com/Card-Forge/forge/blob/0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53/forge-core/src/main/java/forge/MulliganDefs.java#L18); verify its full browser flow.

## 4. Data and protocol

```ts
type MatchConfig = {
  format: 'free' | 'pauper';
  matchLength: 'bo1' | 'bo3';
};
```

Start/host carry configuration. Room lookup returns host-owned configuration; join submits the deck against it. Responses include supported formats, rules version, Forge revision, configuration, and structured validation. Reject unsupported values rather than silently falling back.

Deck v2 adds a preferred format, `sideboard: DeckEntry[]`, and resolved Oracle identities. Preserve v1 IDs, names, and main-deck cards; absent format becomes free/unspecified, absent sideboard becomes empty. Back up original storage, validate shapes, migrate idempotently, and retain recoverable invalid records. A format preference is not proof of legality. Ready-made decks remain separate; copying creates a new personal ID.

Cache validation by deck-content hash, rules version, and engine revision. On data updates, revalidate saved decks without rewriting them. Existing matches retain their rules snapshot; new matches use the current version. Missing or stale evidence displays **Não verificado**. Do not fetch external services on every keystroke. Maintain one reviewed template source: the application and Java bridge currently contain different template counts, and the first three application templates have only 40 cards. Ship a small validated Pauper starter collection.

## 5. Delivery and acceptance

First slice: format-first selection, both opponent modes, personal-first compatible libraries, editor/search context, preserved sideboards, authoritative preflight, valid starters, and explicit **Partida única**. Keep **Melhor de três** unavailable until its complete flow works. This is an incremental release, not complete Pauper support.

Completion includes Bo3 score and continuation, sideboarding, ready/leave/reconnect behavior, play/draw order, match end, and rematch. Acceptance requires:

1. Fresh library: personal empty state precedes ready decks; create/import inherit Pauper; switching formats preserves data and explains invalid selections.
2. Construction: 59 main fails; 60/61 otherwise legal pass; sideboard 15 passes and 16 fails; copies split 3+1 pass and 4+1 fail. Basic, snow-basic, and card-text exceptions pass correctly.
3. Legality: a legal card’s uncommon/rare printing passes; non-common-only and current banned cards fail. Include category bans and dated fixtures.
4. Imports: main/sideboard round-trip; aliases, localized names, and multiple faces normalize; malformed counts and unknown cards cannot produce silent partial acceptance.
5. Server: crafted or outdated clients cannot bypass legality; invalid join consumes no seat or current session; random AI decks satisfy the same format.
6. Isolation: simultaneous rooms with different match lengths remain independent; reconnect and rematch restore the correct configuration and rules version.
7. Gameplay: keep/one/two mulligans and bottom ordering work; Bo3 preserves match score, handles draws, validates swaps, and restores private sideboarding state after disconnect.
8. Bridge coverage: exercise stack responses, tokens, sacrifice, graveyard recursion, counters, alternate costs, enters-the-battlefield triggers, and evasion. Unsupported prompts fail visibly in development instead of silently defaulting.

Not verified: a complete Pauper game, network Pauper, Bo3 continuation, AI sideboarding, or every engine legality edge case. These remain implementation acceptance work.
