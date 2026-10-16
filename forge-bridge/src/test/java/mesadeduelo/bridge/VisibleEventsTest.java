package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import com.google.gson.JsonObject;
import forge.ai.LobbyPlayerAi;
import forge.game.Game;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.event.GameEventSpellResolved;
import forge.game.event.GameEventSpellRemovedFromStack;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class VisibleEventsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }
    private static Game game() {
        var a = new RegisteredPlayer(Decks.build("pauper-brasa")).setPlayer(new LobbyPlayerAi("A", null));
        var b = new RegisteredPlayer(Decks.build("pauper-floresta")).setPlayer(new LobbyPlayerAi("B", null));
        Game game = new Match(new MatchConfig("pauper","bo1").rules(), List.of(a,b), "Events test").createGame();
        game.setNoGUIUser(); game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        return game;
    }
    private static SpellAbility spell(Game game, Player player, String name) {
        Card c=Card.fromPaperCard(DeckValidation.resolve(name),player);
        player.getZone(ZoneType.Hand).add(c); c.setZone(player.getZone(ZoneType.Hand));
        SpellAbility ability=c.getFirstSpellAbility(); ability.setActivatingPlayer(player); return ability;
    }
    @Test public void actualNestedCounterStackPreservesBothCastsAndOutcomes() {
        Game game=game(); AtomicLong version=new AtomicLong(); VisibleEvents events=new VisibleEvents(version::incrementAndGet,version::get); events.attach(game);
        Player a=game.getPlayers().get(0),b=game.getPlayers().get(1);
        SpellAbility bolt=spell(game,a,"Lightning Bolt"); bolt.getTargets().add(b); game.getStack().add(bolt);
        SpellAbility counter=spell(game,b,"Counterspell"); counter.getTargets().add(bolt); game.getStack().add(counter);
        game.getStack().resolveStack();
        var list=events.json(0).asList().stream().map(e->e.getAsJsonObject()).toList();
        assertEquals(2,list.stream().filter(e->"spell-cast".equals(e.get("type").getAsString())).count());
        JsonObject countered=list.stream().filter(e->"countered".equals(e.get("type").getAsString())).findFirst().orElseThrow();
        JsonObject resolved=list.stream().filter(e->"resolved".equals(e.get("type").getAsString())).findFirst().orElseThrow();
        assertEquals("Lightning Bolt",countered.getAsJsonObject("card").get("name").getAsString());
        assertEquals("Counterspell",resolved.getAsJsonObject("card").get("name").getAsString());
        assertTrue(countered.get("seq").getAsLong()<resolved.get("seq").getAsLong());
        assertEquals(0,resolved.getAsJsonObject("frame").getAsJsonArray("stack").size());
        assertEquals(20,b.getLife()); assertTrue(game.getStack().isEmpty());
    }
    @Test public void unknownRemovalDoesNotSwallowLaterResolution() {
        Game game=game(); VisibleEvents events=new VisibleEvents(()->{},()->1); events.attach(game);
        Player a=game.getPlayers().get(0),b=game.getPlayers().get(1);
        SpellAbility bolt=spell(game,a,"Lightning Bolt"); bolt.getTargets().add(b); game.getStack().add(bolt);
        events.receive(new GameEventSpellRemovedFromStack(bolt.getView()));
        events.receive(new GameEventSpellResolved(bolt,false));
        assertEquals(1,events.json(0).asList().stream().filter(e->"resolved".equals(e.getAsJsonObject().get("type").getAsString())).count());
    }
    @Test public void startersWorkForAiAndQuirionIsRejectedBeforeMatch() {
        for(String id:List.of("pauper-brasa","pauper-floresta")) {
            var result=DeckValidation.validateForAi(Decks.template(id),"pauper"); assertTrue(result.json().toString(),result.valid());
        }
        var template=Decks.template("pauper-floresta");
        template.getAsJsonArray("cards").get(1).getAsJsonObject().addProperty("name","Quirion Ranger");
        assertFalse(DeckValidation.validateForAi(template,"pauper").valid());
        assertTrue(DeckValidation.validate(template,"pauper").valid());
    }
}
