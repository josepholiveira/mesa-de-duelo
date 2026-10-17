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
            o.addProperty("commanderCount", deck.getOrCreate(DeckSection.Commander).countAll());
            o.addProperty("sideboardCount", deck.getOrCreate(DeckSection.Sideboard).countAll());
            MatchConfig.versions(o);
            if (valid()) o.add("deck", deckJson(deck));
            return o;
        }
    }

    static Result validate(JsonElement payload, String format) {
        if (!Set.of("free", "pauper", "commander").contains(format)) throw new IllegalArgumentException("Formato não suportado.");
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
        readSection(o.get("commanders"), deck.getOrCreate(DeckSection.Commander), "commander", issues, false);
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
                || (oracleId(card.getName()) != null && !oracleId(card.getName()).equals(row.get("oracleId").getAsString())))) {
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
        if ("commander".equals(format)) { checkCommander(deck, issues); return; }
        if (deck.getOrCreate(DeckSection.Commander).countAll() > 0)
            issue(issues, "wrong-section", "A zona de comando exige o formato Commander.", null, "commander");
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

    private static void checkCommander(Deck deck, JsonArray issues) {
        CardPool commanders = deck.getOrCreate(DeckSection.Commander);
        int commanderCount = commanders.countAll();
        if (commanderCount < 1 || commanderCount > 2)
            issue(issues, "commander-count", "Escolha um comandante ou dois com uma parceria válida.", null, "commander");
        if (deck.getMain().countAll() + commanderCount != 100)
            issue(issues, "total-count", "Commander exige exatamente 100 cartas, incluindo os comandantes.", null, "main");
        if (deck.getOrCreate(DeckSection.Sideboard).countAll() != 0)
            issue(issues, "sideboard-not-supported", "Commander não usa sideboard nesta mesa. Companheiros ainda não são suportados.", null, "sideboard");
        byte identity = 0;
        for (var e : commanders) {
            var rules = e.getKey().getRules();
            identity |= rules.getColorIdentity().getColor();
            if (e.getValue() != 1 || !DeckFormat.Commander.isLegalCommander(rules) || (commanderCount == 1 && rules.canBeBackground()))
                issue(issues, "invalid-commander", "Esta carta não pode ocupar esta posição de comandante.", e.getKey().getName(), "commander");
            if (rules.getAddsWildCardColor() || rules.getDeckRules().iterator().hasNext())
                issue(issues, "unsupported-commander-choice", "Comandantes com escolhas extras de cor ou regras especiais de construção ainda não são suportados nesta mesa.", e.getKey().getName(), "commander");
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (var section : new DeckSection[]{DeckSection.Main, DeckSection.Commander, DeckSection.Sideboard}) {
            String where = section == DeckSection.Main ? "main" : section == DeckSection.Commander ? "commander" : "sideboard";
            for (var e : deck.getOrCreate(section)) {
                PaperCard card = e.getKey();
                counts.merge(StaticData.instance().getCommonCards().getNormalizedName(card.getName()), e.getValue(), Integer::sum);
                if (UNIVERSAL_BANS.contains(card.getName()) || FModel.getFormats().get("Commander").getBannedCardNames().contains(card.getName()))
                    issue(issues, "banned-card", "Esta carta está banida em Commander.", card.getName(), where);
                else if (card.getRules().isCustom() || !CommanderLegality.permits(card.getName()) || !DeckFormat.Commander.isLegalCard(card))
                    issue(issues, "wrong-format", "Esta carta não é permitida em Commander.", card.getName(), where);
                if (!card.getRules().getColorIdentity().hasNoColorsExcept(identity))
                    issue(issues, "color-identity", "A identidade de cor desta carta está fora da identidade dos comandantes.", card.getName(), where);
            }
        }
        for (var e : counts.entrySet()) {
            PaperCard card = resolve(e.getKey());
            if (card != null && e.getValue() > DeckFormat.Commander.getMaxCardCopies(card))
                issue(issues, "too-many-copies", "Commander permite uma cópia de cada carta, salvo terrenos básicos e exceções do texto Oracle.", card.getName(), null);
        }
        String problem = DeckFormat.Commander.getDeckConformanceProblem(deck);
        if (problem != null) issue(issues, "commander-construction", "Confira os comandantes, a parceria e a construção do deck: " + problem, null, null);
    }

    static Map<String, Integer> poolCounts(Deck deck) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (var section : new DeckSection[]{DeckSection.Main, DeckSection.Sideboard})
            for (var e : deck.getOrCreate(section))
                out.merge(StaticData.instance().getCommonCards().getNormalizedName(e.getKey().getName()), e.getValue(), Integer::sum);
        return out;
    }

    private static String oracleId(String name) {
        String id = PauperLegality.oracleId(name);
        return id != null ? id : CommanderLegality.oracleId(name);
    }

    static JsonArray entries(CardPool pool) {
        JsonArray a = new JsonArray();
        for (var e : pool) {
            JsonObject o = new JsonObject(); o.addProperty("name", e.getKey().getName()); o.addProperty("count", e.getValue());
            String oracleId = oracleId(e.getKey().getName());
            if (oracleId != null) o.addProperty("oracleId", oracleId);
            a.add(o);
        }
        return a;
    }

    static JsonObject deckJson(Deck deck) {
        JsonObject o = new JsonObject(); o.addProperty("name", deck.getName());
        o.add("cards", entries(deck.getMain())); o.add("sideboard", entries(deck.getOrCreate(DeckSection.Sideboard)));
        o.add("commanders", entries(deck.getOrCreate(DeckSection.Commander)));
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
