package mesadeduelo.bridge;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Locale;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import forge.StaticData;
import forge.deck.CardPool;
import forge.deck.Deck;
import forge.deck.DeckFormat;
import forge.deck.DeckSection;
import forge.game.GameFormat;
import forge.item.PaperCard;
import forge.model.FModel;

/** Server preflight shared by creation, AI, joining, and sideboarding. No partial decks. */
final class DeckValidation {
    private static final int MAX_ENTRIES = 500, MAX_CARDS = 5000;
    private static final Map<String, String> TRANSLATED_NAMES = translatedNames();
    private static final Set<String> UNIVERSAL_BANS = Set.of("Cleanse", "Crusade", "Imprison",
        "Invoke Prejudice", "Jihad", "Pradesh Gypsies", "Stone-Throwing Devils");

    record Result(Deck deck, JsonArray issues) {
        boolean valid() { return issues.isEmpty(); }
        JsonObject json() {
            JsonObject o = new JsonObject();
            o.addProperty("valid", valid());
            o.add("issues", issues.deepCopy());
            o.addProperty("mainCount", deck.getMain().countAll());
            o.addProperty("sideboardCount", deck.getOrCreate(DeckSection.Sideboard).countAll());
            MatchConfig.versions(o);
            if (valid()) o.add("deck", deckJson(deck));
            return o;
        }
    }

    static Result validate(JsonElement payload, String format) {
        if (!Set.of("free", "pauper").contains(format)) throw new IllegalArgumentException("Formato não suportado.");
        JsonArray issues = new JsonArray();
        Deck deck = new Deck("Deck");
        if (payload != null && payload.isJsonPrimitive() && payload.getAsJsonPrimitive().isString()) {
            payload = Decks.template(payload.getAsString());
        }
        if (payload == null || !payload.isJsonObject()) {
            issue(issues, "invalid-deck", "Envie um deck com a lista de cartas.", null, null);
            return new Result(deck, issues);
        }
        JsonObject o = payload.getAsJsonObject();
        if (o.has("name") && o.get("name").isJsonPrimitive() && o.get("name").getAsJsonPrimitive().isString())
            deck = new Deck(o.get("name").getAsString().strip().substring(0, Math.min(100, o.get("name").getAsString().strip().length())));
        readSection(o.get("cards"), deck.getMain(), "main", issues, true);
        readSection(o.get("sideboard"), deck.getOrCreate(DeckSection.Sideboard), "sideboard", issues, false);
        checkRules(deck, format, issues);
        return new Result(deck, issues);
    }

    static Result validateForAi(JsonElement payload, String format) {
        Result result = validate(payload, format);
        if (result.valid()) result.deck().getUnplayableAICards().unplayable.forEach((section, cards) -> {
            for (PaperCard card : cards) issue(result.issues(), "unsupported-ai-card", "A IA ainda não consegue jogar esta carta corretamente. Escolha outra carta para o deck do oponente.", card.getName(), section == DeckSection.Main ? "main" : "sideboard");
        });
        return result;
    }

    private static void readSection(JsonElement value, CardPool pool, String section, JsonArray issues, boolean required) {
        if (value == null && !required) return;
        if (value == null || !value.isJsonArray() || value.getAsJsonArray().size() > MAX_ENTRIES) {
            issue(issues, "invalid-section", "A seção deve conter uma lista de até 500 entradas.", null, section);
            return;
        }
        int total = 0;
        for (JsonElement e : value.getAsJsonArray()) {
            if (!e.isJsonObject()) { issue(issues, "invalid-entry", "Entrada de carta inválida.", null, section); continue; }
            JsonObject row = e.getAsJsonObject();
            String name;
            int count;
            try {
                name = MatchConfig.string(row, "name").strip();
                if (name.isEmpty() || name.length() > 200) throw new IllegalArgumentException();
            } catch (RuntimeException ex) { issue(issues, "invalid-name", "Informe um nome de carta válido.", null, section); continue; }
            try {
                JsonElement n = row.get("count");
                if (n == null || !n.isJsonPrimitive() || !n.getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException();
                count = new BigDecimal(n.getAsString()).intValueExact();
                if (count < 1 || count > MAX_CARDS || (total += count) > MAX_CARDS) throw new IllegalArgumentException();
            } catch (RuntimeException ex) { issue(issues, "invalid-count", "A quantidade deve ser um número inteiro positivo, até 5.000 cartas por seção.", name, section); continue; }
            PaperCard card = resolve(name);
            if (card == null) { issue(issues, "unknown-card", "Carta não encontrada no motor de regras.", name, section); continue; }
            if (row.has("oracleId") && (!row.get("oracleId").isJsonPrimitive() || !row.get("oracleId").getAsJsonPrimitive().isString()
                || (PauperLegality.oracleId(card.getName()) != null && !PauperLegality.oracleId(card.getName()).equals(row.get("oracleId").getAsString())))) {
                issue(issues, "identity-mismatch", "O identificador da carta não corresponde ao nome informado.", name, section); continue;
            }
            if (card.getRules().isUnsupported()) { issue(issues, "unsupported-card", "Esta carta ainda não é suportada pelo motor de regras.", name, section); continue; }
            pool.add(card, count);
        }
    }

    static PaperCard resolve(String name) {
        var db = StaticData.instance().getCommonCards();
        PaperCard card = db.getCard(TRANSLATED_NAMES.getOrDefault(name.strip().toLowerCase(Locale.ROOT), name));
        if (card == null && name.contains(" // ")) card = db.getCard(name.substring(0, name.indexOf(" // ")));
        if (card == null) return null;
        PaperCard normalized = db.getCard(db.getNormalizedName(card.getName()));
        return normalized == null ? card : normalized;
    }

    private static void checkRules(Deck deck, String format, JsonArray issues) {
        int main = deck.getMain().countAll(), side = deck.getOrCreate(DeckSection.Sideboard).countAll();
        if (main < ("pauper".equals(format) ? 60 : 1))
            issue(issues, "main-too-small", "pauper".equals(format) ? "Pauper exige pelo menos 60 cartas no deck principal." : "Adicione pelo menos uma carta ao deck.", null, "main");
        if (!"pauper".equals(format)) return;
        if (side > 15) issue(issues, "sideboard-too-large", "O sideboard pode ter até 15 cartas.", null, "sideboard");
        GameFormat pauper = FModel.getFormats().getPauper();
        for (var section : new DeckSection[]{DeckSection.Main, DeckSection.Sideboard}) {
            for (var entry : deck.getOrCreate(section)) {
                PaperCard card = entry.getKey();
                String where = section == DeckSection.Main ? "main" : "sideboard";
                if (UNIVERSAL_BANS.contains(card.getName()) || pauper.getBannedCardNames().contains(card.getName()))
                    issue(issues, "banned-card", "Esta carta está banida no Pauper.", card.getName(), where);
                else if (card.getRules().isCustom() || !PauperLegality.permits(card.getName()) || !pauper.getFilterRules().test(card))
                    issue(issues, "wrong-format", "Esta carta não é permitida no Pauper.", card.getName(), where);
            }
        }
        Map<String, Integer> counts = poolCounts(deck);
        for (var entry : counts.entrySet()) {
            PaperCard card = resolve(entry.getKey());
            if (card == null || DeckFormat.canHaveAnyNumberOf(card)) continue;
            Integer exception = DeckFormat.canHaveSpecificNumberInDeck(card);
            int limit = exception == null ? 4 : exception;
            if (entry.getValue() > limit)
                issue(issues, "too-many-copies", "O limite é de " + limit + " cópias entre o deck principal e o sideboard.", card.getName(), null);
        }
        // Keep Forge's construction checks as a backstop for additional engine restrictions.
        String construction = DeckFormat.Constructed.getDeckConformanceProblem(deck);
        String legality = pauper.getDeckConformanceProblem(deck);
        if (issues.isEmpty() && construction != null) issue(issues, "construction", "O deck não atende às regras de construção: " + construction, null, null);
        if (issues.isEmpty() && legality != null) issue(issues, "wrong-format", "O deck contém cartas não permitidas no Pauper: " + legality, null, null);
    }

    static Map<String, Integer> poolCounts(Deck deck) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (var section : new DeckSection[]{DeckSection.Main, DeckSection.Sideboard})
            for (var e : deck.getOrCreate(section))
                out.merge(StaticData.instance().getCommonCards().getNormalizedName(e.getKey().getName()), e.getValue(), Integer::sum);
        return out;
    }

    static JsonArray entries(CardPool pool) {
        JsonArray a = new JsonArray();
        for (var e : pool) {
            JsonObject o = new JsonObject(); o.addProperty("name", e.getKey().getName()); o.addProperty("count", e.getValue());
            String oracleId = PauperLegality.oracleId(e.getKey().getName());
            if (oracleId != null) o.addProperty("oracleId", oracleId);
            a.add(o);
        }
        return a;
    }

    static JsonObject deckJson(Deck deck) {
        JsonObject o = new JsonObject(); o.addProperty("name", deck.getName());
        o.add("cards", entries(deck.getMain())); o.add("sideboard", entries(deck.getOrCreate(DeckSection.Sideboard)));
        return o;
    }

    static void issue(JsonArray issues, String code, String message, String card, String section) {
        JsonObject o = new JsonObject(); o.addProperty("code", code); o.addProperty("message", message);
        if (card != null) o.addProperty("card", card);
        if (section != null) o.addProperty("section", section);
        issues.add(o);
    }

    private static Map<String, String> translatedNames() {
        Path path = Path.of(System.getProperty("forge.dir", System.getProperty("user.home") + "/forge"), "forge-gui", "res", "languages", "cardnames-pt-BR.txt");
        Map<String, String> names = new LinkedHashMap<>();
        if (Files.isRegularFile(path)) try (var lines = Files.lines(path)) {
            lines.forEach(line -> {
                String[] fields = line.split("\\|", 3);
                if (fields.length >= 2 && !fields[1].isBlank()) names.putIfAbsent(fields[1].strip().toLowerCase(Locale.ROOT), fields[0]);
            });
        } catch (java.io.IOException e) { throw new IllegalStateException("Cannot read card translations", e); }
        return Map.copyOf(names);
    }

    private DeckValidation() { }
}
