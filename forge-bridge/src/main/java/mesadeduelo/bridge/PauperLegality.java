package mesadeduelo.bridge;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import com.google.gson.JsonParser;

/** Checked-in Oracle legality snapshot: server validation never depends on a live API. */
final class PauperLegality {
    private static final Map<String, String> ORACLE_IDS = load();
    private static Map<String, String> load() {
        try (var stream = PauperLegality.class.getResourceAsStream("/pauper-legality.json")) {
            if (stream == null) throw new IllegalStateException("Missing Pauper legality snapshot");
            var json = JsonParser.parseReader(new InputStreamReader(stream, StandardCharsets.UTF_8)).getAsJsonObject();
            Map<String, String> names = new HashMap<>();
            for (var value : json.getAsJsonArray("cards")) {
                var card = value.getAsJsonObject();
                String name = card.get("name").getAsString(), id = card.get("oracleId").getAsString();
                names.put(key(name), id);
                for (String face : name.split(" // ")) names.put(key(face), id);
            }
            return Map.copyOf(names);
        } catch (java.io.IOException e) { throw new IllegalStateException("Cannot load Pauper legality snapshot", e); }
    }
    static String oracleId(String name) { return ORACLE_IDS.get(key(name)); }
    static boolean permits(String name) { return oracleId(name) != null; }
    private static String key(String value) { return value.strip().toLowerCase(Locale.ROOT); }
    private PauperLegality() { }
}
