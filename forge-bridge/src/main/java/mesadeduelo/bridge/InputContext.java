package mesadeduelo.bridge;

import java.lang.reflect.Field;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.ability.ApiType;
import forge.game.GameEntity;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.combat.Combat;
import forge.game.combat.CombatUtil;
import forge.game.keyword.Keyword;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputBlock;
import forge.gamemodes.match.input.InputAttack;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputSelectEntitiesFromList;
import forge.gamemodes.match.input.InputSelectManyBase;

/** Typed context for the pinned Forge inputs whose public API omits their selection state. */
final class InputContext {
    private InputContext() { }
    private static final Field ATTACK_COMBAT = field(InputAttack.class, "combat");
    private static final Field ATTACK_PLAYER = field(InputAttack.class, "playerAttacks");
    private static final Field ATTACKER = field(InputBlock.class, "currentAttacker");
    private static final Field COMBAT = field(InputBlock.class, "combat");
    private static final Field DEFENDER = field(InputBlock.class, "defender");
    private static final Field CONFIRM_ABILITY = field(InputConfirm.class, "sa");
    private static final Field CONFIRM_CARD = field(InputConfirm.class, "card");
    private static final Field SELECT_MIN = field(InputSelectManyBase.class, "min");
    private static final Field SELECT_MAX = field(InputSelectManyBase.class, "max");

    private static Field field(Class<?> type, String name) {
        try { Field field = type.getDeclaredField(name); field.setAccessible(true); return field; }
        catch (ReflectiveOperationException e) { throw new ExceptionInInitializerError(e); }
    }
    private static Object value(Field field, Object input) {
        try { return field.get(input); }
        catch (IllegalAccessException e) { throw new IllegalStateException(e); }
    }

    static JsonObject suspendCast(Object input) {
        if (!(input instanceof InputConfirm)) return null;
        SpellAbility ability = (SpellAbility) value(CONFIRM_ABILITY, input);
        CardView card = (CardView) value(CONFIRM_CARD, input);
        if (ability == null || card == null || ability.getApi() != ApiType.Play
            || ability.getTrigger() == null || !ability.getTrigger().isKeyword(Keyword.SUSPEND)) return null;
        JsonObject result = new JsonObject(); result.add("card", StateJson.card(card)); return result;
    }

    /** Card choices only: counter allocation and player selection have different counting semantics. */
    static JsonObject selection(Object input) {
        if (!(input instanceof InputSelectEntitiesFromList<?> select)) return null;
        for (var choice : select.getValidChoices()) if (!(choice instanceof Card)) return null;
        JsonObject result = new JsonObject(); JsonArray cards = new JsonArray();
        for (var choice : select.getSelected()) if (choice instanceof Card card) cards.add(card.getId());
        result.add("cards", cards);
        result.addProperty("min", (Integer) value(SELECT_MIN, input));
        result.addProperty("max", (Integer) value(SELECT_MAX, input));
        return result;
    }

    static java.util.Set<Integer> playerChoices(Object input) {
        if (!(input instanceof InputSelectEntitiesFromList<?> select)) return java.util.Set.of();
        java.util.Set<Integer> players = new java.util.LinkedHashSet<>();
        for (var choice : select.getValidChoices()) {
            if (!(choice instanceof Player player)) return java.util.Set.of();
            players.add(player.getId());
        }
        return players;
    }

    static JsonObject attacking(Object input) {
        if (!(input instanceof InputAttack)) return null;
        Combat combat = (Combat) value(ATTACK_COMBAT, input);
        Player player = (Player) value(ATTACK_PLAYER, input);
        JsonObject result = new JsonObject();
        JsonArray attackers = new JsonArray(), defenders = new JsonArray(), assignments = new JsonArray();
        for (GameEntity defender : combat.getDefenders()) defenders.add(defenderJson(defender));
        for (Card attacker : player.getCreaturesInPlay()) {
            JsonArray legal = new JsonArray();
            for (GameEntity defender : combat.getDefenders())
                if (combat.isAttacking(attacker, defender) || CombatUtil.canAttack(attacker, defender)) legal.add(defenderJson(defender));
            if (!legal.isEmpty()) {
                attackers.add(attacker.getId()); JsonObject row = new JsonObject();
                row.addProperty("attacker", attacker.getId()); row.add("defenders", legal); assignments.add(row);
            }
        }
        result.add("attackers", attackers); result.add("defenders", defenders); result.add("legalAssignments", assignments);
        return result;
    }

    private static JsonObject defenderJson(GameEntity defender) {
        JsonObject row = new JsonObject(); row.addProperty("id", defender.getId());
        row.addProperty("kind", defender instanceof Player ? "player" : "card"); return row;
    }

    static boolean assignAttack(Object input, int attackerId, int defenderId, String kind) {
        if (!(input instanceof InputAttack attack) || !("player".equals(kind) || "card".equals(kind))) return false;
        Combat combat = (Combat) value(ATTACK_COMBAT, input);
        Player player = (Player) value(ATTACK_PLAYER, input);
        Card attacker = null; GameEntity defender = null;
        for (Card card : player.getCreaturesInPlay()) if (card.getId() == attackerId) attacker = card;
        for (GameEntity candidate : combat.getDefenders())
            if (candidate.getId() == defenderId && (candidate instanceof Player) == "player".equals(kind)) defender = candidate;
        if (attacker == null || defender == null || !(combat.isAttacking(attacker, defender) || CombatUtil.canAttack(attacker, defender))) return false;
        if (defender instanceof Player target) attack.selectPlayer(target, null);
        else if (!attack.selectCard((Card) defender, null, null)) return false;
        return attack.selectCard(attacker, null, null);
    }

    /** Bulk selection is explicit: never redirect an ineligible creature to a different defender. */
    static boolean assignAllAttackers(Object input, int defenderId, String kind) {
        if (!(input instanceof InputAttack attack) || !("player".equals(kind) || "card".equals(kind))) return false;
        Combat combat = (Combat) value(ATTACK_COMBAT, input);
        if (!combat.getAttackers().isEmpty()) return false;
        Player player = (Player) value(ATTACK_PLAYER, input);
        GameEntity defender = null;
        for (GameEntity candidate : combat.getDefenders())
            if (candidate.getId() == defenderId && (candidate instanceof Player) == "player".equals(kind)) defender = candidate;
        if (defender == null) return false;
        java.util.List<Card> legal = new java.util.ArrayList<>();
        for (Card attacker : player.getCreaturesInPlay()) if (CombatUtil.canAttack(attacker, defender)) legal.add(attacker);
        if (legal.isEmpty()) return false;
        if (defender instanceof Player target) attack.selectPlayer(target, null);
        else if (!attack.selectCard((Card) defender, null, null)) return false;
        for (Card attacker : legal) attack.selectCard(attacker, null, null);
        return !combat.getAttackers().isEmpty();
    }

    static JsonObject blocking(Object input) {
        if (!(input instanceof InputBlock)) return null;
        Combat combat = (Combat) value(COMBAT, input);
        Player defender = (Player) value(DEFENDER, input);
        Card selected = (Card) value(ATTACKER, input);
        JsonObject result = new JsonObject();
        result.addProperty("selectedAttacker", selected == null ? null : selected.getId());
        JsonArray attackers = new JsonArray(), blockers = new JsonArray(), assignments = new JsonArray();
        for (Card attacker : combat.getAttackers())
            if (defender.equals(combat.getDefenderPlayerByAttacker(attacker))) attackers.add(attacker.getId());
        for (Card blocker : defender.getCreaturesInPlay()) {
            JsonArray legal = new JsonArray();
            for (Card attacker : combat.getAttackers())
                if (validPair(combat, defender, attacker, blocker)) legal.add(attacker.getId());
            if (!legal.isEmpty()) {
                blockers.add(blocker.getId());
                JsonObject row = new JsonObject(); row.addProperty("blocker", blocker.getId());
                row.add("attackers", legal); assignments.add(row);
            }
        }
        result.add("attackers", attackers); result.add("blockers", blockers);
        result.add("legalAssignments", assignments); return result;
    }

    private static boolean validPair(Combat combat, Player defender, Card attacker, Card blocker) {
        return attacker != null && blocker != null && combat.isAttacking(attacker)
            && defender.equals(combat.getDefenderPlayerByAttacker(attacker))
            && defender.equals(blocker.getController()) && blocker.isCreature()
            && defender.getZone(ZoneType.Battlefield).contains(blocker)
            && (combat.isBlocking(blocker, attacker) || CombatUtil.canBlock(attacker, blocker, combat));
    }

    /** Select and toggle the exact pair together on the dispatcher, after the Session generation guard. */
    static boolean assignBlock(Object input, int attackerId, int blockerId) {
        if (!(input instanceof InputBlock block)) return false;
        Combat combat = (Combat) value(COMBAT, input); Player defender = (Player) value(DEFENDER, input);
        Card attacker = null, blocker = null;
        for (Card card : combat.getAttackers()) if (card.getId() == attackerId) attacker = card;
        for (Card card : defender.getCreaturesInPlay()) if (card.getId() == blockerId) blocker = card;
        if (!validPair(combat, defender, attacker, blocker)) return false;
        return block.selectCard(attacker, null, null) && block.selectCard(blocker, null, null);
    }
}
