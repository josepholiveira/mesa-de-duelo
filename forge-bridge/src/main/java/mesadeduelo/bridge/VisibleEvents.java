package mesadeduelo.bridge;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;
import com.google.common.eventbus.Subscribe;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.CardView;
import forge.game.event.*;
import forge.game.spellability.SpellAbilityView;
import forge.game.zone.ZoneType;

/** Capture immutable public events on the engine thread, before any snapshot coalescing. */
final class VisibleEvents {
    private static final int HISTORY_LIMIT = 512;
    private final ArrayDeque<JsonObject> history = new ArrayDeque<>();
    private final Map<Integer, JsonObject> spells = new HashMap<>();
    private final Map<Integer, String> origins = new HashMap<>();
    private final Runnable changed;
    private final LongSupplier version;
    private long sequence;
    private Game game;
    private boolean gameStarted;

    VisibleEvents(Runnable changed, LongSupplier version) { this.changed = changed; this.version = version; }

    synchronized void attach(Game next) {
        if (next == null || next == game) return;
        game = next; gameStarted = false; spells.clear(); origins.clear();
        next.subscribeToEvents(new Object() {
            @Subscribe public void receive(GameEvent event) {
                synchronized (VisibleEvents.this) { if (game == next) VisibleEvents.this.receive(event); }
            }
        });
    }

    synchronized void reset() { history.clear(); spells.clear(); origins.clear(); sequence = 0; game = null; gameStarted = false; }
    synchronized boolean gameStarted() { return gameStarted; }
    synchronized long cursor() { return sequence; }
    synchronized JsonArray json(long after) {
        JsonArray a = new JsonArray();
        history.stream().filter(e -> e.get("seq").getAsLong() > after).forEach(e -> a.add(e.deepCopy()));
        return a;
    }

    synchronized void append(JsonObject event) {
        changed.run();
        event.addProperty("seq", ++sequence);
        event.addProperty("stateVersion", version.getAsLong());
        history.addLast(event.deepCopy());
        while (history.size() > HISTORY_LIMIT) history.removeFirst();
    }

    @Subscribe public synchronized void receive(GameEvent event) {
        if (event instanceof GameEventGameStarted) { gameStarted = true; changed.run(); }
        JsonObject e = null;
        if (event instanceof GameEventLandPlayed x) {
            e = card("land-played", x.land()); actor(e, x.player().getId()); e.addProperty("to", "Battlefield");
        } else if (event instanceof GameEventSpellAbilityCast x) {
            e = card(x.sa().isSpell() ? "spell-cast" : "ability-activated", x.si().getSourceCard());
            e.addProperty("stackId", x.si().getId());
            e.addProperty("to", "Stack");
            if (x.si().getSourceCard() != null) e.addProperty("from", origins.get(x.si().getSourceCard().getId()));
            if (x.si().getActivatingPlayer() != null) actor(e, x.si().getActivatingPlayer().getId());
            e.addProperty("text", x.si().getText());
            e.add("targets", StateJson.stackTargets(x.si()));
            spells.put(x.sa().getId(), e.deepCopy());
            if (spells.size() > HISTORY_LIMIT) spells.keySet().removeIf(id -> id != x.sa().getId() && spells.size() > HISTORY_LIMIT);
        } else if (event instanceof GameEventSpellResolved x) {
            e = finish(x.spell(), x.hasFizzled() ? "countered" : "resolved");
        } else if (event instanceof GameEventSpellRemovedFromStack x && x.sa() != null) {
            String type = "stack-removed";
            if (game != null && !game.getStack().isEmpty() && game.getStack().peekAbility().getApi() == ApiType.Counter) type = "countered";
            e = finish(x.sa(), type);
        } else if (event instanceof GameEventCardChangeZone x && x.card() != null) {
            ZoneType from = x.from() == null ? null : x.from().zoneType(), to = x.to() == null ? null : x.to().zoneType();
            if (to == ZoneType.Stack && from != null) origins.put(x.card().getId(), from.name());
            if (from == ZoneType.Library && to == ZoneType.Hand) {
                e = type("draw"); if (x.card().getOwner() != null) actor(e, x.card().getOwner().getId());
            } else if (to == ZoneType.Battlefield || from == ZoneType.Battlefield) {
                e = card(to == ZoneType.Battlefield ? "entered" : "left", x.card());
                e.addProperty("from", from == null ? null : from.name()); e.addProperty("to", to == null ? null : to.name());
            }
        } else if (event instanceof GameEventAttackersDeclared x && !x.attackersMap().isEmpty()) {
            e = type("attackers"); actor(e, x.player().getId());
            JsonArray attackers = new JsonArray(); x.attackersMap().values().forEach(c -> attackers.add(c.getId()));
            e.add("cards", attackers); e.add("targets", StateJson.targets(x.attackersMap().keySet()));
        } else if (event instanceof GameEventBlockersDeclared x) {
            JsonArray blockers = new JsonArray(); x.blockers().values().forEach(m -> m.values().forEach(c -> blockers.add(c.getId())));
            if (!blockers.isEmpty()) { e = type("blockers"); actor(e, x.defendingPlayer().getId()); e.add("cards", blockers); }
        } else if (event instanceof GameEventPlayerDamaged x) {
            e = card("damage", x.source()); e.addProperty("delta", -x.amount()); e.add("targets", StateJson.targets(java.util.List.of(x.target())));
        } else if (event instanceof GameEventCardDamaged x) {
            e = card("damage", x.source()); e.addProperty("delta", -x.amount()); e.add("targets", StateJson.targets(java.util.List.of(x.card())));
        } else if (event instanceof GameEventPlayerLivesChanged x) {
            e = type("life-changed"); actor(e, x.player().getId()); e.addProperty("delta", x.newLives() - x.oldLives());
        } else if (event instanceof GameEventTurnBegan x) {
            e = type("turn"); actor(e, x.turnOwner().getId()); e.addProperty("turn", x.turnNumber());
        } else if (event instanceof GameEventPlayerPriority x && x.priority() != null) {
            e = type("priority"); actor(e, x.priority().getId());
        }
        if (e != null) {
            if (!java.util.Set.of("draw", "priority").contains(e.get("type").getAsString())) {
                JsonObject frame = publicFrame();
                if (frame != null) {
                    // Forge announces the outcome before removing the resolving stack item.
                    if (java.util.Set.of("resolved", "countered", "stack-removed").contains(e.get("type").getAsString()) && e.has("stackId")) {
                        int finished = e.get("stackId").getAsInt();
                        JsonArray stack = new JsonArray();
                        for (var item : frame.getAsJsonArray("stack")) if (item.getAsJsonObject().get("id").getAsInt() != finished) stack.add(item);
                        frame.add("stack", stack);
                    }
                    e.add("frame", frame);
                }
            }
            append(e);
        }
    }

    private JsonObject publicFrame() {
        if (game == null) return null;
        try {
            JsonObject state = StateJson.game(game.getView(), -2, game), frame = new JsonObject();
            for (String key : java.util.List.of("turn", "phase", "activePlayer", "stack", "combat")) frame.add(key, state.get(key));
            JsonArray players = new JsonArray();
            for (var entry : state.getAsJsonArray("players")) {
                JsonObject player = entry.getAsJsonObject(), visible = new JsonObject();
                for (String key : java.util.List.of("id", "life", "battlefield", "handCount", "library")) visible.add(key, player.get(key));
                players.add(visible);
            }
            frame.add("players", players); return frame;
        } catch (RuntimeException transientView) { return null; }
    }

    private JsonObject finish(SpellAbilityView ability, String kind) {
        if (ability == null) return null;
        // A non-counter removal can precede a later explicit resolution in some effects.
        // Retain its original metadata until the definitive outcome arrives.
        JsonObject cast = "stack-removed".equals(kind) ? spells.get(ability.getId()) : spells.remove(ability.getId());
        if (cast == null) return null;
        cast = cast.deepCopy();
        cast.addProperty("type", kind);
        cast.addProperty("from", "Stack"); cast.remove("to");
        CardView source = ability.getHostCard();
        if (source != null && source.getZone() != null && source.getZone() != ZoneType.Stack)
            cast.addProperty("to", source.getZone().name());
        return cast;
    }
    private static JsonObject type(String type) { JsonObject o = new JsonObject(); o.addProperty("type", type); return o; }
    private static void actor(JsonObject o, int id) { o.addProperty("actor", id); }
    private static JsonObject card(String type, CardView card) {
        JsonObject o = type(type);
        if (card != null) {
            o.add("card", StateJson.card(card)); o.addProperty("sourceId", card.getId());
            if (card.getController() != null) actor(o, card.getController().getId());
        }
        return o;
    }
}
