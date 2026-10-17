package mesadeduelo.bridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import forge.game.GameRules;
import forge.game.GameType;

/** Immutable, room-owned rules. Never mutate global Forge preferences per match. */
record MatchConfig(String format, String matchLength, int playerCount) {
    static final String ENGINE_VERSION = "2.0.16-SNAPSHOT+0b0f7ecc5111.mesa1";
    static final String RULES_VERSION = "pauper-commander-2026-10-16-v2";

    MatchConfig(String format, String matchLength) { this(format, matchLength, 2); }

    boolean commander() { return "commander".equals(format); }

    MatchConfig {
        if (!"free".equals(format) && !"pauper".equals(format) && !"commander".equals(format))
            throw new IllegalArgumentException("Formato não suportado.");
        if (!"bo1".equals(matchLength) && !"bo3".equals(matchLength))
            throw new IllegalArgumentException("Duração da partida não suportada.");
        if (playerCount < 2 || playerCount > 4 || (!"commander".equals(format) && playerCount != 2))
            throw new IllegalArgumentException("Escolha de dois a quatro jogadores para Commander; os demais formatos exigem dois.");
        if ("commander".equals(format) && !"bo1".equals(matchLength))
            throw new IllegalArgumentException("Commander permite apenas uma partida, sem sideboard.");
    }

    static MatchConfig parse(JsonElement value) {
        if (value == null || !value.isJsonObject())
            throw new IllegalArgumentException("Escolha o formato e a duração da partida.");
        JsonObject o = value.getAsJsonObject();
        int count = 2;
        if (o.has("playerCount")) {
            JsonElement v = o.get("playerCount");
            if (!v.isJsonPrimitive() || !v.getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException("Número de jogadores inválido.");
            try { count = v.getAsBigDecimal().intValueExact(); }
            catch (ArithmeticException e) { throw new IllegalArgumentException("Número de jogadores inválido."); }
        }
        return new MatchConfig(string(o, "format"), string(o, "matchLength"), count);
    }

    static String string(JsonObject o, String key) {
        JsonElement v = o.get(key);
        if (v == null || !v.isJsonPrimitive() || !v.getAsJsonPrimitive().isString())
            throw new IllegalArgumentException("Campo inválido: " + key + ".");
        return v.getAsString();
    }

    GameRules rules() {
        GameRules r = new GameRules(GameType.Constructed);
        if (commander()) r.setAppliedVariants(java.util.Set.of(GameType.Commander));
        r.setGamesPerMatch("bo3".equals(matchLength) ? 3 : 1);
        r.setAISideboardingEnabled(true);
        r.setSideboardForAI(false);
        r.setPlayForAnte(false);
        r.setAllowCheatShuffle(false);
        return r;
    }

    JsonObject json() {
        JsonObject o = new JsonObject();
        o.addProperty("format", format);
        o.addProperty("matchLength", matchLength);
        if (commander()) o.addProperty("playerCount", playerCount);
        return o;
    }

    static void versions(JsonObject o) {
        o.addProperty("rulesVersion", RULES_VERSION);
        o.addProperty("engineVersion", ENGINE_VERSION);
    }
}
