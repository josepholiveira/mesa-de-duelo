package mesadeduelo.bridge;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import forge.deck.Deck;

/** The browser and bridge consume the same reviewed starter collection. */
final class Decks {
    static final Map<String, JsonObject> LISTS = new LinkedHashMap<>();
    static {
        try (var stream = Decks.class.getResourceAsStream("/starter-decks.json")) {
            if (stream == null) throw new IllegalStateException("Coleção de decks prontos não encontrada.");
            for (var e : JsonParser.parseReader(new InputStreamReader(stream, StandardCharsets.UTF_8)).getAsJsonArray()) {
                JsonObject o = e.getAsJsonObject(); LISTS.put(o.get("id").getAsString(), o);
            }
        } catch (java.io.IOException e) { throw new ExceptionInInitializerError(e); }
    }

    static JsonObject template(String id) {
        JsonObject o = LISTS.get(id);
        if (o == null) o = LISTS.get("padrao-" + id);
        return o == null ? null : o.deepCopy();
    }

    static Deck build(String id) {
        var result = DeckValidation.validate(template(id), "free");
        if (!result.valid()) throw new IllegalArgumentException("Deck pronto inválido: " + id);
        return result.deck();
    }

    static Deck random(String format) {
        var valid = LISTS.values().stream()
            .filter(o -> !"pauper".equals(format) || "pauper".equals(o.has("format") ? o.get("format").getAsString() : "free"))
            .map(o -> DeckValidation.validateForAi(o, format)).filter(DeckValidation.Result::valid).toList();
        if (valid.isEmpty()) throw new IllegalArgumentException("Não há deck pronto válido para este formato.");
        return valid.get(java.util.concurrent.ThreadLocalRandom.current().nextInt(valid.size())).deck();
    }

    private Decks() { }
}
