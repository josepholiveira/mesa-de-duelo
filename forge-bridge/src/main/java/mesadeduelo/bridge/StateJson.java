package mesadeduelo.bridge;

import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.ImageKeys;
import forge.StaticData;
import forge.card.CardEdition;
import forge.card.MagicColor;
import forge.game.Game;
import forge.game.GameEntityView;
import forge.game.GameLogEntry;
import forge.game.GameView;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.card.CardView.CardStateView;
import forge.game.card.CounterType;
import forge.game.combat.CombatView;
import forge.game.keyword.KeywordView;
import forge.game.player.PlayerView;
import forge.game.spellability.StackItemView;
import forge.game.zone.ZoneType;

/** Converte as views do Forge no JSON que o frontend consome. */
final class StateJson {
    private StateJson() { }

    private static final String[] COLOR_KEYS = {"W", "U", "B", "R", "G"};

    /**
     * @param viewer id do jogador que está vendo; a mão dos outros vai só como contagem. -1 mostra tudo.
     * @param game a partida por trás das views, para ler o poder/resistência base; pode ser null.
     */
    static JsonObject game(GameView gv, int viewer, Game game) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "state");
        o.addProperty("turn", gv.getTurn());
        o.addProperty("phase", gv.getPhase() == null ? null : gv.getPhase().name());
        PlayerView active = gv.getPlayerTurn();
        o.addProperty("activePlayer", active == null ? null : active.getId());
        o.addProperty("gameOver", gv.isGameOver());
        if (gv.isGameOver()) o.addProperty("winner", gv.getWinningPlayerName());

        JsonArray players = new JsonArray();
        for (PlayerView p : gv.getPlayers()) players.add(player(p, viewer == -1 || viewer == p.getId(), game));
        o.add("players", players);

        JsonArray stack = new JsonArray();
        if (gv.getStack() != null) {
            for (StackItemView si : gv.getStack()) {
                JsonObject s = new JsonObject();
                s.addProperty("id", si.getId());
                s.addProperty("text", si.getText());
                if (si.getSourceCard() != null) s.add("source", card(si.getSourceCard()));
                if (si.getActivatingPlayer() != null) s.addProperty("controller", si.getActivatingPlayer().getId());
                stack.add(s);
            }
        }
        o.add("stack", stack);

        JsonArray combat = new JsonArray();
        CombatView cv = gv.getCombat();
        if (cv != null) {
            for (CardView att : cv.getAttackers()) {
                JsonObject c = new JsonObject();
                c.addProperty("attacker", att.getId());
                GameEntityView def = cv.getDefender(att);
                if (def != null) c.addProperty("defender", def.getId());
                JsonArray blockers = new JsonArray();
                if (cv.getBlockers(att) != null) for (CardView b : cv.getBlockers(att)) blockers.add(b.getId());
                c.add("blockers", blockers);
                combat.add(c);
            }
        }
        o.add("combat", combat);

        JsonArray log = new JsonArray();
        if (gv.getGameLog() != null) {
            List<GameLogEntry> entries = gv.getGameLog().getLogEntries(null);
            for (int i = 0; i < Math.min(40, entries.size()); i++) log.add(entries.get(i).message());
        }
        o.add("log", log);
        return o;
    }

    static JsonObject player(PlayerView p, boolean showHand, Game game) {
        JsonObject o = new JsonObject();
        o.addProperty("id", p.getId());
        o.addProperty("name", p.getLobbyPlayerName());
        o.addProperty("ai", p.isAI());
        o.addProperty("life", p.getLife());
        o.addProperty("library", p.getZoneSize(ZoneType.Library));
        o.addProperty("handCount", p.getZoneSize(ZoneType.Hand));
        o.add("hand", showHand ? cards(p.getHand(), game) : new JsonArray());
        o.add("battlefield", cards(p.getBattlefield(), game));
        o.add("graveyard", cards(p.getGraveyard(), game));
        o.add("exile", cards(p.getExile(), game));
        // Zona de comando: só os emblemas (os efeitos temporários do Forge também moram lá).
        JsonArray emblems = new JsonArray();
        for (CardView c : nzv(p.getCommand())) if (c.isEmblem()) emblems.add(card(c, game));
        o.add("emblems", emblems);
        JsonObject pool = new JsonObject();
        for (int i = 0; i < 5; i++) pool.addProperty(COLOR_KEYS[i], p.getMana(MagicColor.WUBRG[i]));
        pool.addProperty("C", p.getMana(MagicColor.COLORLESS));
        o.add("pool", pool);
        return o;
    }

    private static Iterable<CardView> nzv(Iterable<CardView> it) { return it == null ? java.util.List.of() : it; }

    static JsonArray cards(Iterable<CardView> cs, Game game) {
        JsonArray a = new JsonArray();
        if (cs != null) for (CardView c : cs) a.add(card(c, game));
        return a;
    }

    static JsonObject card(CardView c) {
        return card(c, null);
    }

    /** Imagens de ficha já resolvidas, por chave de imagem do Forge (null = sem imagem conhecida). */
    private static final Map<String, String> TOKEN_IMAGES = new java.util.concurrent.ConcurrentHashMap<>();

    /**
     * Endereço da imagem de uma ficha no Scryfall, como o ImageFetcher do Forge calcula: a chave
     * "t:nome|SET|número" aponta para o número da ficha na coleção de fichas do SET (ex.: tblb/3).
     * Sem número, vale a primeira ficha com esse nome na coleção.
     */
    static String tokenImage(CardStateView s) {
        String key;
        try { key = s.getImageKey(null); } catch (RuntimeException e) { return null; }
        if (key == null || !key.startsWith(ImageKeys.TOKEN_PREFIX)) return null;
        String cached = TOKEN_IMAGES.get(key);
        if (cached != null) return cached.isEmpty() ? null : cached;
        String url = null;
        String tmp = key.substring(ImageKeys.TOKEN_PREFIX.length());
        boolean back = tmp.endsWith(ImageKeys.BACKFACE_POSTFIX);
        if (back) tmp = tmp.substring(0, tmp.length() - ImageKeys.BACKFACE_POSTFIX.length());
        String[] parts = tmp.split("\\|");
        CardEdition edition = parts.length > 1 ? StaticData.instance().getEditions().get(parts[1]) : null;
        if (edition != null && edition.getType() != CardEdition.Type.CUSTOM_SET) {
            String number = parts.length > 2 ? parts[2] : null;
            if (number == null) {
                for (CardEdition.EditionEntry e : edition.getTokens().get(parts[0])) {
                    if (e.collectorNumber() != null && !e.collectorNumber().isEmpty()) { number = e.collectorNumber(); break; }
                }
            }
            if (number != null) {
                if (number.endsWith("☇")) { back = true; number = number.substring(0, number.length() - 1); }
                url = "https://api.scryfall.com/cards/" + edition.getTokensCode() + "/"
                        + java.net.URLEncoder.encode(number, java.nio.charset.StandardCharsets.UTF_8)
                        + "?format=image&version=normal" + (back ? "&face=back" : "");
            }
        }
        TOKEN_IMAGES.put(key, url == null ? "" : url);
        return url;
    }

    static JsonObject card(CardView c, Game game) {
        JsonObject o = new JsonObject();
        o.addProperty("id", c.getId());
        if (c.getController() != null) o.addProperty("controller", c.getController().getId());
        o.addProperty("tapped", c.isTapped());
        o.addProperty("token", c.isToken());
        if (c.isFaceDown()) {
            o.addProperty("faceDown", true);
            return o;
        }
        CardStateView s = c.getCurrentState();
        o.addProperty("name", s.getName());
        if (c.isToken()) {
            String img = tokenImage(s);
            if (img != null) o.addProperty("image", img);
        }
        o.addProperty("set", s.getSetCode());
        String cost = s.getManaCost() == null ? "" : s.getManaCost().toString();
        o.addProperty("manaCost", "no cost".equals(cost) ? "" : cost);
        o.addProperty("typeLine", s.getType() == null ? "" : s.getType().toString());
        // Emblemas não têm texto Oracle: o texto vem das habilidades que o efeito carrega.
        o.addProperty("text", c.isEmblem() ? c.getText().replace("\r", "").trim() : s.getOracleText());
        if (c.isEmblem()) o.addProperty("emblem", true);
        o.addProperty("creature", s.isCreature());
        o.addProperty("land", s.isLand());
        if (s.isPlaneswalker()) o.addProperty("planeswalker", true);
        // Auras e equipamentos: a carta a que estão presos (ou o jogador, no caso de auras como Curse).
        if (c.getAttachedTo() != null) o.addProperty("attachedTo", c.getAttachedTo().getId());
        else if (c.getEnchantedPlayer() != null) o.addProperty("attachedToPlayer", c.getEnchantedPlayer().getId());
        // Cópias (Clone etc.): o nome impresso da carta que está copiando outra.
        if (c.isCloned() && c.getBackup() != null && !s.getName().equals(c.getBackup().getName())) {
            o.addProperty("copyOf", c.getBackup().getName());
        }
        if (s.isCreature()) {
            o.addProperty("power", s.getPower());
            o.addProperty("toughness", s.getToughness());
            // Base sem bônus, marcadores nem efeitos: o frontend pinta o P/T de verde ou vermelho quando difere.
            Card gc = game == null ? null : game.findByView(c);
            if (gc != null) {
                o.addProperty("basePower", gc.getBasePower());
                o.addProperty("baseToughness", gc.getBaseToughness());
            }
            o.addProperty("damage", c.getDamage());
            o.addProperty("sick", c.isSick());
            o.addProperty("attacking", c.isAttacking());
            o.addProperty("blocking", c.isBlocking());
        }
        // Palavras-chave atuais, inclusive as ganhas por efeitos (Voar da Elspeth, por exemplo).
        if (s.getKeywords() != null && !s.getKeywords().isEmpty()) {
            JsonArray kws = new JsonArray();
            java.util.Set<String> seen = new java.util.LinkedHashSet<>();
            for (KeywordView k : s.getKeywords()) if (k.keyword() != null && seen.add(k.keyword().name())) kws.add(k.keyword().name());
            o.add("keywords", kws);
        }
        Map<CounterType, Integer> counters = c.getCounters() == null ? null : toMap(c);
        if (counters != null && !counters.isEmpty()) {
            JsonObject co = new JsonObject();
            counters.forEach((k, v) -> co.addProperty(k.toString(), v));
            o.add("counters", co);
        }
        return o;
    }

    private static Map<CounterType, Integer> toMap(CardView c) {
        Map<CounterType, Integer> m = new java.util.LinkedHashMap<>();
        for (CounterType t : c.getCounters().elementSet()) m.put(t, c.getCounters().count(t));
        return m;
    }
}
