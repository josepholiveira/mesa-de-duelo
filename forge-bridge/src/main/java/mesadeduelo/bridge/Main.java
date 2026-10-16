package mesadeduelo.bridge;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.google.common.eventbus.Subscribe;
import com.google.gson.JsonObject;

import forge.ai.LobbyPlayerAi;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameType;
import forge.game.Match;
import forge.game.event.GameEvent;
import forge.game.player.RegisteredPlayer;
import forge.gui.GuiBase;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;

/**
 * Ponte entre o motor do Forge (sem tela) e o frontend, por WebSocket.
 *
 * --mode=play  (padrão) espera o navegador: humano x IA ({type:"start"}) ou humano x humano em salas (veja Rooms).
 * --mode=watch roda partidas IA x IA e transmite o estado a cada evento.
 *
 * Opções: --port=7171 --host=127.0.0.1 (0.0.0.0 para aceitar outras máquinas) --mode=play|watch; no modo watch: --delay=150 --a=vermelho --b=verde --games=1 --exit
 * Propriedade do sistema: -Dforge.dir=/caminho/do/clone/do/forge (padrão: ~/forge)
 */
public final class Main {
    private Main() { }

    public static void main(String[] args) throws Exception {
        Map<String, String> opt = new HashMap<>();
        for (String a : args) {
            if (!a.startsWith("--")) continue;
            String[] kv = a.substring(2).split("=", 2);
            opt.put(kv[0], kv.length > 1 ? kv[1] : "true");
        }
        int port = Integer.parseInt(opt.getOrDefault("port", "7171"));
        String host = opt.getOrDefault("host", "127.0.0.1");
        long delay = Long.parseLong(opt.getOrDefault("delay", "150"));
        int games = Integer.parseInt(opt.getOrDefault("games", "1"));
        String deckA = opt.getOrDefault("a", "vermelho");
        String deckB = opt.getOrDefault("b", "verde");

        String forgeDir = System.getProperty("forge.dir", System.getProperty("user.home") + "/forge");
        long t0 = System.currentTimeMillis();
        GuiBase.setInterface(new HeadlessGui(Path.of(forgeDir, "forge-gui")));
        FModel.initialize(null, prefs -> {
            prefs.setPref(FPref.LOAD_CARD_SCRIPTS_LAZILY, "true");
            prefs.setPref(FPref.UI_LANGUAGE, opt.getOrDefault("lang", "pt-BR"));
            prefs.setPref(FPref.ENFORCE_DECK_LEGALITY, "false");
            // Faz o Forge calcular e enviar as cartas que podem ser usadas agora (setWeaklySelectable).
            prefs.setPref(FPref.UI_SHOW_ACTIONABLE_HIGHLIGHTS, "true");
            // A mesa só mostra campo de batalha e mão como cartas clicáveis. Com isto desligado, escolhas
            // no grimório, cemitério ou exílio (buscar no grimório, reanimar...) chegam como pergunta com as cartas.
            prefs.setPref(FPref.UI_SELECT_FROM_CARD_DISPLAYS, "false");
            return null;
        });
        System.out.printf("Forge inicializado em %d ms%n", System.currentTimeMillis() - t0);

        if (!"watch".equals(opt.getOrDefault("mode", "play"))) {
            BridgeServer server = new BridgeServer(host, port, new Rooms());
            server.start();
            System.out.printf("Modo play: WebSocket em ws://%s:%d/ws (Ctrl+C para sair)%n", host, port);
            if (!"127.0.0.1".equals(host)) System.out.println("Aceitando conexões de outras máquinas: partidas em rede liberadas.");
            Thread.currentThread().join();
            return;
        }

        BridgeServer server = new BridgeServer(host, port, new BridgeServer.Listener() {
            @Override public void onConnect(io.netty.channel.Channel ch) { }
            @Override public void onMessage(io.netty.channel.Channel ch, String text) { }
            @Override public void onDisconnect(io.netty.channel.Channel ch) { }
        });
        server.start();
        System.out.printf("Modo watch: WebSocket em ws://%s:%d/ws%n", host, port);

        for (int i = 0; i < games; i++) {
            RegisteredPlayer a = new RegisteredPlayer(Decks.build(deckA));
            a.setPlayer(new LobbyPlayerAi("IA " + deckA, null));
            RegisteredPlayer b = new RegisteredPlayer(Decks.build(deckB));
            b.setPlayer(new LobbyPlayerAi("IA " + deckB, null));

            GameRules rules = new GameRules(GameType.Constructed);
            rules.setGamesPerMatch(1);
            Match match = new Match(rules, List.of(a, b), "Mesa de Duelo");
            Game game = match.createGame();
            game.setNoGUIUser();
            Streamer streamer = new Streamer(game, server, delay);
            game.subscribeToEvents(streamer);

            long start = System.currentTimeMillis();
            match.startGame(game);
            streamer.publish();
            System.out.printf("Partida %d: %s venceu no turno %d (%d eventos, %d ms)%n", i + 1,
                game.getView().getWinningPlayerName(), game.getView().getTurn(), streamer.events, System.currentTimeMillis() - start);
        }

        if (opt.containsKey("exit")) System.exit(0);
        System.out.println("Partidas encerradas. O servidor continua no ar com o último estado (Ctrl+C para sair).");
        Thread.currentThread().join();
    }

    /** Recebe os eventos do jogo (na thread do jogo) e publica o estado, com uma pausa para dar para assistir. */
    static final class Streamer {
        private final Game game;
        private final BridgeServer server;
        private final long delay;
        private long lastPublish;
        int events;

        Streamer(Game game, BridgeServer server, long delay) {
            this.game = game;
            this.server = server;
            this.delay = delay;
        }

        @Subscribe
        public void onEvent(GameEvent ev) {
            events++;
            long now = System.currentTimeMillis();
            if (now - lastPublish < 30) return;
            lastPublish = now;
            JsonObject state = publish();
            state.addProperty("event", ev.getClass().getSimpleName());
            if (delay > 0 && server.clientCount() > 0) {
                try { Thread.sleep(delay); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
        }

        JsonObject publish() {
            JsonObject state = StateJson.game(game.getView(), -1, game);
            server.broadcast(state.toString());
            return state;
        }
    }
}
