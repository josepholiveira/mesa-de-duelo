/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Compatibility override of Card-Forge AvailableActions, revision
 * 0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53 (Forge Team).
 * Upstream: https://github.com/Card-Forge/forge/blob/0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53/forge-ai/src/main/java/forge/ai/AvailableActions.java
 * Preserve the pinned scan/affordability behavior; evaluate dependent targets on copied chains.
 * The bridge classes/jar MUST precede Forge dependencies on the runtime classpath.
 */
package forge.ai;

import forge.game.GameObject;
import forge.game.card.Card;
import forge.game.card.CardLists;
import forge.game.card.CardView;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.TargetChoices;
import forge.game.spellability.TargetRestrictions;
import forge.game.zone.ZoneType;
import org.tinylog.Logger;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import java.util.stream.Collectors;

// Heuristic: does the player have any playable action this priority window?
// Bounded by timeoutMs; FP-safe on expiry — unvisited cards are marked actionable.
public final class AvailableActions {

    private AvailableActions() {}

    /** sortByCmc: cheap-cost-first so early-exit hits faster.
     *  Battlefield isn't sorted: activation costs are per-ability, not the permanent's CMC. */
    private record ZoneScan(ZoneType zone, boolean sortByCmc) {}

    private static final List<ZoneScan> SCANS = List.of(
            new ZoneScan(ZoneType.Hand,        true),
            new ZoneScan(ZoneType.Battlefield, false),
            new ZoneScan(ZoneType.Flashback,   true));

    /** Boolean form: early-exits on the first actionable card. */
    public static boolean compute(Player player, long timeoutMs) {
        return withAiController(player, () -> !walk(player, timeoutMs, true).isEmpty());
    }

    /** Set form: walks every card so highlight consumers can mark the actionable subset. */
    public static Set<CardView> collectActionable(Player player, long timeoutMs) {
        return withAiController(player, () -> walk(player, timeoutMs, false));
    }

    /** Run the predictive sweep under an AI controller so cost-adjustment chooseX
     *  dispatches don't prompt (mirrors InputPayMana auto-pay). */
    private static <T> T withAiController(Player player, Supplier<T> body) {
        AtomicReference<T> result = new AtomicReference<>();
        player.runWithController(
                () -> result.set(body.get()),
                new PlayerControllerAi(player.getGame(), player, player.getOriginalLobbyPlayer()));
        return result.get();
    }

    private static Set<CardView> walk(Player player, long timeoutMs, boolean earlyExit) {
        long deadlineNanos = System.nanoTime() + timeoutMs * 1_000_000L;
        Set<CardView> actionable = new HashSet<>();
        Set<CardView> visited = new HashSet<>();

        for (ZoneScan scan : SCANS) {
            Iterable<Card> cards = scan.sortByCmc()
                    ? sortedCardsIn(player, scan.zone())
                    : player.getCardsIn(scan.zone());
            for (Card card : cards) {
                if (checkTimeout(deadlineNanos, timeoutMs)) {
                    addUnvisited(actionable, visited, player);
                    return actionable;
                }
                CardView cv = card.getView();
                visited.add(cv);
                if (cardHasActionable(card, player, deadlineNanos)) {
                    actionable.add(cv);
                    if (earlyExit) return actionable;
                }
            }
        }
        return actionable;
    }

    // Land plays come through with no cost, no targets; spells and activated abilities (incl.
    // hand-activations like Channel) all hit the same shape: not a mana ability, affordable, targetable.
    private static boolean cardHasActionable(Card card, Player player, long deadlineNanos) {
        for (SpellAbility sa : card.getAllPossibleAbilities(player, true)) {
            if (!sa.isManaAbility() && canAfford(sa, player)
                    && fullyTargetable(sa, player, deadlineNanos)) {
                return true;
            }
        }
        return false;
    }

    private static boolean fullyTargetable(SpellAbility ability, Player player, long deadlineNanos) {
        boolean dependent = false;
        for (SpellAbility step = ability; step != null; step = step.getSubAbility()) {
            if (step.usesTargeting() && Arrays.stream(step.getTargetRestrictions().getValidTgts())
                    .anyMatch(valid -> valid.contains("ParentTarget"))) dependent = true;
        }
        if (!dependent) return ComputerUtilAbility.isFullyTargetable(ability);

        // LKI copies have detached views. Forge otherwise shares TargetRestrictions on copy,
        // so detach those too before candidate enumeration applies text changes.
        SpellAbility copy = ability.copy(ability.getHostCard(), player, true, true);
        if (copy == null) return true; // Uncertainty must never silently pass a legal action.
        for (SpellAbility step = copy; step != null; step = step.getSubAbility()) {
            if (step.usesTargeting()) {
                TargetRestrictions original = step.getTargetRestrictions();
                TargetRestrictions detached = new TargetRestrictions(original);
                // The pinned Forge copy constructor omits these two restrictions.
                detached.setDifferentNames(original.isDifferentNames());
                detached.setMandatory(original.getMandatory());
                step.setTargetRestrictions(detached);
                step.setTargets(new TargetChoices());
            }
        }
        return targetChain(copy, new TargetBudget(deadlineNanos)) != Feasibility.NO;
    }

    private enum Feasibility { YES, NO, UNKNOWN }
    private static final class TargetBudget {
        final long deadline;
        int remaining = 256;
        TargetBudget(long deadline) { this.deadline = deadline; }
        boolean exhausted() { return --remaining < 0 || System.nanoTime() >= deadline; }
    }

    private static Feasibility targetChain(SpellAbility step, TargetBudget budget) {
        if (step == null) return Feasibility.YES;
        if (budget.exhausted()) return Feasibility.UNKNOWN;
        if (!step.usesTargeting()) return targetChain(step.getSubAbility(), budget);
        List<GameObject> candidates = new ArrayList<>(step.getTargetRestrictions().getAllCandidates(step));
        if (step.getTargetRestrictions().getZone().contains(ZoneType.Stack)) {
            for (var item : step.getHostCard().getGame().getStack()) {
                SpellAbility target = item.getSpellAbility();
                if (step.canTargetSpellAbility(target)) candidates.add(target);
            }
        }
        return chooseTargets(step, candidates, 0, budget);
    }

    private static Feasibility chooseTargets(SpellAbility step, List<GameObject> candidates, int start, TargetBudget budget) {
        if (budget.exhausted()) return Feasibility.UNKNOWN;
        if (step.isTargetNumberValid()) {
            Feasibility next = targetChain(step.getSubAbility(), budget);
            if (next != Feasibility.NO) return next;
        }
        if (!step.canAddMoreTarget()) return Feasibility.NO;
        for (int i = start; i < candidates.size(); i++) {
            if (budget.exhausted()) return Feasibility.UNKNOWN;
            GameObject target = candidates.get(i);
            if (step.getTargets().contains(target)) continue;
            boolean legal = target instanceof SpellAbility spell ? step.canTargetSpellAbility(spell) : step.canTarget(target);
            if (!legal) continue;
            step.getTargets().add(target);
            Feasibility result;
            try { result = chooseTargets(step, candidates, i + 1, budget); }
            finally { step.getTargets().remove(target); }
            if (result != Feasibility.NO) return result;
        }
        return Feasibility.NO;
    }

    /** Timeout fallback: mark only the cards we never got to evaluate (FP-safe).
     *  Cards we visited and ruled out keep their determination. */
    private static void addUnvisited(Set<CardView> actionable, Set<CardView> visited, Player player) {
        for (ZoneScan scan : SCANS) {
            for (Card c : player.getCardsIn(scan.zone())) {
                CardView cv = c.getView();
                if (!visited.contains(cv)) actionable.add(cv);
            }
        }
    }

    // Sort cheap cards first so cheap-to-validate matches early-exit
    private static Iterable<Card> sortedCardsIn(Player player, ZoneType zone) {
        return player.getCardsIn(zone).stream().sorted(CardLists.CmcComparator).collect(Collectors.toList());
    }

    private static boolean canAfford(SpellAbility sa, Player player) {
        if (sa.getPayCosts() == null || !sa.getPayCosts().hasManaCost()) {
            return true;
        }
        // TODO include RemoveDeck:All when they weren't used
        return ComputerUtilMana.canPayManaCost(sa, player, 0, false);
    }

    private static boolean checkTimeout(long deadlineNanos, long timeoutMs) {
        if (System.nanoTime() < deadlineNanos) {
            return false;
        }
        Logger.warn("AvailableActions: heuristic timed out after {}ms; returning true.", timeoutMs);
        return true;
    }
}
