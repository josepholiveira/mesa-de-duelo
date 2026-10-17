package mesadeduelo.bridge;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import forge.game.Game;
import forge.game.GameStage;
import forge.game.GameEndReason;
import forge.gui.FThreads;
import forge.gui.GuiBase;
import forge.player.PlayerControllerHuman;
import forge.gamemodes.match.input.InputConfirmMulligan;
import forge.gamemodes.match.input.InputSelectManyBase;
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gamemodes.match.input.InputSynchronized;

/** Requests cross threads; only the game execution path applies lifecycle mutations. */
final class MatchLifecycle {
    private final ConcurrentHashMap<Game, Set<Integer>> concessions = new ConcurrentHashMap<>();
    private final Consumer<Game> changed;
    private volatile boolean cancelled;
    private final ThreadLocal<Boolean> draining = ThreadLocal.withInitial(() -> false);

    MatchLifecycle() { this(game -> { }); }
    MatchLifecycle(Consumer<Game> changed) { this.changed = changed; }
    void requestStop() { cancelled = true; }
    boolean cancelled() { return cancelled; }
    void requestConcede(Game game, int playerId) {
        concessions.computeIfAbsent(game, ignored -> ConcurrentHashMap.newKeySet()).add(playerId);
    }
    boolean isConceding(Game game, int playerId) {
        return concessions.getOrDefault(game, Set.of()).contains(playerId);
    }

    void pump(Game game) {
        if (game == null || game.isGameOver() || draining.get()) return;
        if (!cancelled && concessions.getOrDefault(game, Set.of()).isEmpty()) return;
        draining.set(true);
        try {
            if (GuiBase.getInterface() instanceof HeadlessGui headless)
                headless.runGameMutation(() -> pumpNow(game));
            else pumpNow(game);
        } finally { draining.remove(); }
    }

    private void pumpNow(Game game) {
        if (game.isGameOver()) return;
        if (cancelled) {
            // Setup holds live player iterators. Ending the game must not remove their entries.
            game.setGameOver(GameEndReason.AllHumansLost);
            changed.accept(game);
            return;
        }
        Set<Integer> requested = concessions.getOrDefault(game, Set.of());
        boolean pending = false;
        for (var player : game.getRegisteredPlayers()) if (requested.contains(player.getId())) {
            if (!player.conceded()) player.concede();
            if (game.getPlayers().contains(player)) pending = true;
        }
        // Pregame code iterates the live collection across human decisions. Native state-based
        // actions remove conceded players after opening; while playing, this is a safe wait point.
        if (pending && game.getAge() == GameStage.Play) {
            game.getAction().checkGameOverCondition();
            changed.accept(game);
        }
    }

    private void finishAbandonedInput(Game game, int playerId) {
        var player = game.getRegisteredPlayers().stream().filter(p -> p.getId() == playerId).findFirst().orElse(null);
        if (player == null || !(player.getController() instanceof PlayerControllerHuman human)) return;
        var input = human.getInputQueue().getInput();
        if (input == null) return;
        FThreads.invokeInEdtAndWait(() -> {
            if (human.getInputQueue().getInput() != input) return;
            // Empty target results make Forge retry recursively, even after game-over. Complete
            // the native cancellation flags as well as the latch, and remove the finished input.
            if (input instanceof InputSelectTargets || input instanceof InputSelectManyBase<?>) input.selectButtonCancel();
            else if (input instanceof InputConfirmMulligan) input.selectButtonOK();
            if (human.getInputQueue().getInput() == input && input instanceof InputSynchronized synchronizedInput)
                synchronizedInput.stop();
        });
    }

    void awaitInput(Game game, int playerId, CountDownLatch done) throws InterruptedException {
        do {
            pump(game);
            if (cancelled || game.isGameOver() || isConceding(game, playerId)) {
                if (!cancelled && !game.isGameOver() && game.getAge() == GameStage.BeforeMulligan) {
                    var player = game.getRegisteredPlayers().stream().filter(p -> p.getId() == playerId).findFirst().orElse(null);
                    if (player != null && player.getController() instanceof PlayerControllerHuman human) {
                        // Multiplayer's starting-player input requires a non-null selection even
                        // when its owner concedes before the first turn.
                        Set<Integer> choices = InputContext.playerChoices(human.getInputQueue().getInput());
                        if (!choices.isEmpty()) {
                            int first = choices.iterator().next();
                            FThreads.invokeInEdtAndWait(() -> human.selectPlayer(game.getRegisteredPlayers().stream().filter(p -> p.getId() == first).findFirst().orElseThrow().getView(), null));
                        }
                    }
                }
                finishAbandonedInput(game, playerId);
                done.countDown();
                return;
            }
        } while (!done.await(50, TimeUnit.MILLISECONDS));
        pump(game);
    }
}
