package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicLong;
import com.google.gson.*;
import forge.gui.GuiBase;
import forge.model.FModel;
import forge.localinstance.properties.ForgePreferences.FPref;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.BeforeClass;
import org.junit.Test;

public class BridgeRulesTest {
    private static boolean initialized;
    @BeforeClass public static synchronized void engine() {
        if (initialized) return;
        // Keep Forge preferences and generated cache files inside the test output directory.
        System.setProperty("user.home", Path.of("target", "test-home").toAbsolutePath().toString());
        String root = System.getProperty("forge.dir");
        if (root == null || root.startsWith("${")) throw new IllegalStateException("Run tests with -Dforge.dir=/path/to/pinned/forge");
        GuiBase.setInterface(new HeadlessGui(Path.of(root, "forge-gui")));
        FModel.initialize(null, prefs -> { prefs.setPref(FPref.LOAD_CARD_SCRIPTS_LAZILY, "true"); return null; });
        initialized = true;
    }
    private static JsonObject deck(Object... pairs) {
        JsonObject deck = new JsonObject(); deck.addProperty("name", "Test"); deck.add("cards", entries(pairs)); return deck;
    }
    private static JsonArray entries(Object... pairs) {
        JsonArray rows = new JsonArray();
        for (int i = 0; i < pairs.length; i += 2) {
            JsonObject row = new JsonObject(); row.addProperty("name", (String)pairs[i]);
            row.add("count", new Gson().toJsonTree(pairs[i + 1])); rows.add(row);
        }
        return rows;
    }
    private static DeckValidation.Result validate(JsonObject deck) { return DeckValidation.validate(deck, "pauper"); }
    private static void has(DeckValidation.Result result, String code) {
        assertTrue(result.json().toString(), result.issues().asList().stream().anyMatch(e -> code.equals(e.getAsJsonObject().get("code").getAsString())));
    }
    @Test public void sharedStartersArePlayableInTheirFormat() {
        Decks.LISTS.forEach((id, template) -> {
            String format = template.has("format") ? template.get("format").getAsString() : "free";
            var result = DeckValidation.validate(new JsonPrimitive(id), format);
            assertTrue(id + ": " + result.json(), result.valid());
        });
        assertNotNull(Decks.random("pauper"));
    }
    @Test public void minimumIsSixtyNotExactlySixty() {
        has(validate(deck("Island",59)), "main-too-small");
        assertTrue(validate(deck("Island",60)).valid());
        assertTrue(validate(deck("Island",61)).valid());
    }
    @Test public void sideboardAndCombinedCopyLimits() {
        JsonObject d = deck("Mountain",56,"Lightning Bolt",4);
        d.add("sideboard",entries("Lightning Bolt",1)); has(validate(d),"too-many-copies");
        d = deck("Mountain",57,"Lightning Bolt",3); d.add("sideboard",entries("Lightning Bolt",1)); assertTrue(validate(d).json().toString(),validate(d).valid());
        d.add("sideboard",entries("Mountain",16)); has(validate(d),"sideboard-too-large");
    }
    @Test public void basicsAndOracleCopyExceptionsUseCombinedPool() {
        assertTrue(validate(deck("Snow-Covered Island",60)).valid());
        JsonObject d=deck("Mountain",57,"Seven Dwarves",3); d.add("sideboard",entries("Seven Dwarves",4)); assertTrue(validate(d).json().toString(),validate(d).valid());
        d.add("sideboard",entries("Seven Dwarves",5)); has(validate(d),"too-many-copies");
        assertTrue(validate(deck("Island",20,"Persistent Petitioners",40)).valid());
    }
    @Test public void rejectsBannedRareUnknownAndBadQuantitiesTogether() {
        JsonObject d=deck("Island",60,"Monastery Swiftspear",1,"Black Lotus",1,"Not a Real Card",1,"Forest",-2,"Mountain",1.5,"Plains","2");
        var result=validate(d); has(result,"banned-card"); has(result,"wrong-format"); has(result,"unknown-card"); has(result,"invalid-count");
        assertFalse(result.json().has("deck"));
    }
    @Test public void frontAndAdventureAliasesCannotBypassCopyLimits() {
        has(validate(deck("Plains",55,"Faerie Guidemother",3,"Gift of the Fae",2)),"too-many-copies");
        assertEquals("Faerie Guidemother",DeckValidation.resolve("Faerie Guidemother // Gift of the Fae").getName());
        assertEquals("Lightning Bolt",DeckValidation.resolve("Raio").getName());
    }
    @Test public void oracleIdentityMustMatchName() {
        JsonObject d=deck("Island",60); d.getAsJsonArray("cards").get(0).getAsJsonObject().addProperty("oracleId","bad-id");
        has(validate(d),"identity-mismatch");
    }
    @Test public void freeAllowsCasualSizesButStillRejectsMalformedCards() {
        assertTrue(DeckValidation.validate(deck("Lightning Bolt",40),"free").valid());
        has(DeckValidation.validate(deck("Not a Real Card",40),"free"),"unknown-card");
    }
    @Test public void configRejectsUnknownsAndKeepsAIHumanControlOff() {
        try { new MatchConfig("standard","bo1"); fail(); } catch (IllegalArgumentException expected) { }
        try { new MatchConfig("pauper","bo5"); fail(); } catch (IllegalArgumentException expected) { }
        assertEquals(3,new MatchConfig("pauper","bo3").rules().getGamesPerMatch());
        assertFalse(new MatchConfig("pauper","bo3").rules().getSideboardForAI());
    }
    @Test public void eventHistoryIsImmutableOrderedAndBounded() {
        AtomicLong version=new AtomicLong(); VisibleEvents events=new VisibleEvents(version::incrementAndGet,version::get);
        JsonObject e=new JsonObject(); e.addProperty("type","draw"); events.append(e); e.addProperty("type","tampered");
        assertEquals("draw",events.json(0).get(0).getAsJsonObject().get("type").getAsString());
        for(int i=0;i<600;i++) events.append(e);
        assertEquals(512,events.json(0).size()); assertEquals(601,events.cursor()); assertEquals(1,events.json(600).size());
        assertFalse(events.json(600).get(0).getAsJsonObject().has("card"));
    }
    private static JsonObject take(EmbeddedChannel ch,String type) {
        Object o;
        while((o=ch.readOutbound())!=null) if(o instanceof TextWebSocketFrame f) {
            try { JsonObject j=JsonParser.parseString(f.text()).getAsJsonObject(); if(type.equals(j.get("type").getAsString())) return j; }
            finally { f.release(); }
        }
        fail("Missing " + type); return null;
    }
    @Test public void lookupAndFailedJoinNeverLeakOrDestroyExistingSeat() {
        Rooms rooms=new Rooms(); EmbeddedChannel host=new EmbeddedChannel(), guest=new EmbeddedChannel();
        String payload=deck("Island",60).toString();
        String config="\"config\":{\"format\":\"pauper\",\"matchLength\":\"bo3\"}";
        rooms.onMessage(host,"{\"type\":\"host\",\"deck\":"+payload+","+config+"}");
        String code=take(host,"room").getAsJsonObject("room").get("code").getAsString();
        rooms.onMessage(guest,"{\"type\":\"host\",\"deck\":"+payload+","+config+"}");
        String prior=take(guest,"room").getAsJsonObject("room").get("code").getAsString();
        rooms.onMessage(guest,"{\"type\":\"lookup-room\",\"requestId\":\"lookup\",\"code\":\""+code+"\"}");
        JsonObject lookup=take(guest,"room-info"); assertEquals("lookup",lookup.get("requestId").getAsString());
        assertFalse(lookup.toString().contains("token")); assertFalse(lookup.toString().contains("cards"));
        rooms.onMessage(guest,"{\"type\":\"join\",\"code\":\""+code+"\",\"deck\":"+deck("Island",59)+"}");
        take(guest,"validation-error");
        rooms.onMessage(guest,"{\"type\":\"lookup-room\",\"code\":\""+prior+"\"}");
        assertTrue(take(guest,"room-info").getAsJsonObject("room").get("available").getAsBoolean());
        rooms.onMessage(host,"{\"type\":\"leave\"}"); rooms.onMessage(guest,"{\"type\":\"leave\"}");
        host.finishAndReleaseAll(); guest.finishAndReleaseAll();
    }
}
