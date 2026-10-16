package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class AbilityOptionsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }
    @Test public void realFireblastAlternativeShowsSacrificeInsteadOfIdenticalEffectText() {
        var game = ExilePermissionsTest.game(); var me = game.getPlayers().get(0);
        var card = ExilePermissionsTest.add(game, "Fireblast", me, ZoneType.Hand);
        ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities();
        var costs = card.getAllPossibleAbilities(me, false).stream().map(AbilityOptions::cost).toList();
        assertTrue(costs.toString(), costs.contains("{4}{R}{R}"));
        assertTrue(costs.toString(), costs.contains("sacrificar 2 Montanhas"));
        assertEquals(2, costs.stream().distinct().count());
    }
}
