package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.concurrent.CountDownLatch;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.player.Player;
import org.junit.BeforeClass;
import org.junit.Test;

/** Lifecycle requests must never mutate the live player collection on the caller's thread. */
public class MatchLifecycleTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    @Test(timeout = 10000) public void stopDuringPreparationPreservesIndexedPlayersAndReleasesFutureInputs() throws Exception {
        Game game = CommanderEngineTest.game(4);
        game.setAge(GameStage.BeforeMulligan);
        MatchLifecycle lifecycle = new MatchLifecycle();
        var players = game.getPlayers();
        var iterator = players.iterator();
        assertNotNull(iterator.next());
        lifecycle.requestStop();
        assertFalse(game.isGameOver());
        assertEquals(4, players.size());
        lifecycle.pump(game);
        assertTrue(lifecycle.cancelled());
        assertTrue(game.isGameOver());
        assertEquals(4, players.size());
        assertEquals(4, game.getRegisteredPlayers().size());
        // Match.prepareAllZones retains this live collection and indexes every registered seat.
        for (int i = 0; i < 4; i++) assertNotNull(players.get(i));
        int remaining = 0;
        while (iterator.hasNext()) { iterator.next(); remaining++; }
        assertEquals(3, remaining);
        lifecycle.awaitInput(game, players.get(0).getId(), new CountDownLatch(1));
        lifecycle.pump(game); // Repeated close must be harmless.
        assertEquals(4, players.size());
    }

    @Test(timeout = 10000) public void pregameDepartureDefersRemovalUntilPlayAndPreservesOtherPlayers() throws Exception {
        Game game = CommanderEngineTest.game(4);
        game.setAge(GameStage.BeforeMulligan);
        Player departed = game.getPlayers().get(1);
        MatchLifecycle lifecycle = new MatchLifecycle();
        var iterator = game.getPlayers().iterator();
        iterator.next();
        lifecycle.requestConcede(game, departed.getId());
        assertFalse(departed.conceded());
        lifecycle.pump(game);
        assertTrue(departed.conceded());
        assertTrue(lifecycle.isConceding(game, departed.getId()));
        assertFalse(game.isGameOver());
        assertEquals(4, game.getPlayers().size());
        while (iterator.hasNext()) iterator.next();
        lifecycle.awaitInput(game, departed.getId(), new CountDownLatch(1));
        game.setAge(GameStage.Mulligan);
        lifecycle.pump(game);
        assertEquals(4, game.getPlayers().size());
        game.setAge(GameStage.Play);
        lifecycle.pump(game);
        assertEquals(3, game.getPlayers().size());
        assertTrue(departed.hasLost());
        assertFalse(game.isGameOver());
        for (Player survivor : game.getPlayers()) assertFalse(survivor.hasLost());
    }

    @Test public void simultaneousRoomLeavesAreProcessedTogetherWithoutRemovingPlayersOnStop() {
        Game game = CommanderEngineTest.game(4);
        game.setAge(GameStage.Play);
        MatchLifecycle lifecycle = new MatchLifecycle();
        var iterator = game.getPlayers().iterator();
        iterator.next();
        for (Player player : game.getRegisteredPlayers()) lifecycle.requestConcede(game, player.getId());
        lifecycle.requestStop();
        assertEquals(4, game.getPlayers().size());
        lifecycle.pump(game);
        assertTrue(game.isGameOver());
        assertEquals(4, game.getPlayers().size());
        while (iterator.hasNext()) iterator.next();
        lifecycle.pump(game);
    }

    @Test public void twoDeparturesDuringPlayLeaveRemainingMatchAlive() {
        Game game = CommanderEngineTest.game(4);
        game.setAge(GameStage.Play);
        Player first = game.getPlayers().get(1), second = game.getPlayers().get(3);
        MatchLifecycle lifecycle = new MatchLifecycle();
        lifecycle.requestConcede(game, first.getId());
        lifecycle.requestConcede(game, second.getId());
        assertEquals(4, game.getPlayers().size());
        lifecycle.pump(game);
        assertTrue(first.hasLost());
        assertTrue(second.hasLost());
        assertEquals(2, game.getPlayers().size());
        assertFalse(game.isGameOver());
        assertEquals(4, game.getRegisteredPlayers().size());
    }
}
