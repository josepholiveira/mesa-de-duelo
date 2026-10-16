package mesadeduelo.bridge;

import java.security.SecureRandom;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.deck.Deck;
import io.netty.channel.Channel;

/**
 * Distribui as conexões entre as partidas. Cada conexão está em no máximo uma {@link Session}:
 * uma partida contra a IA ({type:"start"}) ou uma sala em rede com código de 4 letras.
 *
 * Salas: {type:"host", name, deck} cria; {type:"join", code, name, deck} entra e a partida começa;
 * {type:"rematch"} pede revanche (contra a IA começa na hora, em rede quando os dois pedirem);
 * {type:"leave"} concede e sai.
 *
 * Volta à partida: todo estado traz session:{code, token}. Se a conexão cair, a partida fica guardada e
 * {type:"rejoin", code, token} devolve o jogador ao seu assento, inclusive depois de recarregar a página.
 * Uma partida sem ninguém conectado é encerrada depois de {@link #GRACE_SECONDS}.
 */
final class Rooms implements BridgeServer.Listener {
    /** Sem letras e números fáceis de confundir (O/0, I/1). */
    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int MAX_NAME = 24;
    private static final long GRACE_SECONDS = Long.getLong("mesa.grace", 300);

    private final Map<Channel, Session> byChannel = new ConcurrentHashMap<>();
    /** Todas as partidas vivas, salas e partidas contra a IA, pelo código de volta. */
    private final Map<String, Session> byCode = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final ScheduledExecutorService publisher = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "BridgePublisher");
        t.setDaemon(true);
        return t;
    });

    Rooms() {
        publisher.scheduleWithFixedDelay(this::tick, 50, 50, TimeUnit.MILLISECONDS);
    }

    private void tick() {
        for (Session s : byCode.values()) {
            try { s.tick(); } catch (RuntimeException e) { e.printStackTrace(); }
        }
    }

    @Override public void onConnect(Channel ch) {
        JsonObject hello = new JsonObject();
        hello.addProperty("type", "hello");
        JsonArray formats = new JsonArray(); formats.add("free"); formats.add("pauper");
        hello.add("supportedFormats", formats);
        MatchConfig.versions(hello);
        BridgeServer.send(ch, hello.toString());
    }

    @Override
    public synchronized void onDisconnect(Channel ch) {
        Session s = byChannel.remove(ch);
        if (s == null) return;
        Session.Seat seat = s.seatOf(ch);
        if (seat == null) return;
        seat.channel = null;
        System.out.printf("%s: %s desconectou%n", label(s), seat.name);
        if (!s.isRoom() || !s.started()) {
            // Uma sala ainda sem oponente não tem o que guardar.
            if (s.isRoom()) close(s); else expireIfAbandoned(s);
            return;
        }
        notifyOthers(s, seat, seat.name + " desconectou. Aguardando a reconexão…");
        expireIfAbandoned(s);
        s.markDirty();
    }

    /** Agenda o fim da partida se ninguém voltar a tempo. */
    private void expireIfAbandoned(Session s) {
        if (s.anyoneConnected()) return;
        publisher.schedule(() -> {
            synchronized (this) {
                if (byCode.get(s.code) == s && !s.anyoneConnected()) {
                    System.out.printf("%s: ninguém voltou em %d s%n", label(s), GRACE_SECONDS);
                    close(s);
                }
            }
        }, GRACE_SECONDS, TimeUnit.SECONDS);
    }

    @Override
    public void onMessage(Channel ch, String text) {
        JsonObject msg;
        try { msg = JsonParser.parseString(text).getAsJsonObject(); }
        catch (RuntimeException e) { BridgeServer.send(ch, Session.toast("error", "Mensagem inválida.")); return; }
        String requestId = msg.has("requestId") && msg.get("requestId").isJsonPrimitive() ? msg.get("requestId").getAsString() : null;
        try {
            String type = MatchConfig.string(msg, "type");
            switch (type) {
                case "validate-deck" -> {
                    var result = DeckValidation.validate(msg.get("deck"), MatchConfig.string(msg, "format"));
                    JsonObject response = new JsonObject(); response.addProperty("type", "validation");
                    response.addProperty("requestId", requestId); response.add("validation", result.json());
                    BridgeServer.send(ch, response.toString());
                }
                case "lookup-room" -> lookup(ch, code(msg), requestId);
                case "hello" -> onConnect(ch);
                case "start" -> {
                    MatchConfig config = MatchConfig.parse(msg.get("config"));
                    Deck you = validated(msg.get("you"), config.format(), "you");
                    JsonElement opponent = msg.get("opponent");
                    Deck ai = opponent == null || opponent.isJsonNull()
                        || (opponent.isJsonPrimitive() && "random".equals(opponent.getAsString()))
                        ? Decks.random(config.format()) : validated(opponent, config.format(), "opponent");
                    solo(ch, you, ai, config);
                }
                case "host" -> {
                    MatchConfig config = MatchConfig.parse(msg.get("config"));
                    host(ch, name(msg), validated(msg.get("deck"), config.format(), "deck"), config);
                }
                case "join" -> join(ch, code(msg), name(msg), msg.get("deck"));
                case "rejoin" -> rejoin(ch, code(msg), msg.has("token") ? MatchConfig.string(msg, "token") : "");
                case "rematch" -> rematch(ch);
                case "leave" -> leave(ch);
                default -> {
                    Session s = byChannel.get(ch);
                    Session.Seat seat = s == null ? null : s.seatOf(ch);
                    if (seat != null) s.onClientMessage(seat, type, msg);
                }
            }
        } catch (InvalidDeck e) {
            JsonObject response = new JsonObject(); response.addProperty("type", "validation-error");
            response.addProperty("target", e.target); response.add("validation", e.result.json());
            if (requestId != null) response.addProperty("requestId", requestId);
            BridgeServer.send(ch, response.toString());
        } catch (RuntimeException e) {
            JsonObject response = new JsonObject();
            response.addProperty("type", requestId == null ? "error" : "request-error");
            response.addProperty("text", e.getMessage() == null ? "Não foi possível concluir esta ação." : e.getMessage());
            if (requestId != null) response.addProperty("requestId", requestId);
            BridgeServer.send(ch, response.toString());
        }
    }

    private static final class InvalidDeck extends IllegalArgumentException {
        final DeckValidation.Result result;
        final String target;
        InvalidDeck(DeckValidation.Result result, String target) { this.result = result; this.target = target; }
    }

    private static Deck validated(JsonElement payload, String format, String target) {
        var result = "opponent".equals(target) ? DeckValidation.validateForAi(payload, format) : DeckValidation.validate(payload, format);
        if (!result.valid()) throw new InvalidDeck(result, target);
        return result.deck();
    }

    private synchronized void lookup(Channel ch, String code, String requestId) {
        Session s = byCode.get(code);
        if (s == null || !s.isRoom()) throw new IllegalArgumentException("Não existe sala com o código " + code + ".");
        JsonObject response = new JsonObject(); response.addProperty("type", "room-info");
        response.addProperty("requestId", requestId); response.add("room", s.publicRoomJson());
        BridgeServer.send(ch, response.toString());
    }

    private static String name(JsonObject msg) {
        JsonElement e = msg.get("name");
        String n = e == null || e.isJsonNull() ? "" : e.getAsString().strip();
        if (n.isEmpty()) n = "Jogador";
        return n.length() > MAX_NAME ? n.substring(0, MAX_NAME) : n;
    }

    private static String code(JsonObject msg) {
        JsonElement e = msg.get("code");
        return e == null || e.isJsonNull() ? "" : e.getAsString().strip().toUpperCase();
    }

    private static String label(Session s) {
        return (s.isRoom() ? "Sala " : "Partida contra a IA ") + s.code;
    }

    /** Código livre; as partidas contra a IA usam 8 caracteres para nunca colidir com os de sala. */
    private String newCode(int length) {
        String code;
        do {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < length; i++) sb.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
            code = sb.toString();
        } while (byCode.containsKey(code));
        return code;
    }

    // ---------- Partidas ----------

    private synchronized void solo(Channel ch, Deck you, Deck opponent, MatchConfig config) {
        leave(ch);
        Session s = Session.solo(newCode(8), ch, you, opponent, config);
        byCode.put(s.code, s);
        byChannel.put(ch, s);
        s.start();
    }

    private synchronized void host(Channel ch, String name, Deck deck, MatchConfig config) {
        leave(ch);
        Session s = Session.room(newCode(4), ch, name, deck, config);
        byCode.put(s.code, s);
        byChannel.put(ch, s);
        s.sendRoom(s.seats[0]);
        System.out.printf("Sala %s criada por %s (%s)%n", s.code, name, deck.getName());
    }

    private synchronized void join(Channel ch, String code, String name, JsonElement payload) {
        Session s = byCode.get(code);
        if (s == null || !s.isRoom()) throw new IllegalArgumentException("Não existe sala com o código " + code + ".");
        if (s.seatOf(ch) != null) return;
        if (s.full()) throw new IllegalArgumentException("A sala " + code + " já está cheia.");
        Deck deck = validated(payload, s.config.format(), "deck");
        leave(ch);
        Session.Seat seat = s.seats[1];
        seat.bind(ch, name, deck);
        byChannel.put(ch, s);
        System.out.printf("Sala %s: %s entrou (%s)%n", code, name, deck.getName());
        for (Session.Seat each : s.seats) s.sendRoom(each);
        s.start();
    }

    private synchronized void rejoin(Channel ch, String code, String token) {
        Session s = byCode.get(code);
        Session.Seat seat = null;
        if (s != null) for (Session.Seat each : s.seats) if (each.token.equals(token)) seat = each;
        if (seat == null) {
            // Resposta própria para o navegador esquecer a partida guardada em vez de tentar de novo.
            BridgeServer.send(ch, Session.toast("gone", "A partida " + code + " não existe mais."));
            return;
        }
        if (seat.channel != null && seat.channel != ch) {
            // A conexão antiga pode ter caído sem a ponte perceber (Wi-Fi que some, notebook que dorme).
            // Ou a partida foi aberta em outra aba: a antiga é avisada para não tentar voltar sozinha.
            Channel old = seat.channel;
            byChannel.remove(old);
            BridgeServer.send(old, Session.toast("replaced", "A partida foi aberta em outra janela."));
            old.close();
        }
        if (byChannel.get(ch) != s) leave(ch);
        seat.channel = ch;
        byChannel.put(ch, s);
        System.out.printf("%s: %s voltou%n", label(s), seat.name);
        if (s.isRoom()) {
            s.sendRoom(seat);
            notifyOthers(s, seat, seat.name + " voltou.");
        }
        s.markDirty();
    }

    private synchronized void rematch(Channel ch) {
        Session s = byChannel.get(ch);
        Session.Seat seat = s == null ? null : s.seatOf(ch);
        if (seat == null) return;
        if (!s.matchOver()) throw new IllegalArgumentException("Conclua a partida antes de pedir uma revanche.");
        if (!s.isRoom()) { s.start(); return; }
        if (!s.full()) return;
        for (Session.Seat each : s.seats) {
            if (each.channel == null) throw new IllegalArgumentException(each.name + " não está conectado.");
        }
        seat.rematch = true;
        boolean all = true;
        for (Session.Seat each : s.seats) all &= each.rematch;
        if (all) s.start();
        else notifyOthers(s, seat, seat.name + " quer jogar de novo.");
        s.markDirty();
    }

    /** Sai da partida atual e encerra a série; a sala fecha quando não sobra ninguém. */
    private synchronized void leave(Channel ch) {
        Session s = byChannel.remove(ch);
        if (s == null) return;
        Session.Seat seat = s.seatOf(ch);
        if (!s.isRoom()) { close(s); return; }
        if (seat != null) {
            s.abandon(seat);
            seat.channel = null;
            seat.rematch = false;
        }
        if (!s.started() || !s.anyoneConnected()) { close(s); return; }
        notifyOthers(s, seat, (seat == null ? "O oponente" : seat.name) + " saiu da sala.");
        s.markDirty();
    }

    private void close(Session s) {
        s.stop();
        byCode.remove(s.code, s);
        for (Session.Seat seat : s.seats) {
            if (seat.channel != null) {
                byChannel.remove(seat.channel, s);
                if (s.isRoom()) seat.send(Session.toast("error", "A sala " + s.code + " foi fechada."));
                seat.channel = null;
            }
        }
        if (s.isRoom()) System.out.printf("Sala %s fechada%n", s.code);
    }

    private static void notifyOthers(Session s, Session.Seat from, String text) {
        for (Session.Seat each : s.seats) if (each != from) each.send(Session.toast("toast", text));
    }
}
