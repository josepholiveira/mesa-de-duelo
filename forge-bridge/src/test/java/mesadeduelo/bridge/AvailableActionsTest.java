package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import java.util.Set;
import java.util.stream.StreamSupport;
import forge.ai.AvailableActions;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Real card scripts and mana sources: dependent targets must retain a legal priority window. */
public class AvailableActionsTest {
    private static final long BUDGET_MS = 5000;

    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static final class Fixture {
        final Game game;
        final Player caster, opponent;
        final Card blaze;
        final SpellAbility spell;

        Fixture(int mountains) {
            var a = new RegisteredPlayer(new Deck("Caster")).setPlayer(new LobbyPlayerAi("A", null));
            var b = new RegisteredPlayer(new Deck("Opponent")).setPlayer(new LobbyPlayerAi("B", null));
            game = new Match(new MatchConfig("free", "bo1").rules(), List.of(a, b), "Searing Blaze availability").createGame();
            game.setNoGUIUser();
            caster = game.getPlayers().get(0);
            opponent = game.getPlayers().get(1);
            game.getPhaseHandler().devModeSet(PhaseType.MAIN1, caster);
            blaze = add("Searing Blaze", caster, ZoneType.Hand);
            spell = blaze.getFirstSpellAbility();
            spell.setActivatingPlayer(caster);
            for (int i = 0; i < mountains; i++) add("Mountain", caster, ZoneType.Battlefield);
        }

        Card add(String name, Player owner, ZoneType zone) {
            Card card = Card.fromPaperCard(DeckValidation.resolve(name), owner);
            owner.getZone(zone).add(card);
            card.setZone(owner.getZone(zone));
            return card;
        }

        void assertAvailable(boolean expected) {
            // Blaze is the only non-mana action. compute drives empty-priority auto-pass;
            // collectActionable drives the hand highlight and drag eligibility.
            assertEquals("automatic priority decision", expected, AvailableActions.compute(caster, BUDGET_MS));
            Set<CardView> highlighted = AvailableActions.collectActionable(caster, BUDGET_MS);
            assertEquals("hand availability", expected, highlighted.contains(blaze.getView()));
            assertEquals("fixture has no other non-mana action", expected ? 1 : 0, highlighted.size());
            assertTrue("availability must not tap mana sources", caster.getCardsIn(ZoneType.Battlefield).stream()
                .filter(Card::isLand).noneMatch(Card::isTapped));
        }
    }

    @Test public void bridgeOverridePrecedesPinnedForgeDependency() {
        assertEquals(MatchConfig.class.getProtectionDomain().getCodeSource().getLocation(),
            AvailableActions.class.getProtectionDomain().getCodeSource().getLocation());
    }

    @Test public void opposingCreatureMakesBlazeAvailableWithTwoRedSources() {
        Fixture f = new Fixture(2);
        f.add("Grizzly Bears", f.opponent, ZoneType.Battlefield);
        // The first player candidate owns no creature: the search must try the other player.
        f.assertAvailable(true);
        assertTrue(f.spell.getTargets().isEmpty());
        assertTrue(f.spell.getSubAbility().getTargets().isEmpty());
    }

    @Test public void ownCreaturePermitsLegalSelfTargeting() {
        Fixture f = new Fixture(3);
        f.add("Kiln Fiend", f.caster, ZoneType.Battlefield);
        f.assertAvailable(true);
    }

    @Test public void noCreatureAnywhereLeavesNoLegalNonManaAction() {
        new Fixture(3).assertAvailable(false);
    }

    @Test public void opposingHexproofCreatureIsNotAValidSecondTarget() {
        Fixture f = new Fixture(3);
        f.add("Slippery Bogle", f.opponent, ZoneType.Battlefield);
        f.assertAvailable(false);
    }

    @Test public void protectionFromRedIsRespectedForEitherController() {
        Fixture opponent = new Fixture(3);
        opponent.add("Auriok Champion", opponent.opponent, ZoneType.Battlefield);
        opponent.assertAvailable(false);
        Fixture self = new Fixture(3);
        self.add("Auriok Champion", self.caster, ZoneType.Battlefield);
        self.assertAvailable(false);
    }

    @Test public void legalTargetsDoNotBypassTheDoubleRedCost() {
        Fixture f = new Fixture(1);
        f.add("Grizzly Bears", f.opponent, ZoneType.Battlefield);
        f.assertAvailable(false);
    }

    @Test public void predictiveScanPreservesExistingParentAndChildTargets() {
        Fixture f = new Fixture(3);
        Card bear = f.add("Grizzly Bears", f.opponent, ZoneType.Battlefield);
        SpellAbility child = f.spell.getSubAbility();
        f.spell.getTargets().add(f.opponent);
        child.getTargets().add(bear);
        var parentTargets = f.spell.getTargets();
        var childTargets = child.getTargets();
        var parentRestrictions = f.spell.getTargetRestrictions();
        var childRestrictions = child.getTargetRestrictions();
        String[] validParent = parentRestrictions.getValidTgts().clone();
        String[] validChild = childRestrictions.getValidTgts().clone();
        f.assertAvailable(true);
        assertSame(parentTargets, f.spell.getTargets());
        assertSame(childTargets, child.getTargets());
        assertEquals(List.of(f.opponent), StreamSupport.stream(f.spell.getTargets().getTargetPlayers().spliterator(), false).toList());
        assertEquals(List.of(bear), StreamSupport.stream(child.getTargets().getTargetCards().spliterator(), false).toList());
        assertSame(parentRestrictions, f.spell.getTargetRestrictions());
        assertSame(childRestrictions, child.getTargetRestrictions());
        assertArrayEquals(validParent, parentRestrictions.getValidTgts());
        assertArrayEquals(validChild, childRestrictions.getValidTgts());
    }
}
