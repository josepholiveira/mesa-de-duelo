package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import forge.deck.Deck;
import forge.gamemodes.net.IRemote;
import forge.gamemodes.net.event.IdentifiableNetEvent;
import forge.gamemodes.net.event.NetEvent;
import forge.gui.FThreads;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.BeforeClass;
import org.junit.Test;

public class StaleAttackActionTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static JsonObject command(String type, int generation) {
        JsonObject command = JsonParser.parseString("{\"attackers\":[1],\"defender\":1,\"defenderKind\":\"player\"}").getAsJsonObject();
        command.addProperty("type", type); command.addProperty("gen", generation); return command;
    }

    private static void error(EmbeddedChannel channel, String action) {
        TextWebSocketFrame frame = channel.readOutbound(); assertNotNull("Explicit rejection releases the client queue", frame);
        try {
            JsonObject json = JsonParser.parseString(frame.text()).getAsJsonObject();
            assertEquals("error", json.get("type").getAsString());
            assertEquals("stale-action", json.get("code").getAsString());
            assertEquals(action, json.get("action").getAsString());
        } finally { frame.release(); }
    }

    private static java.lang.reflect.Field field(String name) throws Exception {
        var field = Session.Seat.class.getDeclaredField(name); field.setAccessible(true); return field;
    }

    @Test public void staleAndMissingGenerationsReturnAnErrorOnlyForQueuedAttackCommands() {
        EmbeddedChannel channel = new EmbeddedChannel();
        try {
            Session session = Session.room("TEST", channel, "Test", new Deck("Test"), new MatchConfig("commander", "bo1", 4));
            for (String action : List.of("attack-group", "attack-all")) {
                session.onClientMessage(session.seats[0], channel, action, command(action, -1)); error(channel, action);
                JsonObject missing = command(action, 0); missing.remove("gen");
                session.onClientMessage(session.seats[0], channel, action, missing); error(channel, action);
                session.onClientMessage(session.seats[0], channel, action, command(action, 0)); error(channel, action);
            }
            session.onClientMessage(session.seats[0], channel, "ok", command("ok", -1));
            assertNull(channel.readOutbound());
        } finally { channel.finishAndReleaseAll(); }
    }

    @Test public void generationChangingAfterEnqueueStillReturnsExplicitRejection() throws Exception {
        for (String action : List.of("attack-group", "attack-all")) {
            EmbeddedChannel channel = new EmbeddedChannel();
            CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
            try {
                Session session = Session.room("TEST", channel, "Test", new Deck("Test"), new MatchConfig("commander", "bo1", 4));
                Session.Seat seat = session.seats[0];
                var game = CommanderEngineTest.game(4); var player = game.getPlayers().get(0);
                var human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Test"));
                WebGuiGame gui = new WebGuiGame(new IRemote() {
                    public void send(NetEvent event) { }
                    public Object sendAndWait(IdentifiableNetEvent event) { return null; }
                }, () -> true, new MatchLifecycle(), () -> game);
                gui.setGameController(player.getView(), human);
                field("gui").set(seat, gui); field("me").set(seat, player.getView());
                FThreads.invokeInEdtLater(() -> {
                    entered.countDown();
                    try { if (!release.await(3, TimeUnit.SECONDS)) throw new AssertionError("dispatch latch timeout"); }
                    catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
                });
                assertTrue(entered.await(3, TimeUnit.SECONDS));
                session.onClientMessage(seat, channel, action, command(action, 0));
                ((AtomicInteger) field("inputGen").get(seat)).incrementAndGet();
                release.countDown(); FThreads.invokeInEdtAndWait(() -> { });
                error(channel, action); assertNull(channel.readOutbound());
            } finally { release.countDown(); channel.finishAndReleaseAll(); }
        }
    }
}
