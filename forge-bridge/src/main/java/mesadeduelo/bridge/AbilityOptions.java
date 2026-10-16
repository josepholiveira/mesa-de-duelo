package mesadeduelo.bridge;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import com.google.gson.JsonArray;
import forge.game.cost.CostPartMana;
import forge.game.cost.CostSacrifice;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityView;
import forge.player.PlayerControllerHuman;

/** The view's effect text omits some alternative costs; keep the actual offered ability's cost visible. */
final class AbilityOptions {
    private AbilityOptions() { }
    private static final Map<String, String> BASIC_LANDS = Map.of(
        "Mountain", "Montanha", "Island", "Ilha", "Forest", "Floresta", "Swamp", "Pântano", "Plains", "Planície");
    private static final Field CACHE;
    static {
        try { CACHE = PlayerControllerHuman.class.getDeclaredField("spellViewCache"); CACHE.setAccessible(true); }
        catch (ReflectiveOperationException e) { throw new ExceptionInInitializerError(e); }
    }

    static void addCosts(PlayerControllerHuman controller, List<Object> options, JsonArray rows) {
        try {
            @SuppressWarnings("unchecked") Map<SpellAbilityView, SpellAbility> abilities =
                (Map<SpellAbilityView, SpellAbility>) CACHE.get(controller);
            if (abilities == null) return;
            for (int i = 0; i < options.size(); i++) {
                SpellAbility ability = abilities.get(options.get(i));
                if (ability == null) continue;
                String cost = cost(ability);
                if (!cost.isBlank()) {
                    var row = rows.get(i).getAsJsonObject();
                    row.addProperty("label", row.get("label").getAsString().trim() + " — Custo: " + cost);
                }
            }
        } catch (IllegalAccessException e) { throw new IllegalStateException(e); }
    }

    static String cost(SpellAbility ability) {
        if (ability.getPayCosts() == null) return "";
        List<String> parts = new ArrayList<>();
        for (var part : ability.getPayCosts().getCostParts()) {
            if (part instanceof CostPartMana mana) {
                if (!mana.getMana().isZero() || ability.getPayCosts().isOnlyManaCost()) parts.add(mana.getMana().toString());
            } else if (part instanceof CostSacrifice sacrifice && BASIC_LANDS.containsKey(sacrifice.getType())
                && sacrifice.getAmount().matches("[0-9]+")) {
                String amount = sacrifice.getAmount(), land = BASIC_LANDS.get(sacrifice.getType());
                parts.add("sacrificar " + amount + " " + land + ("1".equals(amount) ? "" : "s"));
            } else parts.add(part.toString());
        }
        return String.join(", ", parts);
    }
}
