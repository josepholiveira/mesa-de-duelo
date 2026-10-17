package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.card.MagicColor;
import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.game.GameEntityView;
import forge.game.GameType;
import forge.game.GameStage;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.StackItemView;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.match.YieldUpdate;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputConfirmMulligan;
import forge.gamemodes.match.input.InputLondonMulligan;
import forge.gamemodes.match.input.InputPayMana;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gamemodes.match.input.TargetingProgress;
import forge.gamemodes.net.IRemote;
import forge.gamemodes.net.ProtocolMethod;
import forge.gamemodes.net.event.GuiGameEvent;
import forge.gamemodes.net.event.IdentifiableNetEvent;
import forge.gamemodes.net.event.NetEvent;
import forge.gui.FThreads;
import forge.gui.GuiBase;
import forge.gui.interfaces.IGuiGame;
import forge.interfaces.IGameController;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.player.GamePlayerUtil;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.util.FSerializableFunction;
import io.netty.channel.Channel;

/**
 * Uma partida controlada pelo navegador: um humano contra a IA, ou de dois a quatro humanos numa sala em rede.
 * Cada humano ocupa um {@link Seat}, com a sua conexão, o seu prompt e as suas perguntas.
 *
 * Servidor → cliente: {type:"state", ..., you, input:{message, ok, cancel, selectable}, question, room?}
 * Cliente → servidor: {type:"card", id} | {type:"player", id} | {type:"ok"} | {type:"cancel"}
 *                     | {type:"concede"} | {type:"answer", id, indices|value|text}
 * As mensagens de sala (host, join, rejoin, rematch, leave) e o "start" contra a IA ficam em {@link Rooms}.
 */
final class Session {
    /** Código para voltar à partida ({type:"rejoin", code, token}); numa sala em rede é o código que os jogadores digitam. */
    final String code;
    private final boolean room;
    final Seat[] seats;
    private final List<Deck> aiDecks;
    final MatchConfig config;
    private final AtomicLong stateVersion = new AtomicLong();
    private final VisibleEvents events = new VisibleEvents(this::markDirty, stateVersion::get);
    private volatile String matchId = UUID.randomUUID().toString();
    private volatile String matchPhase = "playing";
    private volatile int gameNumber = 1;
    private volatile int sideboardId;
    private volatile boolean abandoned;
    private final AtomicBoolean dirty = new AtomicBoolean();
    private final AtomicInteger questionSeq = new AtomicInteger();
    private volatile HostedMatch match;

    private record Question(int id, ProtocolMethod method, Object[] args, List<Object> options,
                            CompletableFuture<Object> answer, JsonObject json) { }

    private Session(String code, boolean room, int humans, List<Deck> aiDecks, MatchConfig config) {
        this.code = code;
        this.room = room;
        this.aiDecks = List.copyOf(aiDecks);
        this.config = config;
        seats = new Seat[humans];
        for (int i = 0; i < humans; i++) seats[i] = new Seat(i);
    }

    static Session solo(String code, Channel ch, Deck you, Deck opponent, MatchConfig config) {
        return solo(code, ch, you, List.of(opponent), config);
    }

    static Session solo(String code, Channel ch, Deck you, List<Deck> opponents, MatchConfig config) {
        if (opponents.size() != config.playerCount() - 1) throw new IllegalArgumentException("Quantidade de oponentes inválida.");
        Session s = new Session(code, false, 1, opponents, config);
        s.seats[0].bind(ch, "Você", you);
        return s;
    }

    static Session room(String code, Channel host, String name, Deck deck, MatchConfig config) {
        Session s = new Session(code, true, config.playerCount(), List.of(), config);
        s.seats[0].bind(host, name, deck);
        return s;
    }

    boolean isRoom() { return room; }
    boolean started() { return match != null; }
    boolean full() { for (Seat s : seats) if (s.deck == null) return false; return true; }

    Seat seatOf(Channel ch) {
        for (Seat s : seats) if (s.channel == ch) return s;
        return null;
    }

    boolean anyoneConnected() {
        for (Seat s : seats) if (s.channel != null) return true;
        return false;
    }

    boolean gameOver() {
        HostedMatch m = match;
        GameView gv = m == null ? null : m.getGameView();
        return gv != null && gv.isGameOver();
    }

    // ---------- Partida ----------

    synchronized void start() {
        stop();
        matchId = UUID.randomUUID().toString();
        events.reset(); stateVersion.set(0);
        matchPhase = "playing"; gameNumber = 1; abandoned = false;
        List<RegisteredPlayer> players = new ArrayList<>();
        Map<RegisteredPlayer, IGuiGame> guis = new LinkedHashMap<>();
        Set<String> names = new java.util.HashSet<>();
        for (Seat seat : seats) {
            seat.reset();
            // O frontend reconhece o vencedor pelo nome, então os humanos precisam de nomes diferentes.
            String name = seat.name;
            for (int n = 2; !names.add(name); n++) name = seat.name + " (" + n + ")";
            seat.name = name;
            WebGuiGame g = new WebGuiGame(seat.new Remote(), () -> seat.autoPassNoActions);
            seat.gui = g;
            RegisteredPlayer rp = registered(seat.deck).setPlayer(new LobbyPlayerHuman(name));
            seat.registered = rp;
            players.add(rp);
            guis.put(rp, g);
        }
        for (int i = 0; i < aiDecks.size(); i++)
            players.add(registered(aiDecks.get(i)).setPlayer(GamePlayerUtil.createAiPlayer(aiDecks.size() == 1 ? "Oponente" : "Oponente " + (i + 1))));
        HostedMatch m = new HostedMatch();
        match = m;
        m.setEndGameHook(() -> ended(m));
        m.startMatch(config.rules(), null, players, guis, null);
        System.out.printf("Nova partida%s: %s%n", room ? " na sala " + code : "",
            String.join(" x ", players.stream().map(p -> p.getDeck().getName()).toList()));
        markDirty();
    }

    private RegisteredPlayer registered(Deck deck) {
        return config.commander() ? RegisteredPlayer.forCommander(deck) : new RegisteredPlayer(deck);
    }

    boolean matchOver() {
        HostedMatch m = match;
        return abandoned || (m != null && m.getMatch() != null && m.getMatch().isMatchOver());
    }

    private synchronized void ended(HostedMatch ended) {
        if (match != ended) return;
        matchPhase = matchOver() ? "complete" : "sideboarding";
        sideboardId++;
        for (Seat seat : seats) { seat.sideboardReady = false; seat.approvedDeck = null; }
        markDirty();
    }

    private synchronized void submitSideboard(Seat seat, JsonObject msg, boolean unchanged) {
        if (!"sideboarding".equals(matchPhase) || match == null) return;
        if (!msg.has("id") || exactInt(msg.get("id")) != sideboardId) { markDirty(); return; }
        if (seat.sideboardReady) return;
        Deck current = seat.registered.getDeck();
        var validation = DeckValidation.validate(unchanged ? DeckValidation.deckJson(current) : msg.get("deck"), config.format());
        if (validation.valid() && !DeckValidation.poolCounts(validation.deck()).equals(DeckValidation.poolCounts(seat.deck)))
            DeckValidation.issue(validation.issues(), "registered-pool", "Use somente as cartas registradas no início da partida, sem alterar suas quantidades totais.", null, null);
        if (!validation.valid()) {
            JsonObject error = new JsonObject(); error.addProperty("type", "validation-error");
            error.addProperty("target", "sideboard"); error.add("validation", validation.json());
            seat.send(error.toString()); return;
        }
        seat.approvedDeck = validation.deck(); seat.sideboardReady = true; markDirty();
        for (Seat each : seats) if (!each.sideboardReady) return;
        HostedMatch continuing = match;
        matchPhase = "playing"; gameNumber++;
        for (Seat each : seats) { each.inputGen.incrementAndGet(); each.clearInput(); }
        FThreads.invokeInEdtLater(() -> {
            if (match != continuing || abandoned) return;
            continuing.continueMatch();
            markDirty();
        });
    }

    private JsonObject matchJson() {
        JsonObject o = new JsonObject();
        o.addProperty("gameNumber", gameNumber); o.addProperty("over", matchOver()); o.addProperty("phase", matchPhase);
        o.addProperty("abandoned", abandoned);
        JsonArray wins = new JsonArray(), ready = new JsonArray();
        int draws = 0;
        HostedMatch m = match;
        if (m != null && m.getMatch() != null) {
            for (RegisteredPlayer p : m.getMatch().getPlayers()) wins.add(m.getMatch().getGamesWonBy(p.getPlayer()));
            for (var outcome : m.getMatch().getOutcomes()) if (outcome.isDraw()) draws++;
        }
        for (Seat seat : seats) ready.add(seat.sideboardReady);
        for (Deck ignored : aiDecks) ready.add(true);
        o.add("wins", wins); o.add("ready", ready); o.addProperty("draws", draws);
        return o;
    }

    private JsonObject sideboardingJson(Seat seat) {
        Deck d = seat.approvedDeck == null ? seat.registered.getDeck() : seat.approvedDeck;
        JsonObject o = new JsonObject(); o.addProperty("id", sideboardId); o.addProperty("ready", seat.sideboardReady);
        o.add("main", DeckValidation.entries(d.getMain()));
        o.add("sideboard", DeckValidation.entries(d.getOrCreate(DeckSection.Sideboard)));
        return o;
    }

    /** Abandona a partida atual: concede e libera a thread do jogo se ela estiver esperando uma resposta. */
    synchronized void stop() {
        for (Seat seat : seats) {
            seat.inputGen.incrementAndGet();
            Question q = seat.question;
            seat.question = null;
            if (q != null) q.answer().complete(defaultAnswer(q));
        }
        HostedMatch stopped = match;
        if (stopped != null && !gameOver()) FThreads.invokeInEdtLater(() -> {
            var game = stopped.getGame();
            if (game == null || game.isGameOver()) return;
            for (var player : game.getRegisteredPlayers()) player.concede();
            game.getAction().checkGameOverCondition();
            for (var player : game.getRegisteredPlayers())
                if (player.getController() instanceof PlayerControllerHuman human) human.getInputQueue().onGameOver(true);
        });
        match = null;
        for (Seat seat : seats) { seat.gui = null; seat.me = null; }
    }

    /** Explicit departure ends an unfinished series; a completed result remains intact. */
    synchronized void abandon(Seat seat) {
        if (!config.commander() && !matchOver()) {
            abandoned = true;
            matchPhase = "complete";
            markDirty();
        }
        concede(seat);
    }

    /** Concede o jogo atual; entre jogos, encerra a partida sem inventar vitórias. */
    synchronized void concede(Seat seat) {
        if ("sideboarding".equals(matchPhase)) { abandoned = true; matchPhase = "complete"; markDirty(); }
        IGameController c = seat.controller();
        // A Commander concession removes one seat, preserving every other player's decision.
        for (Seat each : seats) {
            if (config.commander() && each != seat) continue;
            Question q = each.question;
            each.question = null;
            each.inputGen.incrementAndGet(); each.clearInput();
            if (q != null) q.answer().complete(defaultAnswer(q));
        }
        markDirty();
        HostedMatch current = match;
        if (c != null && current != null && !gameOver()) FThreads.invokeInEdtLater(() -> {
            if (current != match) return;
            c.concede();
            if (current.getGameView().isGameOver()) for (Seat each : seats) {
                Question pending = each.question; each.question = null;
                each.inputGen.incrementAndGet(); each.clearInput();
                if (pending != null) pending.answer().complete(defaultAnswer(pending));
            }
            if (c instanceof PlayerControllerHuman human) human.getInputQueue().onGameOver(true);
            markDirty();
        });
    }

    // ---------- Mensagens do navegador ----------

    void onClientMessage(Seat seat, Channel source, String type, JsonObject msg) {
        if (seat.eliminated() && !Set.of("preferences", "hello").contains(type)) { markDirty(); return; }
        int actionGen = -1;
        if (Set.of("card", "attack", "attack-all", "block", "player", "stack", "mana", "ok", "cancel", "pass-turn").contains(type)) {
            if (!msg.has("gen") || !msg.get("gen").isJsonPrimitive() || !msg.get("gen").getAsJsonPrimitive().isNumber()) { markDirty(); return; }
            actionGen = exactInt(msg.get("gen"));
            if (actionGen != seat.inputGen.get() || seat.question != null || !"playing".equals(matchPhase)) { markDirty(); return; }
        }
        final int genAtClick = actionGen;
        switch (type) {
            case "preferences" -> seat.updatePreferences(source, msg);
            case "sideboard" -> submitSideboard(seat, msg, false);
            case "next-game" -> submitSideboard(seat, msg, true);
            case "hello" -> markDirty();
            case "ok", "cancel" -> {
                int gen = genAtClick;
                // Clique repetido no mesmo prompt só vale depois da trava: se o Forge recusou a ação (bloqueio
                // inválido, por exemplo), o prompt continua o mesmo e o jogador precisa poder tentar de novo.
                if (gen != seat.inputGen.get() || seat.buttonsLocked()) { markDirty(); break; }
                seat.consumedGen = gen;
                seat.consumedAt = System.currentTimeMillis();
                markDirty();
                seat.onEdt(genAtClick, "ok".equals(type) ? IGameController::selectButtonOk : IGameController::selectButtonCancel);
            }
            case "pass-turn" -> {
                if (!seat.livePriority() || seat.buttonsLocked() || !seat.okEnabled || seat.question != null) { markDirty(); break; }
                seat.consumedGen = genAtClick; seat.consumedAt = System.currentTimeMillis();
                seat.onEdt(genAtClick, c -> {
                    if (seat.livePriority() && seat.question == null)
                        c.applyYieldUpdate(new YieldUpdate.SetAutoPassUntilEndOfTurn(seat.me, true));
                    markDirty();
                });
                markDirty();
            }
            case "concede" -> concede(seat);
            case "attack" -> {
                int attacker = exactInt(msg.get("attacker")), defender = exactInt(msg.get("defender"));
                String kind = MatchConfig.string(msg, "defenderKind");
                seat.onEdt(genAtClick, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.assignAttack(human.getInputQueue().getInput(), attacker, defender, kind))
                        seat.send(toast("error", "Esse ataque não é válido. Escolha um defensor permitido."));
                    markDirty();
                });
            }
            case "attack-all" -> {
                int defender = exactInt(msg.get("defender"));
                String kind = MatchConfig.string(msg, "defenderKind");
                seat.onEdt(genAtClick, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.assignAllAttackers(human.getInputQueue().getInput(), defender, kind))
                        seat.send(toast("error", "Não foi possível atacar com todas as criaturas. Escolha um defensor permitido antes de declarar atacantes."));
                    markDirty();
                });
            }
            case "block" -> {
                int attacker = exactInt(msg.get("attacker")), blocker = exactInt(msg.get("blocker"));
                seat.onEdt(genAtClick, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.assignBlock(human.getInputQueue().getInput(), attacker, blocker))
                        seat.send(toast("error", "Esse bloqueio não é válido. Escolha um atacante permitido."));
                    markDirty();
                });
            }
            case "card" -> {
                CardView cv = findCard(seat, msg.get("id").getAsInt());
                if (cv != null) seat.onEdt(genAtClick, c -> c.selectCard(cv, null, null));
            }
            case "stack" -> {
                int id = exactInt(msg.get("id"));
                if (!seat.selectableStacks.contains(id)) { markDirty(); break; }
                GameView view = match == null ? null : match.getGameView();
                if (view != null && view.getStack() != null) for (StackItemView item : view.getStack())
                    if (item.getId() == id) { seat.onEdt(genAtClick, c -> c.selectStackItem(item)); break; }
            }
            case "mana" -> {
                // Gastar a mana da reserva no pagamento (o Forge não a usa sozinho, só no Automático).
                byte color = switch (str(msg, "color", "")) {
                    case "W" -> MagicColor.WHITE; case "U" -> MagicColor.BLUE; case "B" -> MagicColor.BLACK;
                    case "R" -> MagicColor.RED; case "G" -> MagicColor.GREEN; case "C" -> MagicColor.COLORLESS;
                    default -> -1;
                };
                if (color >= 0) seat.onEdt(genAtClick, c -> c.useMana(color));
            }
            case "player" -> {
                PlayerView pv = findPlayer(msg.get("id").getAsInt());
                if (pv != null) seat.onEdt(genAtClick, c -> c.selectPlayer(pv, null));
            }
            case "answer" -> answer(seat, msg);
            default -> { }
        }
    }

    private static int exactInt(JsonElement value) {
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber())
            throw new IllegalArgumentException("Identificador inválido.");
        try { return value.getAsBigDecimal().intValueExact(); }
        catch (ArithmeticException e) { throw new IllegalArgumentException("Identificador inválido."); }
    }

    private static String str(JsonObject o, String key, String def) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : def;
    }

    /** Procura a carta só nas zonas que este jogador pode ver: a mão do oponente fica de fora. */
    private CardView findCard(Seat seat, int id) {
        GameView gv = match == null ? null : match.getGameView();
        if (gv == null) return null;
        for (PlayerView p : gv.getPlayers()) {
            List<Iterable<CardView>> zones = new ArrayList<>(List.of(nz(p.getBattlefield()), nz(p.getGraveyard()), nz(p.getExile()), nz(p.getCommand())));
            if (p.equals(seat.me)) zones.add(nz(p.getHand()));
            for (Iterable<CardView> zone : zones) {
                for (CardView c : zone) if (c.getId() == id) return c;
            }
        }
        if (gv.getStack() != null) {
            for (StackItemView si : gv.getStack()) if (si.getSourceCard() != null && si.getSourceCard().getId() == id) return si.getSourceCard();
        }
        return null;
    }

    private PlayerView findPlayer(int id) {
        GameView gv = match == null ? null : match.getGameView();
        if (gv == null) return null;
        for (PlayerView p : gv.getPlayers()) if (p.getId() == id) return p;
        return null;
    }

    private static Iterable<CardView> nz(Iterable<CardView> it) { return it == null ? List.of() : it; }

    // ---------- Perguntas que bloqueiam a thread do jogo ----------

    private Object ask(Seat seat, GuiGameEvent ev) {
        Object[] a = ev.getObjects();
        JsonObject q = new JsonObject();
        List<Object> options = new ArrayList<>();
        int id = questionSeq.incrementAndGet();
        q.addProperty("id", id);
        q.addProperty("method", ev.getMethod().name());

        switch (ev.getMethod()) {
            case sideboard -> {
                Deck approved = seat.approvedDeck;
                if (approved == null) throw new IllegalStateException("Confirme o sideboard antes de continuar.");
                return approved.getMain().toFlatList();
            }
            case getChoices -> {
                // min/max -1: é um reveal() do Forge (Explore, revelar o topo...), só para mostrar as cartas.
                q.addProperty("kind", (Integer) a[1] < 0 ? "reveal" : "choose");
                q.addProperty("title", String.valueOf(a[0]));
                q.addProperty("min", (Integer) a[1]);
                q.addProperty("max", (Integer) a[2]);
                @SuppressWarnings("unchecked") FSerializableFunction<Object, String> display = (FSerializableFunction<Object, String>) a[5];
                options.addAll((Collection<?>) a[3]);
                q.add("options", optionsJson(options, display));
            }
            case getAbilityToPlay -> {
                Collection<?> abilities = (Collection<?>) a[1];
                if (abilities.size() == 1) return abilities.iterator().next();
                q.addProperty("kind", "choose");
                q.addProperty("title", "Qual habilidade usar?");
                q.addProperty("min", 0);
                q.addProperty("max", 1);
                if (a[0] != null) q.add("card", StateJson.card((CardView) a[0]));
                options.addAll((Collection<?>) a[1]);
                JsonArray rows = optionsJson(options, null);
                if (seat.controller() instanceof PlayerControllerHuman human) AbilityOptions.addCosts(human, options, rows);
                q.add("options", rows);
            }
            case chooseSingleEntityForEffect -> {
                q.addProperty("kind", "choose");
                q.addProperty("title", String.valueOf(a[0]));
                q.addProperty("min", Boolean.TRUE.equals(a[3]) ? 0 : 1);
                q.addProperty("max", 1);
                options.addAll((Collection<?>) a[1]);
                q.add("options", optionsJson(options, null));
            }
            case chooseEntitiesForEffect -> {
                q.addProperty("kind", "choose");
                q.addProperty("title", String.valueOf(a[0]));
                q.addProperty("min", (Integer) a[2]);
                q.addProperty("max", (Integer) a[3]);
                options.addAll((Collection<?>) a[1]);
                q.add("options", optionsJson(options, null));
            }
            case order -> {
                q.addProperty("title", String.valueOf(a[0]));
                options.addAll((Collection<?>) a[4]);
                int remMin = (Integer) a[2], remMax = (Integer) a[3];
                if (remMin == 0 && remMax == 0) {
                    q.addProperty("kind", "order");
                } else {
                    // many(): escolher um subconjunto (ex.: vidência "quais vão para o fundo"); os que sobram ficam de fora.
                    q.addProperty("kind", "choose");
                    q.addProperty("min", remMax < 0 ? 0 : Math.max(0, options.size() - remMax));
                    q.addProperty("max", remMin < 0 ? options.size() : options.size() - remMin);
                }
                q.add("options", optionsJson(options, null));
            }
            case confirm -> {
                q.addProperty("kind", "confirm");
                q.addProperty("title", String.valueOf(a[1]));
                if (a[0] != null) q.add("card", StateJson.card((CardView) a[0]));
                @SuppressWarnings("unchecked") List<String> labels = (List<String>) a[3];
                q.add("options", labelsJson(labels == null || labels.size() < 2 ? List.of("Sim", "Não") : labels));
            }
            case showConfirmDialog -> {
                q.addProperty("kind", "confirm");
                q.addProperty("title", String.valueOf(a[0]));
                q.add("options", labelsJson(List.of(String.valueOf(a[2]), String.valueOf(a[3]))));
            }
            case showOptionDialog -> {
                q.addProperty("kind", "choose");
                q.addProperty("title", String.valueOf(a[0]));
                q.addProperty("min", 1);
                q.addProperty("max", 1);
                @SuppressWarnings("unchecked") List<String> labels = (List<String>) a[3];
                options.addAll(labels);
                q.add("options", optionsJson(options, null));
            }
            case showInputDialog -> {
                @SuppressWarnings("unchecked") List<String> choices = (List<String>) a[4];
                q.addProperty("title", String.valueOf(a[0]));
                if (choices != null && !choices.isEmpty()) {
                    q.addProperty("kind", "choose");
                    q.addProperty("min", 1);
                    q.addProperty("max", 1);
                    options.addAll(choices);
                    q.add("options", optionsJson(options, null));
                } else {
                    q.addProperty("kind", "text");
                    q.addProperty("initial", a[3] == null ? "" : String.valueOf(a[3]));
                    q.addProperty("numeric", Boolean.TRUE.equals(a[5]));
                }
            }
            case assignGenericAmount -> {
                @SuppressWarnings("unchecked") Map<Object, Integer> limits = (Map<Object, Integer>) a[1];
                int total = (Integer) a[2], min = Boolean.TRUE.equals(a[3]) ? 1 : 0;
                if (total <= 0) return Map.of();
                options.addAll(limits.keySet());
                q.addProperty("kind", "amount"); q.addProperty("total", total);
                q.addProperty("title", "Distribua o total entre as opções");
                if (a[0] instanceof CardView card) q.add("card", StateJson.card(card));
                JsonArray rows = optionsJson(options, null);
                for (int i = 0; i < options.size(); i++) {
                    JsonObject row = rows.get(i).getAsJsonObject();
                    row.addProperty("min", min); row.addProperty("max", Math.min(total, limits.get(options.get(i))));
                }
                q.add("options", rows);
            }
            case assignCombatDamage -> { return autoCombatDamage(a); }
            case manipulateCardList -> {
                List<CardView> out = new ArrayList<>();
                ((Iterable<?>) a[1]).forEach(o -> out.add((CardView) o));
                return out;
            }
            default -> {
                seat.send(toast("error", "Esta decisão ainda não é suportada: " + ev.getMethod() + "."));
                if (Boolean.getBoolean("mesa.strictPrompts")) throw new IllegalStateException("Unsupported prompt: " + ev.getMethod());
                return null;
            }
        }

        Question question = new Question(id, ev.getMethod(), a, options, new CompletableFuture<>(), q);
        if (seat.eliminated()) return defaultAnswer(question);
        seat.question = question;
        markDirty();
        try {
            return GuiBase.getInterface() instanceof HeadlessGui headless
                ? headless.awaitBrowserAnswer(question.answer()) : question.answer().get();
        } catch (Exception e) {
            return defaultAnswer(question);
        } finally {
            if (seat.question == question) { seat.question = null; seat.inputGen.incrementAndGet(); }
            markDirty();
        }
    }

    private void answer(Seat seat, JsonObject msg) {
        Question q = seat.question;
        if (q == null || !msg.has("id") || exactInt(msg.get("id")) != q.id()) return;
        validateAnswer(q, msg);
        Object result;
        switch (q.method()) {
            case confirm, showConfirmDialog -> result = msg.get("value").getAsBoolean();
            case showOptionDialog -> result = firstIndex(msg);
            case showInputDialog -> result = q.options().isEmpty() ? str(msg, "text", "") : pick(q, msg).stream().findFirst().orElse(null);
            case getAbilityToPlay, chooseSingleEntityForEffect -> result = pick(q, msg).stream().findFirst().orElse(null);
            case order -> result = new IGuiGame.OrderResult<>(pick(q, msg), false);
            case assignGenericAmount -> {
                int[] values = AmountAllocation.validate(q.json(), msg.get("amounts"));
                Map<Object, Integer> allocation = new LinkedHashMap<>();
                for (int i = 0; i < values.length; i++) allocation.put(q.options().get(i), values[i]);
                result = allocation;
            }
            default -> result = pick(q, msg);
        }
        q.answer().complete(result);
    }

    private static void validateAnswer(Question q, JsonObject msg) {
        if (q.method() == ProtocolMethod.confirm || q.method() == ProtocolMethod.showConfirmDialog) {
            if (!msg.has("value") || !msg.get("value").isJsonPrimitive() || !msg.get("value").getAsJsonPrimitive().isBoolean())
                throw new IllegalArgumentException("Escolha uma resposta válida.");
            return;
        }
        if (q.method() == ProtocolMethod.assignGenericAmount) { AmountAllocation.validate(q.json(), msg.get("amounts")); return; }
        if (q.method() == ProtocolMethod.showInputDialog && q.options().isEmpty()) {
            String text = MatchConfig.string(msg, "text");
            if (text.length() > 1000) throw new IllegalArgumentException("A resposta é longa demais.");
            if (Boolean.TRUE.equals(q.args()[5])) try { Integer.parseInt(text); }
                catch (NumberFormatException e) { throw new IllegalArgumentException("Informe um número inteiro."); }
            return;
        }
        JsonArray indices = msg.has("indices") && msg.get("indices").isJsonArray() ? msg.getAsJsonArray("indices") : new JsonArray();
        Set<Integer> unique = new java.util.HashSet<>();
        for (JsonElement e : indices) {
            int i;
            try { i = exactInt(e); } catch (RuntimeException ex) { throw new IllegalArgumentException("Seleção inválida."); }
            if (i < 0 || i >= q.options().size() || !unique.add(i)) throw new IllegalArgumentException("Seleção inválida.");
        }
        String kind = q.json().get("kind").getAsString();
        if ("order".equals(kind) && unique.size() != q.options().size()) throw new IllegalArgumentException("Ordene todas as opções.");
        if ("choose".equals(kind)) {
            int min = q.json().has("min") ? q.json().get("min").getAsInt() : 0;
            int max = q.json().has("max") ? q.json().get("max").getAsInt() : q.options().size();
            if (unique.size() < min || (max >= 0 && unique.size() > max)) throw new IllegalArgumentException("A quantidade de opções selecionadas é inválida.");
        }
    }

    private static int firstIndex(JsonObject msg) {
        JsonArray idx = msg.getAsJsonArray("indices");
        return idx == null || idx.isEmpty() ? 0 : idx.get(0).getAsInt();
    }

    private static List<Object> pick(Question q, JsonObject msg) {
        List<Object> out = new ArrayList<>();
        JsonArray idx = msg.getAsJsonArray("indices");
        if (idx != null) for (JsonElement e : idx) {
            int i = e.getAsInt();
            if (i >= 0 && i < q.options().size()) out.add(q.options().get(i));
        }
        return out;
    }

    private static Object defaultAnswer(Question q) {
        return switch (q.method()) {
            case confirm -> q.args()[2];
            case showConfirmDialog -> q.args()[4];
            case showOptionDialog -> q.args()[4];
            case showInputDialog -> q.args()[3];
            case order -> new IGuiGame.OrderResult<>(isSubset(q) ? new ArrayList<>() : new ArrayList<>(q.options()), false);
            // Only used while a game is being abandoned, to release the blocked engine safely.
            case assignGenericAmount -> {
                Map<Object, Integer> allocation = new LinkedHashMap<>();
                int remaining = q.json().get("total").getAsInt();
                JsonArray bounds = q.json().getAsJsonArray("options");
                for (int i = 0; i < q.options().size(); i++) {
                    int min = bounds.get(i).getAsJsonObject().get("min").getAsInt();
                    allocation.put(q.options().get(i), min); remaining -= min;
                }
                for (int i = 0; i < q.options().size() && remaining > 0; i++) {
                    Object target = q.options().get(i);
                    int extra = Math.min(remaining, bounds.get(i).getAsJsonObject().get("max").getAsInt() - allocation.get(target));
                    allocation.merge(target, extra, Integer::sum); remaining -= extra;
                }
                yield allocation;
            }
            case getChoices, chooseEntitiesForEffect -> new ArrayList<>(q.options().subList(0, Math.max(0, Math.min(q.options().size(), (Integer) (q.method() == ProtocolMethod.getChoices ? q.args()[1] : q.args()[2])))));
            default -> null;
        };
    }

    private static boolean isSubset(Question q) {
        return (Integer) q.args()[2] != 0 || (Integer) q.args()[3] != 0;
    }

    /** Dano letal em cada bloqueador, na ordem; o resto vai para o defensor (atropelar) ou para o último bloqueador. */
    private static Map<CardView, Integer> autoCombatDamage(Object[] a) {
        @SuppressWarnings("unchecked") List<CardView> blockers = (List<CardView>) a[1];
        int damage = (Integer) a[2];
        GameEntityView defender = (GameEntityView) a[3];
        Map<CardView, Integer> map = new HashMap<>();
        for (int i = 0; i < blockers.size() && damage > 0; i++) {
            CardView b = blockers.get(i);
            int lethal = Math.max(1, b.getLethalDamage());
            int amt = Math.min(damage, lethal);
            map.merge(b, amt, Integer::sum);
            damage -= amt;
        }
        if (damage > 0) {
            if (defender != null) map.put(null, damage);
            else if (!blockers.isEmpty()) map.merge(blockers.get(blockers.size() - 1), damage, Integer::sum);
        }
        return map;
    }

    private static JsonArray optionsJson(List<Object> options, FSerializableFunction<Object, String> display) {
        JsonArray arr = new JsonArray();
        for (Object o : options) {
            JsonObject j = new JsonObject();
            if (o instanceof CardView cv) { j.addProperty("kind", "card"); j.add("card", StateJson.card(cv)); }
            else if (o instanceof PlayerView pv) { j.addProperty("kind", "player"); j.addProperty("id", pv.getId()); }
            j.addProperty("label", display != null ? display.apply(o) : String.valueOf(o));
            arr.add(j);
        }
        return arr;
    }

    private static JsonArray labelsJson(List<String> labels) {
        JsonArray arr = new JsonArray();
        labels.forEach(arr::add);
        return arr;
    }

    // ---------- Publicação do estado ----------

    void markDirty() { stateVersion.incrementAndGet(); dirty.set(true); }

    /** Chamado pelo publicador de {@link Rooms} a cada 50 ms. */
    void tick() {
        // Se o Forge não abriu um prompt novo depois do clique, os botões voltam a funcionar.
        for (Seat seat : seats) if (seat.lockedAtLastFlush && !seat.buttonsLocked()) dirty.set(true);
        if (!dirty.getAndSet(false)) return;
        for (Seat seat : seats) {
            if (seat.channel == null) continue;
            JsonObject state = state(seat);
            if (state == null) { dirty.set(true); return; }
            seat.send(state.toString());
            if (state.has("eventCursor")) seat.sentEventCursor = state.get("eventCursor").getAsLong();
        }
    }

    private static java.lang.reflect.Field selectTargetsSa, payManaSa, mulliganStartingPlayer, londonReturnCount;

    /**
     * Mágica sendo conjurada (escolhendo alvos ou pagando o custo): a carta que alveja ({@code source}) e os alvos
     * já escolhidos, para a mesa desenhar as setas. O Forge não expõe a habilidade desses inputs, então ela é lida
     * por reflexão. No pagamento só vale para o que ainda não está na pilha (lá os alvos vão com o item).
     */
    private static JsonObject targeting(Seat seat) {
        if (!(seat.controller() instanceof PlayerControllerHuman pch)) return null;
        Object in = pch.getInputQueue().getInput();
        try {
            SpellAbility sa;
            if (in instanceof InputSelectTargets) {
                if (selectTargetsSa == null) selectTargetsSa = accessible(InputSelectTargets.class, "sa");
                sa = (SpellAbility) selectTargetsSa.get(in);
            } else if (in instanceof InputPayMana) {
                if (payManaSa == null) payManaSa = accessible(InputPayMana.class, "saPaidFor");
                sa = (SpellAbility) payManaSa.get(in);
                if (sa != null && sa.getHostCard() != null
                    && sa.getHostCard().getGame().getStack().getInstanceMatchingSpellAbilityID(sa.getRootAbility()) != null) return null;
            } else {
                return null;
            }
            if (sa == null || sa.getHostCard() == null) return null;
            JsonObject o = StateJson.targets(TargetingProgress.chosenTargets(sa));
            if (o == null) {
                if (in instanceof InputPayMana) return null;
                o = new JsonObject();
            }
            o.addProperty("source", sa.getHostCard().getId());
            // Ao conjurar, a carta já saiu da mão: vai junto para a mesa mostrar de onde sai a seta.
            o.add("card", StateJson.card(CardView.get(sa.getHostCard())));
            return o;
        } catch (ReflectiveOperationException | RuntimeException e) {
            return null;
        }
    }

    private static java.lang.reflect.Field accessible(Class<?> c, String name) throws NoSuchFieldException {
        java.lang.reflect.Field f = c.getDeclaredField(name);
        f.setAccessible(true);
        return f;
    }

    /** Monta o estado visto por um jogador; null se uma leitura concorrente falhar (refeita no próximo ciclo). */
    private JsonObject state(Seat seat) {
        HostedMatch m = match;
        GameView gv = m == null ? null : m.getGameView();
        JsonObject state;
        try {
            if (gv == null) {
                state = new JsonObject();
                state.addProperty("type", "lobby");
            } else {
                PlayerView p = seat.me;
                state = StateJson.game(gv, p == null ? -2 : p.getId(), m.getGame());
                state.addProperty("you", p == null ? -1 : p.getId());
                boolean spectating = seat.eliminated();
                state.addProperty("spectating", spectating);
                JsonObject input = new JsonObject();
                int generation = seat.inputGen.get();
                Object currentInput = !spectating && seat.controller() instanceof PlayerControllerHuman human ? human.getInputQueue().getInput() : null;
                boolean priority = currentInput instanceof InputPassPriority;
                input.addProperty("priority", priority);
                JsonObject attacking = InputContext.attacking(currentInput);
                if (attacking != null) input.add("attacking", attacking);
                JsonObject blocking = InputContext.blocking(currentInput);
                if (blocking != null) input.add("blocking", blocking);
                JsonObject suspendCast = InputContext.suspendCast(currentInput);
                if (suspendCast != null) input.add("suspendCast", suspendCast);
                JsonObject selection = InputContext.selection(currentInput);
                if (selection != null) input.add("selection", selection);
                Set<Integer> playerChoices = InputContext.playerChoices(currentInput);
                if (currentInput instanceof InputLondonMulligan) input.addProperty("opening", "mulligan-bottom");
                else if (currentInput instanceof InputConfirmMulligan) input.addProperty("opening", "mulligan");
                else if (currentInput instanceof InputConfirm && m.getGame().getAge() == GameStage.BeforeMulligan && !events.gameStarted())
                    input.addProperty("opening", "play-draw");
                else if (!playerChoices.isEmpty() && m.getGame().getAge() == GameStage.BeforeMulligan && !events.gameStarted())
                    input.addProperty("opening", "starting-player");
                if (input.has("opening")) {
                    try {
                        if (currentInput instanceof InputConfirmMulligan) {
                            if (mulliganStartingPlayer == null) mulliganStartingPlayer = accessible(InputConfirmMulligan.class, "startingPlayer");
                            forge.game.player.Player first = (forge.game.player.Player) mulliganStartingPlayer.get(currentInput);
                            if (first != null) seat.openingStartingPlayer = first.getId();
                        }
                        if (seat.openingStartingPlayer >= 0) input.addProperty("openingStartingPlayer", seat.openingStartingPlayer);
                        if (currentInput instanceof InputLondonMulligan london) {
                            if (londonReturnCount == null) londonReturnCount = accessible(InputLondonMulligan.class, "toReturn");
                            int total = londonReturnCount.getInt(london);
                            input.addProperty("openingReturnCount", total);
                            input.addProperty("openingReturnRemaining", total - london.getSelectedCards().size());
                            JsonArray selected = new JsonArray(); london.getSelectedCards().forEach(card -> selected.add(card.getId()));
                            input.add("openingSelected", selected);
                        }
                    } catch (ReflectiveOperationException ignored) { /* Optional metadata; keep the actual input usable. */ }
                }
                boolean locked = seat.buttonsLocked();
                seat.lockedAtLastFlush = locked;
                input.addProperty("gen", generation);
                input.addProperty("message", seat.message);
                input.add("ok", button(priority && "OK".equalsIgnoreCase(seat.okLabel) ? "Passar prioridade" : seat.okLabel, seat.okEnabled && !locked && !spectating));
                input.add("cancel", button(seat.cancelLabel, seat.cancelEnabled && !locked && !spectating));
                JsonArray sel = new JsonArray();
                seat.selectable.forEach(sel::add);
                input.add("selectable", sel);
                JsonArray stackTargets = new JsonArray(); seat.selectableStacks.forEach(stackTargets::add);
                input.add("selectableStacks", stackTargets);
                Set<Integer> playerIds = new LinkedHashSet<>(seat.selectablePlayers); playerIds.addAll(playerChoices);
                JsonArray playerTargets = new JsonArray(); playerIds.forEach(playerTargets::add);
                input.add("selectablePlayers", playerTargets);
                JsonArray act = new JsonArray();
                seat.actionable.forEach(act::add);
                input.add("actionable", act);
                // Pagando um custo de mana: a reserva fica clicável no retrato.
                if (seat.controller() instanceof PlayerControllerHuman pch && pch.getInputQueue().getInput() instanceof InputPayMana) {
                    input.addProperty("paying", true);
                }
                JsonObject targeting = targeting(seat);
                if (targeting != null) input.add("targeting", targeting);
                CardView promptCard = seat.promptCard;
                if (promptCard != null) input.add("card", StateJson.card(promptCard));
                state.add("input", input);
                Question q = seat.question;
                if (q != null && !spectating) state.add("question", q.json());
                // Phase/zone events can precede the actionable input. Never advertise an early cast.
                if (!priority || !seat.okEnabled || locked || q != null) state.add("castable", new JsonArray());
                if (generation != seat.inputGen.get()) return null;
            }
        } catch (RuntimeException e) {
            return null;
        }
        state.add("config", config.json());
        JsonObject preferences = new JsonObject();
        preferences.addProperty("autoPassNoActions", seat.autoPassNoActions);
        state.add("preferences", preferences);
        state.add("match", matchJson());
        state.addProperty("matchId", matchId);
        MatchConfig.versions(state);
        synchronized (events) {
            state.add("events", events.json(seat.sentEventCursor));
            state.addProperty("eventCursor", events.cursor());
            state.addProperty("stateVersion", stateVersion.get());
        }
        if ("sideboarding".equals(matchPhase) && seat.registered != null) state.add("sideboarding", sideboardingJson(seat));
        state.add("session", sessionJson(seat));
        if (isRoom()) state.add("room", roomJson(seat));
        JsonArray decks = new JsonArray();
        Decks.LISTS.keySet().forEach(decks::add);
        state.add("decks", decks);
        return state;
    }

    /** {code, token, room}: o que o navegador guarda para voltar a esta partida se a conexão cair. */
    JsonObject sessionJson(Seat seat) {
        JsonObject o = new JsonObject();
        o.addProperty("code", code);
        o.addProperty("token", seat.token);
        o.addProperty("room", room);
        return o;
    }

    /** {code, seat, token, started, players:[{name, connected, rematch}]} */
    JsonObject roomJson(Seat seat) {
        JsonObject r = new JsonObject();
        r.addProperty("code", code);
        r.addProperty("seat", seat.index);
        r.addProperty("token", seat.token);
        r.addProperty("started", started());
        r.addProperty("capacity", config.playerCount());
        r.add("config", config.json());
        MatchConfig.versions(r);
        JsonArray ps = new JsonArray();
        for (Seat s : seats) {
            if (s.deck == null) continue;
            JsonObject p = new JsonObject();
            p.addProperty("seat", s.index);
            p.addProperty("playerId", s.me == null ? null : s.me.getId());
            p.addProperty("eliminated", s.eliminated());
            p.addProperty("name", s.name);
            p.addProperty("connected", s.channel != null);
            p.addProperty("rematch", s.rematch);
            ps.add(p);
        }
        r.add("players", ps);
        return r;
    }

    JsonObject publicRoomJson() {
        JsonObject r = new JsonObject();
        r.addProperty("code", code); r.addProperty("available", !full() && !started());
        r.addProperty("capacity", config.playerCount());
        r.add("config", config.json()); MatchConfig.versions(r);
        JsonArray players = new JsonArray();
        for (Seat seat : seats) if (seat.deck != null) {
            JsonObject p = new JsonObject(); p.addProperty("seat", seat.index); p.addProperty("name", seat.name); p.addProperty("connected", seat.channel != null); players.add(p);
        }
        r.add("players", players); return r;
    }

    void sendRoom(Seat seat) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "room");
        o.add("room", roomJson(seat));
        seat.send(o.toString());
    }

    private static JsonObject button(String label, boolean enabled) {
        JsonObject b = new JsonObject();
        b.addProperty("label", label == null ? "" : label);
        b.addProperty("enabled", enabled);
        return b;
    }

    static String toast(String type, String text) {
        JsonObject o = new JsonObject();
        o.addProperty("type", type);
        o.addProperty("text", text);
        return o.toString();
    }

    // ---------- Assento de um jogador humano ----------

    final class Seat {
        final int index;
        /** Segredo para voltar ao assento depois de cair a conexão ({type:"rejoin", code, token}). */
        volatile String token = UUID.randomUUID().toString();
        volatile Channel channel;
        volatile String name;
        volatile Deck deck;
        volatile boolean rematch;
        volatile boolean departed;
        private volatile RegisteredPlayer registered;
        private volatile Deck approvedDeck;
        private volatile boolean sideboardReady;
        private volatile long sentEventCursor;
        // A seat preference survives reconnects, the next game, and a rematch.
        private volatile boolean autoPassNoActions = true;

        private volatile WebGuiGame gui;
        private volatile PlayerView me;
        private volatile Question question;

        // Estado do "input" atual do Forge (prompt, botões e cartas selecionáveis).
        private volatile String message = "";
        private volatile int openingStartingPlayer = -1;
        /** Carta citada pelo prompt (ex.: a do topo na vidência de 1); pode estar numa zona oculta. */
        private volatile CardView promptCard;
        private volatile String okLabel = "", cancelLabel = "";
        private volatile boolean okEnabled, cancelEnabled;
        private volatile Set<Integer> selectable = Set.of();
        private volatile Set<Integer> selectableStacks = Set.of(), selectablePlayers = Set.of();
        /** Cartas que o Forge marca como utilizáveis agora: jogáveis, atacantes ou bloqueadores possíveis. */
        private volatile Set<Integer> actionable = Set.of();
        /**
         * Versão do prompt atual. Um clique em OK/Cancelar só vale para a versão que o jogador estava vendo:
         * sem isso, um clique duplo (ou um clique feito enquanto a tela ainda mostrava o prompt anterior)
         * cai no prompt seguinte e passa a prioridade, pulando uma fase.
         */
        private final AtomicInteger inputGen = new AtomicInteger();
        private volatile int consumedGen = -1;
        private volatile long consumedAt;
        private static final long CONSUMED_TIMEOUT_MS = 1500;
        private volatile boolean lockedAtLastFlush;

        Seat(int index) { this.index = index; }

        Session session() { return Session.this; }

        void bind(Channel ch, String name, Deck deck) {
            this.token = UUID.randomUUID().toString();
            this.departed = false;
            this.channel = ch;
            this.name = name;
            this.deck = deck;
        }

        void send(String json) { BridgeServer.send(channel, json); }

        private void reset() {
            clearInput(); rematch = false; question = null; approvedDeck = null; sideboardReady = false; sentEventCursor = 0;
            inputGen.incrementAndGet(); consumedGen = -1;
        }

        private void clearInput() {
            openingStartingPlayer = -1; message = ""; promptCard = null; okLabel = cancelLabel = ""; okEnabled = cancelEnabled = false;
            selectable = Set.of(); selectableStacks = Set.of(); selectablePlayers = Set.of(); actionable = Set.of();
        }

        private boolean buttonsLocked() {
            return consumedGen == inputGen.get() && System.currentTimeMillis() - consumedAt < CONSUMED_TIMEOUT_MS;
        }

        private IGameController controller() {
            WebGuiGame g = gui;
            PlayerView p = me;
            return g == null || p == null ? null : g.getGameController(p);
        }

        boolean eliminated() { return config.commander() && me != null && me.getHasLost(); }

        private boolean livePriority() {
            return controller() instanceof PlayerControllerHuman human && human.getInputQueue().getInput() instanceof InputPassPriority;
        }

        private void updatePreferences(Channel source, JsonObject message) {
            JsonElement value = message.get("autoPassNoActions");
            if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isBoolean())
                throw new IllegalArgumentException("Informe um valor booleano para a passagem automática de prioridade.");
            boolean enabled = value.getAsBoolean();
            // Settings are independent of a prompt generation, but a replaced or departed socket
            // cannot change this seat. Resolve the controller at execution time across Bo3 games.
            FThreads.invokeInEdtLater(() -> {
                if (channel != source) return;
                autoPassNoActions = enabled;
                IGameController current = controller();
                if (current != null) current.applyYieldUpdate(new YieldUpdate.SetYieldPref(
                    FPref.YIELD_AUTO_PASS_NO_ACTIONS, Boolean.toString(enabled)));
                markDirty();
            });
        }

        private void onEdt(int generation, java.util.function.Consumer<IGameController> action) {
            IGameController c = controller();
            if (c != null) FThreads.invokeInEdtLater(() -> { if (generation == inputGen.get() && question == null && "playing".equals(matchPhase) && c == controller()) action.accept(c); else markDirty(); });
        }

        /** Recebe as chamadas do ProtocolGuiGame deste jogador. */
        private final class Remote implements IRemote {
            private final String belongsToMatch = matchId;
            @Override
            public void send(NetEvent event) {
                if (!belongsToMatch.equals(matchId) || !(event instanceof GuiGameEvent ev)) return;
                Object[] a = ev.getObjects();
                switch (ev.getMethod()) {
                    case openView -> {
                        @SuppressWarnings("unchecked") TrackableCollection<PlayerView> mine = (TrackableCollection<PlayerView>) a[0];
                        me = mine.iterator().next();
                        if (match != null) events.attach(match.getGame());
                    }
                    case showPromptMessage -> {
                        message = a[1] == null ? "" : String.valueOf(a[1]);
                        promptCard = a.length > 2 && a[2] instanceof CardView cv ? cv : null;
                        inputGen.incrementAndGet();
                    }
                    case updateButtons -> {
                        inputGen.incrementAndGet();
                        okLabel = String.valueOf(a[1]); cancelLabel = String.valueOf(a[2]);
                        okEnabled = Boolean.TRUE.equals(a[3]); cancelEnabled = Boolean.TRUE.equals(a[4]);
                    }
                    case setSelectables -> {
                        Set<Integer> ids = new LinkedHashSet<>();
                        if (a[0] != null) for (Object o : (Iterable<?>) a[0]) ids.add(((CardView) o).getId());
                        selectable = ids;
                    }
                    case setSelectableTargets -> {
                        Set<Integer> stackIds = new LinkedHashSet<>(), playerIds = new LinkedHashSet<>();
                        if (a[0] != null) for (Object target : (Iterable<?>) a[0]) {
                            if (target instanceof StackItemView item) stackIds.add(item.getId());
                            else if (target instanceof PlayerView player) playerIds.add(player.getId());
                        }
                        selectableStacks = stackIds; selectablePlayers = playerIds;
                    }
                    case clearSelectables -> { selectable = Set.of(); selectableStacks = Set.of(); selectablePlayers = Set.of(); }
                    case setWeaklySelectable -> {
                        Set<Integer> ids = new LinkedHashSet<>();
                        if (a[0] != null) for (Object o : (Iterable<?>) a[0]) ids.add(((CardView) o).getId());
                        actionable = ids;
                    }
                    case clearWeaklySelectable -> actionable = Set.of();
                    case message, showErrorDialog -> Seat.this.send(toast("toast", String.valueOf(a[0])));
                    default -> { }
                }
                markDirty();
            }

            @Override
            public Object sendAndWait(IdentifiableNetEvent event) {
                if (!belongsToMatch.equals(matchId)) throw new IllegalStateException("Previous match is closed");
                return ask(Seat.this, (GuiGameEvent) event);
            }
        }
    }
}
