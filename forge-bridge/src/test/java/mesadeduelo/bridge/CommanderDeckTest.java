package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.*;
import org.junit.BeforeClass;
import org.junit.Test;

public class CommanderDeckTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }
    private JsonObject deck(String commander, String card, int count) {
        JsonObject d = new JsonObject(); d.addProperty("name", "Commander test");
        d.add("commanders", rows(commander, 1)); d.add("cards", rows(card, count)); return d;
    }
    private JsonArray rows(String name, int count) {
        JsonArray rows = new JsonArray(); JsonObject e = new JsonObject(); e.addProperty("name", name); e.addProperty("count", count); rows.add(e); return rows;
    }
    private DeckValidation.Result check(JsonObject d) { return DeckValidation.validate(d, "commander"); }
    private void rejects(JsonObject d, String code) {
        var r = check(d); assertTrue(r.json().toString(), r.issues().asList().stream().anyMatch(i -> code.equals(i.getAsJsonObject().get("code").getAsString())));
    }
    @Test public void allFourStartersArePlayableByHumansAndAi() {
        StringBuilder errors = new StringBuilder();
        long count = Decks.LISTS.values().stream().filter(d -> "commander".equals(d.get("format").getAsString())).peek(d -> {
            var r = DeckValidation.validateForAi(d, "commander");
            if (!r.valid()) { errors.append(d.get("name")).append(": ").append(r.json()).append("\n"); return; }
            assertEquals(99, r.deck().getMain().countAll()); assertEquals(1, r.deck().getCommanders().size());
            assertEquals(1, r.json().getAsJsonObject("deck").getAsJsonArray("commanders").size());
        }).count();
        assertEquals(errors.toString(), 0, errors.length());
        assertEquals(4, count); assertNotNull(Decks.random("commander"));
    }
    @Test public void countsSingletonAndOracleExceptions() {
        assertTrue(check(deck("Marwyn, the Nurturer", "Forest", 99)).valid());
        rejects(deck("Marwyn, the Nurturer", "Forest", 98), "total-count");
        rejects(deck("Marwyn, the Nurturer", "Llanowar Elves", 99), "too-many-copies");
        assertTrue(check(deck("Ashcoat of the Shadow Swarm", "Rat Colony", 99)).json().toString(), check(deck("Ashcoat of the Shadow Swarm", "Rat Colony", 99)).valid());
    }
    @Test public void bansIdentityLandsAndUnsupportedChoices() {
        rejects(deck("Marwyn, the Nurturer", "Island", 99), "color-identity");
        rejects(deck("Kozilek, the Great Distortion", "Forest", 99), "color-identity");
        rejects(deck("Marwyn, the Nurturer", "Mana Crypt", 99), "banned-card");
        rejects(deck("Marwyn, the Nurturer", "Ashnod's Coupon", 99), "unknown-card");
        rejects(deck("The Prismatic Piper", "Wastes", 99), "unsupported-commander-choice");
        rejects(deck("Llanowar Elves", "Forest", 99), "invalid-commander");
        rejects(deck("Raised by Giants", "Forest", 99), "invalid-commander");
    }
    @Test public void partnershipsAndBackgroundsUseForgeRules() {
        JsonObject d = deck("Thrasios, Triton Hero", "Forest", 98);
        d.getAsJsonArray("commanders").add(rows("Tymna the Weaver", 1).get(0)); assertTrue(check(d).json().toString(), check(d).valid());
        d = deck("Wilson, Refined Grizzly", "Forest", 98);
        d.getAsJsonArray("commanders").add(rows("Raised by Giants", 1).get(0)); assertTrue(check(d).json().toString(), check(d).valid());
        d = deck("Marwyn, the Nurturer", "Forest", 98);
        d.getAsJsonArray("commanders").add(rows("Lathril, Blade of the Elves", 1).get(0)); rejects(d, "commander-construction");
        d = deck("Marwyn, the Nurturer", "Forest", 99); d.add("sideboard", rows("Forest", 1)); rejects(d, "sideboard-not-supported");
    }
}
