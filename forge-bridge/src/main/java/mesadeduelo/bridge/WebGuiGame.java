package mesadeduelo.bridge;

import java.util.EnumSet;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
import java.util.concurrent.CountDownLatch;
import forge.game.Game;

import forge.game.phase.PhaseType;
import forge.game.player.PlayerView;
import forge.gamemodes.match.YieldUpdate;
import forge.gamemodes.net.IRemote;
import forge.gamemodes.net.ProtocolGuiGame;
import forge.interfaces.IGameController;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.trackable.TrackableCollection;

/**
 * Tela do jogador humano no lado do Forge. Reaproveita o ProtocolGuiGame (que já converte cada chamada
 * do IGuiGame num evento) e só decide em quais fases o jogador quer parar, como no Arena.
 */
final class WebGuiGame extends ProtocolGuiGame {
    /** Fases do próprio turno em que o jogador recebe prioridade com a pilha vazia. */
    private static final Set<PhaseType> STOPS_MINE = EnumSet.of(PhaseType.MAIN1, PhaseType.MAIN2, PhaseType.COMBAT_DECLARE_BLOCKERS);
    /** Fases do turno do oponente: a janela de combate depois dos bloqueios. */
    private static final Set<PhaseType> STOPS_THEIRS = EnumSet.of(PhaseType.COMBAT_DECLARE_BLOCKERS);

    private volatile PlayerView me;
    private final BooleanSupplier autoPassNoActions;

    private final MatchLifecycle lifecycle;
    private final Supplier<Game> game;

    WebGuiGame(IRemote remote, BooleanSupplier autoPassNoActions, MatchLifecycle lifecycle, Supplier<Game> game) {
        super(remote);
        this.autoPassNoActions = autoPassNoActions;
        this.lifecycle = lifecycle;
        this.game = game;
    }

    @Override
    public void openView(TrackableCollection<PlayerView> myPlayers) {
        me = myPlayers.iterator().next();
        super.openView(myPlayers);
        // Com um ProtocolGuiGame o PlayerControllerHuman lê os pulos de fase do seu YieldController,
        // não deste método; por isso as paradas são enviadas a ele explicitamente.
        IGameController controller = getGameController(me);
        if (controller == null || getGameView() == null) return;
        // Per-player defaults: skip only when Forge proves there is no legal non-mana action.
        // Presentation timing must never create extra priority confirmations.
        controller.applyYieldUpdate(new YieldUpdate.SetYieldPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS, Boolean.toString(autoPassNoActions.getAsBoolean())));
        controller.applyYieldUpdate(new YieldUpdate.SetYieldPref(FPref.YIELD_AUTO_PASS_RESPECTS_INTERRUPTS, "false"));
        for (PlayerView p : getGameView().getPlayers()) {
            for (PhaseType ph : PhaseType.values()) {
                controller.applyYieldUpdate(new YieldUpdate.SkipPhase(p, ph, isUiSetToSkipPhase(p, ph)));
            }
        }
    }

    @Override
    public void awaitInput(CountDownLatch done) throws InterruptedException {
        lifecycle.awaitInput(game.get(), me == null ? -1 : me.getId(), done);
    }

    @Override
    public boolean isUiSetToSkipPhase(PlayerView playerTurn, PhaseType phase) {
        boolean mine = me != null && me.equals(playerTurn);
        return !(mine ? STOPS_MINE : STOPS_THEIRS).contains(phase);
    }
}
