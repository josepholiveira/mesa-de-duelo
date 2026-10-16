package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.game.combat.Combat;
import forge.game.keyword.Keyword;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputBlock;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputSelectCardsFromList;
import forge.gamemodes.match.input.InputSelectEntitiesFromList;
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

public class InputContextTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }
    private static PlayerControllerHuman human(Game game, Player player) {
        PlayerControllerHuman human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Test"));
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class},
            (proxy, method, args) -> method.getReturnType() == boolean.class ? false : null));
        return human;
    }
    @Test public void exactPairOverridesSilentDefaultAndPublishesPendingAssignments() {
        Game game = ExilePermissionsTest.game(); Player attacking = game.getPlayers().get(0), defending = game.getPlayers().get(1);
        Card first = ExilePermissionsTest.add(game, "Raging Goblin", attacking, ZoneType.Battlefield);
        Card second = ExilePermissionsTest.add(game, "Raging Goblin", attacking, ZoneType.Battlefield);
        Card blocker = ExilePermissionsTest.add(game, "Grizzly Bears", defending, ZoneType.Battlefield);
        Combat combat = new Combat(attacking); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(first, defending); combat.addAttacker(second, defending);
        FThreads.invokeInEdtAndWait(() -> {
            InputBlock input = new InputBlock(human(game, defending), defending, combat);
            assertEquals(first.getId(), InputContext.blocking(input).get("selectedAttacker").getAsInt());
            assertTrue(InputContext.assignBlock(input, second.getId(), blocker.getId()));
            assertTrue(combat.isBlocking(blocker, second)); assertFalse(combat.isBlocking(blocker, first));
            var snapshot = StateJson.game(game.getView(), defending.getId(), game);
            var pair = snapshot.getAsJsonArray("combat").asList().stream().map(e -> e.getAsJsonObject())
                .filter(e -> e.get("attacker").getAsInt() == second.getId()).findFirst().orElseThrow();
            assertEquals(blocker.getId(), pair.getAsJsonArray("blockers").get(0).getAsInt());
            assertFalse("full-capacity blocker cannot silently switch targets", InputContext.assignBlock(input, first.getId(), blocker.getId()));
            assertTrue(InputContext.assignBlock(input, second.getId(), blocker.getId()));
            assertFalse(combat.isBlocking(blocker));
            assertTrue(InputContext.assignBlock(input, first.getId(), blocker.getId()));
        });
    }
    @Test public void illegalPairAndForeignCreatureDoNotSelectOrMutateCombat() {
        Game game = ExilePermissionsTest.game(); Player attacking = game.getPlayers().get(0), defending = game.getPlayers().get(1);
        Card flyer = ExilePermissionsTest.add(game, "Wind Drake", attacking, ZoneType.Battlefield);
        Card ground = ExilePermissionsTest.add(game, "Raging Goblin", attacking, ZoneType.Battlefield);
        Card blocker = ExilePermissionsTest.add(game, "Grizzly Bears", defending, ZoneType.Battlefield);
        Combat combat = new Combat(attacking); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(flyer, defending); combat.addAttacker(ground, defending);
        FThreads.invokeInEdtAndWait(() -> {
            InputBlock input = new InputBlock(human(game, defending), defending, combat);
            assertFalse(InputContext.assignBlock(input, flyer.getId(), blocker.getId()));
            assertFalse(InputContext.assignBlock(input, ground.getId(), flyer.getId()));
            assertFalse(InputContext.assignBlock(input, -1, blocker.getId()));
            assertTrue(combat.getAllBlockers().isEmpty());
            var row = InputContext.blocking(input).getAsJsonArray("legalAssignments").get(0).getAsJsonObject();
            assertEquals(1, row.getAsJsonArray("attackers").size());
            assertEquals(ground.getId(), row.getAsJsonArray("attackers").get(0).getAsInt());
        });
    }
    @Test public void onlyActualSuspendPlayConfirmationReceivesTypedContext() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card rift = ExilePermissionsTest.add(game, "Rift Bolt", me, ZoneType.Exile);
        var ability = rift.getTriggers().stream().filter(t -> t.isKeyword(Keyword.SUSPEND)
            && t.getOverridingAbility().getApi() == ApiType.Play).findFirst().orElseThrow().getOverridingAbility();
        var human = human(game, me);
        var input = new InputConfirm(human, "Any localized message", "Yes", "No", true, rift.getView(), ability);
        assertEquals(rift.getId(), InputContext.suspendCast(input).getAsJsonObject("card").get("id").getAsInt());
        assertNull(InputContext.suspendCast(new InputConfirm(human, "Same message", "Yes", "No", true, rift.getView(), rift.getFirstSpellAbility())));
    }
    @Test public void selectedCardsTrackExactCopiesDeselectAndCancelWithoutAssumingSacrifice() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card first = ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Hand);
        Card second = ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Hand);
        Card third = ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Hand);
        FThreads.invokeInEdtAndWait(() -> {
            var human = human(game, me);
            var input = new InputSelectCardsFromList(human, 2, 3, new CardCollection(java.util.List.of(first, second, third)));
            assertEquals(2, InputContext.selection(input).get("min").getAsInt());
            assertEquals(3, InputContext.selection(input).get("max").getAsInt());
            assertTrue(input.selectCard(first, null, null)); assertTrue(input.selectCard(second, null, null));
            assertEquals(2, InputContext.selection(input).getAsJsonArray("cards").size());
            assertTrue(input.selectCard(first, null, null));
            assertEquals(second.getId(), InputContext.selection(input).getAsJsonArray("cards").get(0).getAsInt());
            input.setCancelAllowed(true); input.selectButtonCancel();
            assertEquals(0, InputContext.selection(input).getAsJsonArray("cards").size());
            assertNull(InputContext.selection(new InputSelectEntitiesFromList<>(human, 1, 1, game.getPlayers())));
        });
    }
}
