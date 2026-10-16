package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.keyword.Keyword;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.PlayerCollection;
import forge.game.player.RegisteredPlayer;
import forge.game.staticability.StaticAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class ExilePermissionsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    static Game game() {
        var a = new RegisteredPlayer(new Deck("A")).setPlayer(new LobbyPlayerAi("A", null));
        var b = new RegisteredPlayer(new Deck("B")).setPlayer(new LobbyPlayerAi("B", null));
        Game game = new Match(new MatchConfig("free", "bo1").rules(), List.of(a,b), "Exile permissions").createGame();
        game.setNoGUIUser();
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        return game;
    }

    static Card add(Game game, String name, Player owner, ZoneType zone) {
        Card card = Card.fromPaperCard(DeckValidation.resolve(name), owner);
        owner.getZone(zone).add(card); card.setZone(owner.getZone(zone));
        return card;
    }

    @Test public void impulsePermissionIsVisibleWithoutManaAndDuringOpponentsTurn() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        add(game, "Mountain", me, ZoneType.Library);
        add(game, "Rift Bolt", me, ZoneType.Library);
        Card impulse = add(game, "Reckless Impulse", me, ZoneType.Hand);
        var ability = impulse.getFirstSpellAbility(); ability.setActivatingPlayer(me);
        game.getStack().add(ability); game.getStack().resolveStack();
        assertEquals(2, me.getCardsIn(ZoneType.Exile).size());
        for (Card card : me.getCardsIn(ZoneType.Exile)) assertFalse(card.mayPlay(me).isEmpty());
        var snapshot = StateJson.game(game.getView(), me.getId(), game);
        assertTrue("permission shelf must be distinct from current priority/castable", snapshot.has("playableExile"));
        assertEquals(2, snapshot.getAsJsonArray("playableExile").size());
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, other);
        assertEquals(2, StateJson.game(game.getView(), me.getId(), game).getAsJsonArray("playableExile").size());
        // The actual effect registers expiration at cleanup after the controller's NEXT turn.
        game.getEndOfTurn().executeUntilEndOfPhase(me);
        game.getEndOfTurn().registerUntilEndCommand(me);
        game.getEndOfTurn().executeUntilEndOfPhase(other);
        game.getAction().checkStaticAbilities();
        assertEquals(2, StateJson.playableExile(game, me.getId()).size());
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        assertEquals(2, StateJson.playableExile(game, me.getId()).size());
        game.getEndOfTurn().executeUntilEndOfPhase(me);
        game.getAction().checkStaticAbilities();
        assertEquals(0, StateJson.playableExile(game, me.getId()).size());
        assertEquals(2, me.getCardsIn(ZoneType.Exile).size());
    }

    @Test public void permissionBelongsToViewerNotOwnerAndNeverRevealsFaceDownIdentity() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card card = add(game, "Mountain", other, ZoneType.Exile);
        StaticAbility permission = new StaticAbility("Mode$ Continuous | MayPlay$ True", card, card.getCurrentState());
        card.setMayPlay(new PlayerCollection(me), false, null, false, true, permission);
        assertEquals(card.getId(), StateJson.playableExile(game, me.getId()).get(0).getAsInt());
        assertEquals(0, StateJson.playableExile(game, other.getId()).size());
        card.turnFaceDown(true);
        assertFalse(StateJson.card(card.getView(), game).has("name"));
        assertFalse(StateJson.card(card.getView(), game).has("text"));
        card.removeMayPlay(permission);
        card.setMayPlay(new PlayerCollection(me), false, null, true, false, permission);
        assertEquals("flash alone does not grant an exile play permission", 0, StateJson.playableExile(game, me.getId()).size());
    }

    @Test public void suspendedShelfRetainsZeroCountersOnlyForPendingRealTrigger() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card rift = add(game, "Rift Bolt", me, ZoneType.Exile);
        rift.addCounterInternal(CounterEnumType.TIME, 1, me, false, null, null);
        assertEquals(1, StateJson.suspendedExile(game, me.getId()).size());
        assertEquals(0, StateJson.suspendedExile(game, other.getId()).size());
        assertEquals(0, StateJson.playableExile(game, me.getId()).size());
        rift.setCounters(com.google.common.collect.HashMultiset.create());
        assertEquals(0, StateJson.suspendedExile(game, me.getId()).size());
        var trigger = rift.getTriggers().stream().filter(t -> t.isKeyword(Keyword.SUSPEND)
            && t.getOverridingAbility().getApi() == forge.game.ability.ApiType.Play).findFirst().orElseThrow();
        var ability = trigger.getOverridingAbility(); ability.setActivatingPlayer(me);
        game.getStack().add(ability);
        assertEquals(1, StateJson.suspendedExile(game, me.getId()).size());
        game.getStack().remove(game.getStack().getInstanceMatchingSpellAbilityID(ability));
        assertEquals("countered/removed trigger does not create future permission", 0, StateJson.suspendedExile(game, me.getId()).size());
        assertEquals(0, StateJson.playableExile(game, me.getId()).size());
    }
}
