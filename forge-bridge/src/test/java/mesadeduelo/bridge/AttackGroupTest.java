package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.List;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputAttack;
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

public class AttackGroupTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static InputAttack input(Game game, Player player, Combat combat) {
        var human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Test"));
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class},
            (proxy, method, args) -> method.getReturnType() == boolean.class ? false : null));
        InputAttack input = new InputAttack(human, player, combat); input.showMessageInitial(); return input;
    }

    private static Card add(Game game, String name, Player player) {
        return ExilePermissionsTest.add(game, name, player, ZoneType.Battlefield);
    }

    @Test public void multipleGroupsReassignIdempotentlyAndLeaveOtherGroupsUntouched() {
        Game game = CommanderEngineTest.game(4); Player me = game.getPlayers().get(0);
        Player left = game.getPlayers().get(1), right = game.getPlayers().get(3);
        Card a = add(game, "Raging Goblin", me), b = add(game, "Raging Goblin", me);
        Card c = add(game, "Raging Goblin", me), d = add(game, "Raging Goblin", me);
        Card walker = add(game, "Jace Beleren", right);
        Combat combat = new Combat(me); game.getPhaseHandler().setCombat(combat);
        FThreads.invokeInEdtAndWait(() -> {
            InputAttack input = input(game, me, combat);
            assertTrue(InputContext.assignAttackGroup(input, List.of(a.getId(), b.getId()), left.getId(), "player"));
            assertTrue(InputContext.assignAttackGroup(input, List.of(c.getId(), d.getId()), right.getId(), "player"));
            assertEquals(4, combat.getAttackers().size());
            assertTrue(InputContext.assignAttackGroup(input, List.of(a.getId(), b.getId()), right.getId(), "player"));
            assertTrue(InputContext.assignAttackGroup(input, List.of(a.getId(), b.getId()), right.getId(), "player"));
            for (Card card : List.of(a, b, c, d)) assertTrue(combat.isAttacking(card, right));
            assertTrue(InputContext.assignAttackGroup(input, List.of(a.getId(), c.getId()), walker.getId(), "card"));
            assertTrue(combat.isAttacking(a, walker)); assertTrue(combat.isAttacking(c, walker));
            assertTrue(combat.isAttacking(b, right)); assertTrue(combat.isAttacking(d, right));
            assertTrue(InputContext.assignAttackGroup(input, List.of(a.getId(), b.getId()), null, null));
            assertFalse(combat.isAttacking(a)); assertFalse(combat.isAttacking(b));
            assertTrue(combat.isAttacking(c, walker)); assertTrue(combat.isAttacking(d, right));
            assertTrue(InputContext.assignAttackGroup(input, List.of(a.getId(), b.getId()), null, null));
            assertEquals(2, combat.getAttackers().size());
            input.selectButtonCancel(); assertTrue(combat.getAttackers().isEmpty());
        });
    }

    @Test public void invalidMemberRejectsWholeBatchWithoutMovingAnyExistingAttacker() {
        Game game = CommanderEngineTest.game(4); Player me = game.getPlayers().get(0);
        Player left = game.getPlayers().get(1), right = game.getPlayers().get(3);
        Card a = add(game, "Raging Goblin", me), b = add(game, "Raging Goblin", me);
        Card foreign = add(game, "Raging Goblin", right), tapped = add(game, "Raging Goblin", me); tapped.setTapped(true);
        Card sick = add(game, "Grizzly Bears", me); sick.setSickness(true);
        Card serpent = add(game, "Sea Serpent", me); serpent.setSickness(false);
        Card island = add(game, "Island", me); add(game, "Island", left);
        game.getAction().checkStaticAbilities();
        Combat combat = new Combat(me); game.getPhaseHandler().setCombat(combat);
        FThreads.invokeInEdtAndWait(() -> {
            InputAttack input = input(game, me, combat);
            assertTrue(InputContext.assignAttackGroup(input, List.of(a.getId(), b.getId()), left.getId(), "player"));
            for (int invalid : List.of(-1, foreign.getId(), tapped.getId(), sick.getId(), serpent.getId(), island.getId())) {
                assertFalse(InputContext.assignAttackGroup(input, List.of(a.getId(), invalid), right.getId(), "player"));
                assertTrue(combat.isAttacking(a, left)); assertTrue(combat.isAttacking(b, left));
                assertEquals(2, combat.getAttackers().size());
            }
            assertFalse(InputContext.assignAttackGroup(input, List.of(), right.getId(), "player"));
            assertFalse(InputContext.assignAttackGroup(input, List.of(a.getId(), a.getId()), right.getId(), "player"));
            assertFalse(InputContext.assignAttackGroup(input, List.of(a.getId()), right.getId(), "card"));
            assertFalse(InputContext.assignAttackGroup(input, List.of(a.getId()), me.getId(), "player"));
            assertTrue(combat.isAttacking(a, left));
            assertFalse(InputContext.assignAttackGroup(input, List.of(a.getId(), foreign.getId()), null, null));
            assertFalse(InputContext.assignAttackGroup(input, List.of(a.getId(), island.getId()), null, null));
            assertTrue(combat.isAttacking(a, left)); assertTrue(combat.isAttacking(b, left));
        });
    }

    @Test public void sameNumericPlayerAndCardIdsAndPriorBandSelectionStayExact() {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card walker = forge.game.card.CardFactory.getCard(DeckValidation.resolve("Jace Beleren"), other, other.getId(), game);
        other.getZone(ZoneType.Battlefield).add(walker); walker.setZone(other.getZone(ZoneType.Battlefield));
        for (int i = 0; i <= other.getId(); i++) game.nextCardId();
        Card bander = add(game, "Benalish Hero", me); bander.setSickness(false);
        Card first = add(game, "Raging Goblin", me), second = add(game, "Raging Goblin", me);
        Combat combat = new Combat(me); game.getPhaseHandler().setCombat(combat);
        FThreads.invokeInEdtAndWait(() -> {
            InputAttack input = input(game, me, combat);
            assertTrue(InputContext.assignAttackGroup(input, List.of(bander.getId()), other.getId(), "player"));
            assertTrue(input.selectCard(bander, null, null)); // Activate a real native band selection.
            assertTrue(InputContext.assignAttackGroup(input, List.of(first.getId(), second.getId()), walker.getId(), "card"));
            assertTrue(combat.isAttacking(bander, other));
            assertTrue(combat.isAttacking(first, walker)); assertTrue(combat.isAttacking(second, walker));
            assertTrue(InputContext.assignAttackGroup(input, List.of(first.getId(), second.getId()), other.getId(), "player"));
            for (Card card : List.of(bander, first, second)) assertTrue(combat.isAttacking(card, other));
        });
    }
}
