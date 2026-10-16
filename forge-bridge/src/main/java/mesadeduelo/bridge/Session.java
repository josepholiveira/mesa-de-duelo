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

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.deck.Deck;
import forge.game.GameEntityView;
import forge.game.GameType;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.StackItemView;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.net.IRemote;
import forge.gamemodes.net.ProtocolMethod;
import forge.gamemodes.net.event.GuiGameEvent;
import forge.gamemodes.net.event.IdentifiableNetEvent;
import forge.gamemodes.net.event.NetEvent;
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.interfaces.IGameController;
import forge.player.GamePlayerUtil;
import forge.player.LobbyPlayerHuman;
import forge.trackable.TrackableCollection;
import forge.util.FSerializableFunction;
import io.netty.channel.Channel;

/**
 * Uma partida controlada pelo navegador: um humano contra a IA, ou dois humanos numa sala em rede.
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
    private final Deck aiDeck;
    private final AtomicBoolean dirty = new AtomicBoolean();
    private final AtomicInteger questionSeq = new AtomicInteger();
    private volatile HostedMatch match;

    private record Question(int id, ProtocolMethod method, Object[] args, List<Object> options,
                            CompletableFuture<Object> answer, JsonObject json) { }

    private Session(String code, boolean room, int humans, Deck aiDeck) {
        this.code = code;
        this.room = room;
        this.aiDeck = aiDeck;
        seats = new Seat[humans];
        for (int i = 0; i < humans; i++) seats[i] = new Seat(i);
    }

    static Session solo(String code, Channel ch, Deck you, Deck opponent) {
        Session s = new Session(code, false, 1, opponent);
        s.seats[0].bind(ch, "Você", you);
        return s;
    }

    static Session room(String code, Channel host, String name, Deck deck) {
        Session s = new Session(code, true, 2, null);
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
        List<RegisteredPlayer> players = new ArrayList<>();
        Map<RegisteredPlayer, IGuiGame> guis = new LinkedHashMap<>();
        Set<String> names = new java.util.HashSet<>();
        for (Seat seat : seats) {
            seat.reset();
            // O frontend reconhece o vencedor pelo nome, então os dois humanos precisam de nomes diferentes.
            String name = seat.name;
            for (int n = 2; !names.add(name); n++) name = seat.name + " (" + n + ")";
            seat.name = name;
            WebGuiGame g = new WebGuiGame(seat.new Remote());
            seat.gui = g;
            RegisteredPlayer rp = new RegisteredPlayer(seat.deck).setPlayer(new LobbyPlayerHuman(name));
            players.add(rp);
            guis.put(rp, g);
        }
        if (aiDeck != null) players.add(new RegisteredPlayer(aiDeck).setPlayer(GamePlayerUtil.createAiPlayer("Oponente")));
        HostedMatch m = new HostedMatch();
        match = m;
        m.startMatch(GameType.Constructed, null, players, guis);
        System.out.printf("Nova partida%s: %s%n", room ? " na sala " + code : "",
            String.join(" x ", players.stream().map(p -> p.getDeck().getName()).toList()));
        markDirty();
    }

    /** Abandona a partida atual: concede e libera a thread do jogo se ela estiver esperando uma resposta. */
    synchronized void stop() {
        for (Seat seat : seats) {
            Question q = seat.question;
            seat.question = null;
            if (q != null) q.answer().complete(defaultAnswer(q));
        }
        if (match != null && !gameOver()) {
            for (Seat seat : seats) {
                IGameController c = seat.controller();
                if (c != null) { FThreads.invokeInEdtLater(c::concede); break; }
            }
        }
        match = null;
        for (Seat seat : seats) { seat.gui = null; seat.me = null; }
    }

    /** Um jogador sai da sala ou da partida: ele concede, e a sala segue para o outro ver o resultado. */
    void concede(Seat seat) {
        IGameController c = seat.controller();
        Question q = seat.question;
        seat.question = null;
        if (q != null) q.answer().complete(defaultAnswer(q));
        if (c != null && match != null && !gameOver()) FThreads.invokeInEdtLater(c::concede);
    }

    // ---------- Mensagens do navegador ----------

    void onClientMessage(Seat seat, String type, JsonObject msg) {
        switch (type) {
            case "hello" -> markDirty();
            case "ok", "cancel" -> {
                int gen = msg.has("gen") ? msg.get("gen").getAsInt() : seat.inputGen.get();
                if (gen != seat.inputGen.get() || gen == seat.consumedGen) { markDirty(); break; }
                seat.consumedGen = gen;
                seat.consumedAt = System.currentTimeMillis();
                markDirty();
                seat.onEdt("ok".equals(type) ? IGameController::selectButtonOk : IGameController::selectButtonCancel);
            }
            case "concede" -> concede(seat);
            case "card" -> {
                CardView cv = findCard(seat, msg.get("id").getAsInt());
                if (cv != null) seat.onEdt(c -> c.selectCard(cv, null, null));
            }
            case "player" -> {
                PlayerView pv = findPlayer(msg.get("id").getAsInt());
                if (pv != null) seat.onEdt(c -> c.selectPlayer(pv, null));
            }
            case "answer" -> answer(seat, msg);
            default -> { }
        }
    }

    private static String str(JsonObject o, String key, String def) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : def;
    }

    /** Procura a carta só nas zonas que este jogador pode ver: a mão do oponente fica de fora. */
    private CardView findCard(Seat seat, int id) {
        GameView gv = match == null ? null : match.getGameView();
        if (gv == null) return null;
        for (PlayerView p : gv.getPlayers()) {
            List<Iterable<CardView>> zones = new ArrayList<>(List.of(nz(p.getBattlefield()), nz(p.getGraveyard()), nz(p.getExile())));
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
            case getChoices -> {
                q.addProperty("kind", "choose");
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
                q.add("options", optionsJson(options, null));
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
            case assignCombatDamage -> { return autoCombatDamage(a); }
            case manipulateCardList -> {
                List<CardView> out = new ArrayList<>();
                ((Iterable<?>) a[1]).forEach(o -> out.add((CardView) o));
                return out;
            }
            default -> {
                System.err.println("Pergunta sem tradução, respondida com o padrão: " + ev.getMethod());
                return null;
            }
        }

        Question question = new Question(id, ev.getMethod(), a, options, new CompletableFuture<>(), q);
        seat.question = question;
        markDirty();
        try {
            return question.answer().get();
        } catch (Exception e) {
            return defaultAnswer(question);
        } finally {
            if (seat.question == question) seat.question = null;
            markDirty();
        }
    }

    private void answer(Seat seat, JsonObject msg) {
        Question q = seat.question;
        if (q == null || msg.get("id").getAsInt() != q.id()) return;
        Object result;
        switch (q.method()) {
            case confirm, showConfirmDialog -> result = msg.get("value").getAsBoolean();
            case showOptionDialog -> result = firstIndex(msg);
            case showInputDialog -> result = q.options().isEmpty() ? str(msg, "text", "") : pick(q, msg).stream().findFirst().orElse(null);
            case getAbilityToPlay, chooseSingleEntityForEffect -> result = pick(q, msg).stream().findFirst().orElse(null);
            case order -> result = new IGuiGame.OrderResult<>(pick(q, msg), false);
            default -> result = pick(q, msg);
        }
        seat.question = null;
        q.answer().complete(result);
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
            case getChoices, chooseEntitiesForEffect -> new ArrayList<>(q.options().subList(0, Math.min(q.options().size(), (Integer) (q.method() == ProtocolMethod.getChoices ? q.args()[1] : q.args()[2]))));
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

    void markDirty() { dirty.set(true); }

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
        }
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
                state = StateJson.game(gv, p == null ? -1 : p.getId(), m.getGame());
                state.addProperty("you", p == null ? -1 : p.getId());
                JsonObject input = new JsonObject();
                boolean locked = seat.buttonsLocked();
                seat.lockedAtLastFlush = locked;
                input.addProperty("gen", seat.inputGen.get());
                input.addProperty("message", seat.message);
                input.add("ok", button(seat.okLabel, seat.okEnabled && !locked));
                input.add("cancel", button(seat.cancelLabel, seat.cancelEnabled && !locked));
                JsonArray sel = new JsonArray();
                seat.selectable.forEach(sel::add);
                input.add("selectable", sel);
                JsonArray act = new JsonArray();
                seat.actionable.forEach(act::add);
                input.add("actionable", act);
                CardView promptCard = seat.promptCard;
                if (promptCard != null) input.add("card", StateJson.card(promptCard));
                state.add("input", input);
                Question q = seat.question;
                if (q != null) state.add("question", q.json());
            }
        } catch (RuntimeException e) {
            return null;
        }
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
        JsonArray ps = new JsonArray();
        for (Seat s : seats) {
            if (s.deck == null) continue;
            JsonObject p = new JsonObject();
            p.addProperty("name", s.name);
            p.addProperty("connected", s.channel != null);
            p.addProperty("rematch", s.rematch);
            ps.add(p);
        }
        r.add("players", ps);
        return r;
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
        final String token = UUID.randomUUID().toString();
        volatile Channel channel;
        volatile String name;
        volatile Deck deck;
        volatile boolean rematch;

        private volatile WebGuiGame gui;
        private volatile PlayerView me;
        private volatile Question question;

        // Estado do "input" atual do Forge (prompt, botões e cartas selecionáveis).
        private volatile String message = "";
        /** Carta citada pelo prompt (ex.: a do topo na vidência de 1); pode estar numa zona oculta. */
        private volatile CardView promptCard;
        private volatile String okLabel = "", cancelLabel = "";
        private volatile boolean okEnabled, cancelEnabled;
        private volatile Set<Integer> selectable = Set.of();
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
            this.channel = ch;
            this.name = name;
            this.deck = deck;
        }

        void send(String json) { BridgeServer.send(channel, json); }

        private void reset() {
            message = ""; promptCard = null; okLabel = cancelLabel = ""; okEnabled = cancelEnabled = false;
            selectable = Set.of(); actionable = Set.of(); rematch = false; question = null;
        }

        private boolean buttonsLocked() {
            return consumedGen == inputGen.get() && System.currentTimeMillis() - consumedAt < CONSUMED_TIMEOUT_MS;
        }

        private IGameController controller() {
            WebGuiGame g = gui;
            PlayerView p = me;
            return g == null || p == null ? null : g.getGameController(p);
        }

        private void onEdt(java.util.function.Consumer<IGameController> action) {
            IGameController c = controller();
            if (c != null) FThreads.invokeInEdtLater(() -> action.accept(c));
        }

        /** Recebe as chamadas do ProtocolGuiGame deste jogador. */
        private final class Remote implements IRemote {
            @Override
            public void send(NetEvent event) {
                if (!(event instanceof GuiGameEvent ev)) return;
                Object[] a = ev.getObjects();
                switch (ev.getMethod()) {
                    case openView -> {
                        @SuppressWarnings("unchecked") TrackableCollection<PlayerView> mine = (TrackableCollection<PlayerView>) a[0];
                        me = mine.iterator().next();
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
                    case clearSelectables -> selectable = Set.of();
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
                return ask(Seat.this, (GuiGameEvent) event);
            }
        }
    }
}
