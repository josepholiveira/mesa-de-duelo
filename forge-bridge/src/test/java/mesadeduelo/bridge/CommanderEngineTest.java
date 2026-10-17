package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.game.Game;
import forge.game.GameEntityCounterTable;
import forge.game.GameType;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.cost.CostAdjustment;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputAttack;
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.BeforeClass;
import org.junit.Test;

public class CommanderEngineTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    static Game game(int count) {
        List<RegisteredPlayer> players = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            Deck deck = new Deck("Commander " + i);
            deck.getOrCreate(DeckSection.Commander).add(DeckValidation.resolve("Isamaru, Hound of Konda"), 1);
            deck.getMain().add(DeckValidation.resolve("Plains"), 99);
            players.add(RegisteredPlayer.forCommander(deck).setPlayer(new LobbyPlayerAi("Seat " + i, null)));
        }
        Game game = new Match(new MatchConfig("commander", "bo1", count).rules(), players, "Commander test").createGame();
        game.setNoGUIUser();
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        for (Player player : game.getPlayers()) player.setLife(40, null);
        return game;
    }

    static Card commander(Game game, Player player) {
        Card card = ExilePermissionsTest.add(game, "Isamaru, Hound of Konda", player, ZoneType.Command);
        player.addCommander(card); return card;
    }

    @Test public void variantsCountsAndLegacyConfigAreExplicit() {
        assertEquals(2, MatchConfig.parse(JsonParser.parseString("{\"format\":\"pauper\",\"matchLength\":\"bo3\"}")).playerCount());
        assertTrue(new MatchConfig("commander", "bo1", 4).rules().hasAppliedVariant(GameType.Commander));
        for (String config : List.of("{\"format\":\"commander\",\"matchLength\":\"bo3\",\"playerCount\":4}",
                "{\"format\":\"free\",\"matchLength\":\"bo1\",\"playerCount\":3}",
                "{\"format\":\"commander\",\"matchLength\":\"bo1\",\"playerCount\":2.5}",
                "{\"format\":\"commander\",\"matchLength\":\"bo1\",\"playerCount\":5}")) {
            try { MatchConfig.parse(JsonParser.parseString(config)); fail(config); } catch (IllegalArgumentException expected) { }
        }
        for (Player player : game(4).getPlayers()) assertEquals(40, player.getStartingLife());
    }

    @Test public void commandTaxUsesForgeCostsAndPersistsAcrossZones() {
        Game game = game(4); Player player = game.getPlayers().get(0);
        Card card = commander(game, player); var spell = card.getFirstSpellAbility(); spell.setActivatingPlayer(player);
        card.setCastFrom(player.getZone(ZoneType.Command));
        assertEquals(1, CostAdjustment.adjust(spell.getPayCosts(), spell, false).getTotalMana().getCMC());
        player.incCommanderCast(card); player.incCommanderCast(card);
        assertEquals(5, CostAdjustment.adjust(spell.getPayCosts(), spell, false).getTotalMana().getCMC());
        var row = StateJson.player(player.getView(), true, game);
        assertEquals(1, row.getAsJsonArray("commandZone").size());
        assertEquals(4, row.getAsJsonArray("commanders").get(0).getAsJsonObject().get("tax").getAsInt());
        // Casting from another zone does not pay commander tax; the cast count remains public.
        player.getZone(ZoneType.Command).remove(card); player.getZone(ZoneType.Hand).add(card); card.setZone(player.getZone(ZoneType.Hand));
        card.setCastFrom(player.getZone(ZoneType.Hand));
        assertEquals(1, CostAdjustment.adjust(spell.getPayCosts(), spell, false).getTotalMana().getCMC());
        assertEquals(2, StateJson.player(player.getView(), true, game).getAsJsonArray("commanders").get(0).getAsJsonObject().get("casts").getAsInt());
    }

    @Test public void forgeReturnsCommandersFromGraveyardAndExileWithoutResettingTax() {
        Game game = game(3); Player player = game.getPlayers().get(0);
        Card card = commander(game, player); player.incCommanderCast(card);
        int id = card.getId();
        for (ZoneType destination : List.of(ZoneType.Graveyard, ZoneType.Exile)) {
            card = game.getAction().moveTo(ZoneType.Battlefield, card, null, null);
            card = game.getAction().moveTo(destination, card, null, null);
            assertEquals(destination, card.getZone().getZoneType());
            game.getAction().checkStateEffects(true);
            assertTrue(player.getCardsIn(ZoneType.Command).stream().anyMatch(c -> c.getId() == id));
            card = player.getCardsIn(ZoneType.Command).stream().filter(c -> c.getId() == id).findFirst().orElseThrow();
            assertEquals(1, player.getCommanderCast(card));
            assertEquals(2, StateJson.player(player.getView(), true, game).getAsJsonArray("commanders").get(0).getAsJsonObject().get("tax").getAsInt());
        }
    }

    @Test public void commanderDamageIsPerIdentityCombatOnlyAndEliminatesOneSeat() {
        Game game = game(4); Player owner = game.getPlayers().get(0), victim = game.getPlayers().get(1);
        Card first = commander(game, owner), second = commander(game, game.getPlayers().get(2));
        victim.addDamageAfterPrevention(8, first, null, false, new GameEntityCounterTable());
        assertEquals(0, victim.getCommanderDamage(first));
        victim.addDamageAfterPrevention(12, first, null, true, new GameEntityCounterTable());
        victim.addDamageAfterPrevention(10, second, null, true, new GameEntityCounterTable());
        assertFalse(victim.checkLoseCondition());
        victim.addDamageAfterPrevention(9, first, null, true, new GameEntityCounterTable());
        assertEquals(21, victim.getCommanderDamage(first)); assertEquals(10, victim.getCommanderDamage(second));
        game.getAction().checkGameOverCondition();
        assertTrue(victim.hasLost()); assertFalse(game.isGameOver()); assertEquals(3, game.getPlayers().size());
        var snapshot = StateJson.game(game.getView(), victim.getId(), game);
        assertEquals(4, snapshot.getAsJsonArray("players").size());
        assertTrue(snapshot.getAsJsonArray("players").get(1).getAsJsonObject().get("eliminated").getAsBoolean());
        game.getPlayers().get(1).concede(); game.getAction().checkGameOverCondition();
        assertFalse(game.isGameOver());
        game.getPlayers().get(1).concede(); game.getAction().checkGameOverCondition();
        assertTrue(game.isGameOver()); assertEquals(owner.getName(), game.getView().getWinningPlayerName());
    }

    @Test public void exactDefenderSelectionNeverUsesFirstOpponentImplicitly() {
        Game game = game(4); Player player = game.getPlayers().get(0), defender = game.getPlayers().get(3);
        Card attacker = ExilePermissionsTest.add(game, "Raging Goblin", player, ZoneType.Battlefield);
        Combat combat = new Combat(player); game.getPhaseHandler().setCombat(combat);
        FThreads.invokeInEdtAndWait(() -> {
            var human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Test"));
            human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class},
                (proxy, method, args) -> method.getReturnType() == boolean.class ? false : null));
            InputAttack input = new InputAttack(human, player, combat);
            assertEquals(3, InputContext.attacking(input).getAsJsonArray("defenders").size());
            assertFalse(InputContext.assignAttack(input, attacker.getId(), player.getId(), "player"));
            assertFalse(InputContext.assignAttack(input, attacker.getId(), defender.getId(), "card"));
            assertTrue(InputContext.assignAttack(input, attacker.getId(), defender.getId(), "player"));
            assertTrue(combat.isAttacking(attacker, defender));
            assertTrue(InputContext.assignAttack(input, attacker.getId(), defender.getId(), "player"));
            assertFalse(combat.isAttacking(attacker));
        });
    }

    @Test public void nativeAttackAllDefaultsToFirstDefenderButHonorsExplicitPlayerOrCardSelection() {
        Game game = game(4); Player player = game.getPlayers().get(0), chosen = game.getPlayers().get(3);
        Card first = ExilePermissionsTest.add(game, "Raging Goblin", player, ZoneType.Battlefield);
        Card second = ExilePermissionsTest.add(game, "Raging Goblin", player, ZoneType.Battlefield);
        Card walker = ExilePermissionsTest.add(game, "Jace Beleren", chosen, ZoneType.Battlefield);
        Combat combat = new Combat(player); game.getPhaseHandler().setCombat(combat);
        FThreads.invokeInEdtAndWait(() -> {
            var human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Test"));
            human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class},
                (proxy, method, args) -> method.getReturnType() == boolean.class ? false : null));
            InputAttack input = new InputAttack(human, player, combat);
            input.showMessageInitial(); input.selectButtonCancel();
            assertTrue(combat.isAttacking(first, combat.getDefenders().getFirst()));
            assertTrue(combat.isAttacking(second, combat.getDefenders().getFirst()));
            assertFalse(combat.isAttacking(first, chosen));
            input.selectButtonCancel(); // Existing Recall all must still remove every assignment.
            assertTrue(combat.getAttackers().isEmpty());
            input.selectPlayer(chosen, null); input.selectButtonCancel();
            assertTrue(combat.isAttacking(first, chosen)); assertTrue(combat.isAttacking(second, chosen));
            input.selectButtonCancel();
            assertTrue(input.selectCard(walker, null, null)); input.selectButtonCancel();
            assertTrue(combat.isAttacking(first, walker)); assertTrue(combat.isAttacking(second, walker));
        });
    }

    @Test public void explicitBulkAttackNeverFallsBackAndPreservesExistingAssignments() {
        for (int count : List.of(2, 4)) {
            Game game = game(count); Player player = game.getPlayers().get(0), chosen = game.getPlayers().get(count - 1);
            // Create a real planeswalker sharing the chosen player's numeric ID; kind must disambiguate it.
            Card walker = forge.game.card.CardFactory.getCard(DeckValidation.resolve("Jace Beleren"), chosen, chosen.getId(), game);
            chosen.getZone(ZoneType.Battlefield).add(walker); walker.setZone(chosen.getZone(ZoneType.Battlefield));
            // Reserve the fixture's explicit card ID before creating the remaining cards.
            for (int i = 0; i <= chosen.getId(); i++) game.nextCardId();
            Card goblin = ExilePermissionsTest.add(game, "Raging Goblin", player, ZoneType.Battlefield);
            Card serpent = ExilePermissionsTest.add(game, "Sea Serpent", player, ZoneType.Battlefield); serpent.setSickness(false);
            ExilePermissionsTest.add(game, "Island", player, ZoneType.Battlefield);
            if (count == 4) ExilePermissionsTest.add(game, "Island", game.getPlayers().get(1), ZoneType.Battlefield);
            game.getAction().checkStaticAbilities();
            Combat combat = new Combat(player); game.getPhaseHandler().setCombat(combat);
            FThreads.invokeInEdtAndWait(() -> {
                var human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Test"));
                human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class},
                    (proxy, method, args) -> method.getReturnType() == boolean.class ? false : null));
                InputAttack input = new InputAttack(human, player, combat); input.showMessageInitial();
                assertFalse(InputContext.assignAllAttackers(input, player.getId(), "player"));
                assertFalse(InputContext.assignAllAttackers(input, -1, "card"));
                assertFalse(InputContext.assignAllAttackers(input, chosen.getId(), "unknown"));
                assertTrue(combat.getAttackers().isEmpty());
                assertTrue(InputContext.assignAllAttackers(input, chosen.getId(), "player"));
                assertTrue(combat.isAttacking(goblin, chosen)); assertFalse(combat.isAttacking(serpent));
                assertEquals(1, combat.getAttackers().size());
                assertFalse(InputContext.assignAllAttackers(input, chosen.getId(), "card"));
                assertTrue(combat.isAttacking(goblin, chosen));
                input.selectButtonCancel(); assertTrue(combat.getAttackers().isEmpty());
                assertTrue(InputContext.assignAllAttackers(input, walker.getId(), "card"));
                assertTrue(combat.isAttacking(goblin, walker)); assertFalse(combat.isAttacking(serpent));
                input.selectButtonCancel();
                if (count == 4) {
                    input.selectPlayer(chosen, null); input.selectButtonCancel();
                    assertTrue("native alpha strike silently redirects the restricted creature", combat.isAttacking(serpent, game.getPlayers().get(1)));
                }
            });
        }
    }

    @Test public void fourSeatSnapshotsDoNotExposeOpponentHandsOrEliminatedHands() {
        Game game = game(4);
        for (Player player : game.getPlayers()) ExilePermissionsTest.add(game, "Plains", player, ZoneType.Hand);
        Player viewer = game.getPlayers().get(2);
        var state = StateJson.game(game.getView(), viewer.getId(), game);
        for (int i = 0; i < 4; i++) {
            var row = state.getAsJsonArray("players").get(i).getAsJsonObject();
            assertEquals(i, row.get("seat").getAsInt()); assertEquals(i == 2 ? 1 : 0, row.getAsJsonArray("hand").size());
        }
        viewer.concede(); game.getAction().checkGameOverCondition();
        for (var row : StateJson.game(game.getView(), viewer.getId(), game).getAsJsonArray("players"))
            assertTrue(row.getAsJsonObject().getAsJsonArray("hand").isEmpty());
    }

    private static JsonObject take(EmbeddedChannel ch, String type) {
        Object message;
        while ((message = ch.readOutbound()) != null) if (message instanceof TextWebSocketFrame frame) {
            try { JsonObject json = JsonParser.parseString(frame.text()).getAsJsonObject(); if (type.equals(json.get("type").getAsString())) return json; }
            finally { frame.release(); }
        }
        throw new AssertionError("Missing " + type);
    }

    @Test public void roomCapacityVacancyReconnectAndMalformedJoinPreserveSeats() {
        Rooms rooms = new Rooms(); EmbeddedChannel host = new EmbeddedChannel(), guest = new EmbeddedChannel(), returned = new EmbeddedChannel();
        String deck = "{\"name\":\"Commander\",\"cards\":[{\"name\":\"Plains\",\"count\":99}],\"commanders\":[{\"name\":\"Isamaru, Hound of Konda\",\"count\":1}]}";
        try {
            rooms.onMessage(host, "{\"type\":\"host\",\"config\":{\"format\":\"commander\",\"matchLength\":\"bo1\",\"playerCount\":4},\"deck\":" + deck + "}");
            var room = take(host, "room").getAsJsonObject("room"); String code = room.get("code").getAsString();
            assertEquals(4, room.get("capacity").getAsInt());
            rooms.onMessage(guest, "{\"type\":\"join\",\"code\":\"" + code + "\",\"deck\":" + deck + "}");
            room = take(guest, "room").getAsJsonObject("room");
            assertEquals(1, room.get("seat").getAsInt()); assertFalse(room.get("started").getAsBoolean());
            String token = room.get("token").getAsString(); rooms.onDisconnect(guest);
            rooms.onMessage(returned, "{\"type\":\"rejoin\",\"code\":\"" + code + "\",\"token\":\"" + token + "\"}");
            assertEquals(1, take(returned, "room").getAsJsonObject("room").get("seat").getAsInt());
            rooms.onMessage(returned, "{\"type\":\"leave\"}");
            rooms.onMessage(guest, "{\"type\":\"join\",\"code\":\"" + code + "\",\"deck\":" + deck + "}");
            assertEquals(1, take(guest, "room").getAsJsonObject("room").get("seat").getAsInt());
            rooms.onMessage(returned, "{\"type\":\"rejoin\",\"code\":\"" + code + "\",\"token\":\"" + token + "\"}");
            take(returned, "gone");
        } finally {
            rooms.onMessage(host, "{\"type\":\"leave\"}"); rooms.onMessage(guest, "{\"type\":\"leave\"}");
            host.finishAndReleaseAll(); guest.finishAndReleaseAll(); returned.finishAndReleaseAll();
        }
    }

    private static JsonObject latestRoom(EmbeddedChannel channel) {
        JsonObject latest = null;
        Object message;
        while ((message = channel.readOutbound()) != null) if (message instanceof TextWebSocketFrame frame) {
            try {
                JsonObject json = JsonParser.parseString(frame.text()).getAsJsonObject();
                if ("room".equals(json.get("type").getAsString())) latest = json.getAsJsonObject("room");
            } finally { frame.release(); }
        }
        assertNotNull("Missing roster broadcast", latest);
        return latest;
    }

    @Test public void waitingRoomsBroadcastDisconnectAndReconnectToEverySeat() {
        String deck = "{\"cards\":[{\"name\":\"Plains\",\"count\":99}],\"commanders\":[{\"name\":\"Isamaru, Hound of Konda\",\"count\":1}]}";
        for (int capacity : List.of(3, 4)) {
            Rooms rooms = new Rooms(); List<EmbeddedChannel> channels = new ArrayList<>();
            EmbeddedChannel host = new EmbeddedChannel(), returned = new EmbeddedChannel(); channels.add(host);
            try {
                rooms.onMessage(host, "{\"type\":\"host\",\"config\":{\"format\":\"commander\",\"matchLength\":\"bo1\",\"playerCount\":" + capacity + "},\"deck\":" + deck + "}");
                String code = latestRoom(host).get("code").getAsString();
                for (int i = 1; i < capacity - 1; i++) {
                    EmbeddedChannel guest = new EmbeddedChannel(); channels.add(guest);
                    rooms.onMessage(guest, "{\"type\":\"join\",\"code\":\"" + code + "\",\"deck\":" + deck + "}");
                }
                String token = null;
                for (EmbeddedChannel channel : channels) token = latestRoom(channel).get("token").getAsString();
                int departingSeat = channels.size() - 1;
                EmbeddedChannel departing = channels.get(departingSeat);
                rooms.onDisconnect(departing);
                for (int i = 0; i < departingSeat; i++) {
                    JsonObject room = latestRoom(channels.get(i));
                    assertEquals(i, room.get("seat").getAsInt());
                    assertEquals(capacity - 1, room.getAsJsonArray("players").size());
                    assertFalse(room.getAsJsonArray("players").get(departingSeat).getAsJsonObject().get("connected").getAsBoolean());
                    assertFalse(room.get("started").getAsBoolean());
                }
                rooms.onMessage(returned, "{\"type\":\"rejoin\",\"code\":\"" + code + "\",\"token\":\"" + token + "\"}");
                for (int i = 0; i < capacity - 1; i++) {
                    JsonObject room = latestRoom(i == departingSeat ? returned : channels.get(i));
                    assertEquals(i, room.get("seat").getAsInt());
                    assertEquals(capacity - 1, room.getAsJsonArray("players").size());
                    assertTrue(room.getAsJsonArray("players").get(departingSeat).getAsJsonObject().get("connected").getAsBoolean());
                    assertFalse(room.get("started").getAsBoolean());
                }
                // A socket already occupying one seat must never gain a second private perspective.
                rooms.onMessage(host, "{\"type\":\"rejoin\",\"code\":\"" + code + "\",\"token\":\"" + token + "\"}");
                take(host, "error");
                assertTrue(returned.isOpen());
                rooms.onDisconnect(returned);
                JsonObject room = latestRoom(host);
                assertEquals(0, room.get("seat").getAsInt());
                assertTrue(room.getAsJsonArray("players").get(0).getAsJsonObject().get("connected").getAsBoolean());
                assertFalse(room.getAsJsonArray("players").get(departingSeat).getAsJsonObject().get("connected").getAsBoolean());
            } finally {
                rooms.onMessage(host, "{\"type\":\"leave\"}");
                for (EmbeddedChannel channel : channels) channel.finishAndReleaseAll();
                returned.finishAndReleaseAll();
            }
        }
    }
}
