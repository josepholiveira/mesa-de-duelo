package mesadeduelo.bridge;

import java.util.LinkedHashMap;
import java.util.Map;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.deck.Deck;

/** Os mesmos decks padrão do frontend (src/decks.ts). */
final class Decks {
    private Decks() { }

    static final Map<String, String[][]> LISTS = new LinkedHashMap<>();
    static {
        LISTS.put("vermelho", new String[][] {
            {"Mountain", "17"}, {"Raging Goblin", "4"}, {"Goblin Piker", "3"}, {"Boggart Brute", "3"},
            {"Hill Giant", "3"}, {"Fire Elemental", "2"}, {"Shock", "4"}, {"Lightning Strike", "2"},
            {"Volcanic Hammer", "1"}, {"Lava Axe", "1"},
        });
        LISTS.put("verde", new String[][] {
            {"Forest", "17"}, {"Llanowar Elves", "3"}, {"Grizzly Bears", "3"}, {"Deadly Recluse", "2"},
            {"Elvish Visionary", "2"}, {"Centaur Courser", "3"}, {"Trained Armodon", "2"}, {"Giant Spider", "2"},
            {"Colossal Dreadmaw", "2"}, {"Craw Wurm", "1"}, {"Giant Growth", "2"}, {"Prey Upon", "1"},
        });
        LISTS.put("azorius", new String[][] {
            {"Plains", "8"}, {"Island", "7"}, {"Azorius Guildgate", "2"}, {"Suntail Hawk", "3"},
            {"Healer's Hawk", "2"}, {"Savannah Lions", "3"}, {"Youthful Knight", "3"}, {"Glory Seeker", "2"},
            {"Wind Drake", "3"}, {"Tolarian Scholar", "2"}, {"Inspiring Cleric", "2"}, {"Air Elemental", "1"},
            {"Serra Angel", "1"}, {"Divination", "1"},
        });
        LISTS.put("auras", new String[][] {
            {"Plains", "18"}, {"Optimistic Scavenger", "4"}, {"Spellbook Vendor", "4"}, {"Knight of Grace", "3"},
            {"Unflinching Hortimancer", "3"}, {"Cult Healer", "3"}, {"Archon of the Wild Rose", "2"},
            {"Ethereal Armor", "4"}, {"Sheltered by Ghosts", "4"}, {"Feather of Flight", "4"}, {"Shardmage's Rescue", "3"},
            {"Twinblade Blessing", "2"}, {"Super-Soldier Serum", "2"}, {"Angelic Destiny", "2"}, {"Dimensional Exile", "2"},
        });
        LISTS.put("izzet", new String[][] {
            {"Island", "6"}, {"Steam Vents", "4"}, {"Spirebluff Canal", "4"}, {"Riverpyre Verge", "4"},
            {"Multiversal Passage", "1"}, {"Stormcarved Coast", "1"}, {"Sunderflock", "4"}, {"Hearth Elemental", "4"},
            {"Eddymurk Crab", "4"}, {"Opt", "4"}, {"Sleight of Hand", "4"}, {"Prismari Charm", "4"},
            {"Burst Lightning", "3"}, {"Traumatic Critique", "3"}, {"Flow State", "2"}, {"Get Out", "2"},
            {"Impractical Joke", "2"}, {"Spell Pierce", "2"}, {"Winternight Stories", "2"},
        });
        LISTS.put("landfall", new String[][] {
            {"Forest", "14"}, {"Fabled Passage", "4"}, {"Ba Sing Se", "3"}, {"Escape Tunnel", "4"},
            {"Sapling Nursery", "4"}, {"Demolition Field", "1"}, {"Llanowar Elves", "4"}, {"Icetill Explorer", "4"},
            {"Sazh's Chocobo", "4"}, {"Mightform Harmonizer", "3"}, {"Keen-Eyed Curator", "2"},
            {"Surrak, Elusive Hunter", "1"}, {"Earthbender Ascension", "4"}, {"Esper Origins", "4"},
            {"Shared Roots", "2"}, {"Lumbering Worldwagon", "1"}, {"Meltstrider's Resolve", "1"},
        });
        LISTS.put("dimir", new String[][] {
            {"Island", "4"}, {"Swamp", "4"}, {"Watery Grave", "4"}, {"Gloomlake Verge", "4"}, {"Hidden Lair", "3"},
            {"Restless Reef", "2"}, {"Soulstone Sanctuary", "2"}, {"Floodpits Drowner", "4"}, {"Spyglass Siren", "4"},
            {"Dream Beavers", "4"}, {"Enduring Curiosity", "3"}, {"Tishana's Tidebinder", "2"},
            {"The Wondrous Wasp", "2"}, {"Wan Shi Tong, Librarian", "2"}, {"Kaito, Bane of Nightmares", "4"},
            {"Requiting Hex", "4"}, {"Bitter Triumph", "2"}, {"Shoot the Sheriff", "2"}, {"We Say Thee Nay!", "2"},
            {"Spell Pierce", "1"}, {"Spell Snare", "1"},
        });
        LISTS.put("ninjas", new String[][] {
            {"Island", "5"}, {"Swamp", "5"}, {"Watery Grave", "4"}, {"Gloomlake Verge", "4"}, {"Hidden Lair", "2"},
            {"Restless Reef", "2"}, {"Spyglass Siren", "4"}, {"Spectral Sailor", "3"}, {"Faerie Dreamthief", "2"},
            {"Silent Hallcreeper", "4"}, {"Shoreline Looter", "3"}, {"Malcolm, Alluring Scoundrel", "2"},
            {"Splinter, Hamato Yoshi", "3"}, {"Oroku Saki, Shredder Rising", "4"},
            {"Elektra, Daughter of the Hand", "2"}, {"Shredder, Unrelenting", "1"},
            {"Kaito, Bane of Nightmares", "3"}, {"Shredder's Technique", "3"}, {"Donatello's Technique", "3"},
            {"Splinter's Technique", "1"},
        });
        LISTS.put("coelhos", new String[][] {
            {"Plains", "20"}, {"Patchwork Banner", "3"}, {"Gideon's Memorial", "2"},
            {"Hare Apparent", "14"}, {"Valley Questcaller", "4"}, {"Harvestrite Host", "3"},
            {"Warren Warleader", "2"}, {"Elspeth, Storm Slayer", "4"},
            {"Caretaker's Talent", "3"}, {"Hop to It", "2"}, {"Get Lost", "3"},
        });
    }

    /** Aceita o id de um deck padrão ou {name, cards:[{name, count}]} enviado pelo frontend. */
    static Deck fromJson(JsonElement e, String fallback) {
        if (e == null || e.isJsonNull()) return build(fallback);
        if (e.isJsonPrimitive()) return build(e.getAsString());
        JsonObject o = e.getAsJsonObject();
        Deck deck = new Deck(o.has("name") ? o.get("name").getAsString() : "Deck");
        for (JsonElement c : o.getAsJsonArray("cards")) {
            JsonObject entry = c.getAsJsonObject();
            deck.getMain().add(entry.get("name").getAsString(), entry.get("count").getAsInt());
        }
        if (deck.getMain().countAll() == 0) throw new IllegalArgumentException("Deck vazio: " + deck.getName());
        return deck;
    }

    static Deck build(String id) {
        String[][] list = LISTS.get(id);
        if (list == null) throw new IllegalArgumentException("Deck desconhecido: " + id + " (use " + LISTS.keySet() + ")");
        Deck deck = new Deck(id);
        for (String[] e : list) deck.getMain().add(e[0], Integer.parseInt(e[1]));
        return deck;
    }
}
