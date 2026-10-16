package mesadeduelo.bridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import forge.game.GameRules;
import forge.game.GameType;

/** Immutable, room-owned rules. Never mutate global Forge preferences per match. */
record MatchConfig(String format, String matchLength) {
    static final String ENGINE_VERSION = "2.0.16-SNAPSHOT+0b0f7ecc5111.mesa1";
    static final String RULES_VERSION = "pauper-2026-10-16-v1";

    MatchConfig {
        if (!"free".equals(format) && !"pauper".equals(format))
            throw new IllegalArgumentException("Formato não suportado.");
        if (!"bo1".equals(matchLength) && !"bo3".equals(matchLength))
            throw new IllegalArgumentException("Duração da partida não suportada.");
    }

    static MatchConfig parse(JsonElement value) {
        if (value == null || !value.isJsonObject())
            throw new IllegalArgumentException("Escolha o formato e a duração da partida.");
        JsonObject o = value.getAsJsonObject();
        return new MatchConfig(string(o, "format"), string(o, "matchLength"));
    }

    static String string(JsonObject o, String key) {
        JsonElement v = o.get(key);
        if (v == null || !v.isJsonPrimitive() || !v.getAsJsonPrimitive().isString())
            throw new IllegalArgumentException("Campo inválido: " + key + ".");
        return v.getAsString();
    }

    GameRules rules() {
        GameRules r = new GameRules(GameType.Constructed);
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
        return o;
    }

    static void versions(JsonObject o) {
        o.addProperty("rulesVersion", RULES_VERSION);
        o.addProperty("engineVersion", ENGINE_VERSION);
    }
}
