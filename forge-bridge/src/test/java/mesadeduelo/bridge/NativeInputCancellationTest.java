package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import forge.game.GameStage;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

public class NativeInputCancellationTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    @Test(timeout = 10000) public void stopCancelsMandatoryTargetSelectionAndRemovesNativeInput() throws Exception {
        var game = CommanderEngineTest.game(4);
        game.setAge(GameStage.Play);
        var player = game.getPlayers().get(0);
        var human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Target chooser"));
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class},
            (proxy, method, args) -> method.getReturnType() == boolean.class ? false : null));
        player.dangerouslySetController(human);
        var bolt = ExilePermissionsTest.add(game, "Rift Bolt", player, ZoneType.Exile);
        var ability = bolt.getFirstSpellAbility();
        ability.setActivatingPlayer(player);
        AtomicReference<InputSelectTargets> selection = new AtomicReference<>();
        FThreads.invokeInEdtAndWait(() -> {
            var input = new InputSelectTargets(human, List.of(), ability, true, null, null, null, false);
            selection.set(input);
            human.getInputQueue().setInput(input);
        });
        assertSame(selection.get(), human.getInputQueue().getInput());
        assertFalse(selection.get().hasCancelled());
        MatchLifecycle lifecycle = new MatchLifecycle();
        lifecycle.requestStop();
        CountDownLatch waiting = new CountDownLatch(1);
        lifecycle.awaitInput(game, player.getId(), waiting);
        assertTrue(game.isGameOver());
        assertEquals(0, waiting.getCount());
        assertTrue("Mandatory targeting must cancel, not retry empty targets recursively", selection.get().hasCancelled());
        assertNull(human.getInputQueue().getInput());
    }
}
