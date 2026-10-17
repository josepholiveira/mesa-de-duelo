package mesadeduelo.bridge;

import java.io.File;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

import org.jupnp.UpnpServiceConfiguration;

import forge.gamemodes.match.HostedMatch;
import forge.gui.download.GuiDownloadService;
import forge.gui.interfaces.IGuiBase;
import forge.gui.interfaces.IGuiGame;
import forge.item.PaperCard;
import forge.localinstance.skin.FSkinProp;
import forge.localinstance.skin.ISkinImage;
import forge.sound.IAudioClip;
import forge.sound.IAudioMusic;
import forge.util.FSerializableFunction;
import forge.util.ImageFetcher;

/**
 * Implementação sem tela do IGuiBase, baseada no HeadlessGui de forge-gui/tools/java/ForgeMatrixWriter.java.
 * O "EDT" é uma thread própria: as entradas do jogador humano exigem que a thread do jogo não seja a da interface.
 */
final class HeadlessGui implements IGuiBase {
    private final String assetsDir;
    private final UiDispatcher edt = new UiDispatcher();

    HeadlessGui(Path forgeGuiDir) {
        this.assetsDir = forgeGuiDir.toAbsolutePath() + File.separator;
    }

    @Override public boolean isRunningOnDesktop() { return true; }
    @Override public boolean isLibgdxPort() { return false; }
    @Override public String getCurrentVersion() { return "mesa-de-duelo-bridge"; }

    @Override public void invokeInEdtNow(Runnable r) { if (isGuiThread()) r.run(); else invokeInEdtAndWait(r); }
    @Override public void invokeInEdtLater(Runnable r) { edt.execute(r); }
    @Override public void invokeInEdtAndWait(Runnable r) {
        if (isGuiThread()) { r.run(); return; }
        try {
            edt.invokeAndWait(r);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (ExecutionException e) {
            throw new RuntimeException(e.getCause());
        }
    }
    @Override public void runBackgroundTask(String message, Runnable task) { new Thread(task, "BridgeTask").start(); }
    @Override public boolean isGuiThread() { return edt.isUiThread(); }

    <T> T awaitBrowserAnswer(CompletableFuture<T> answer) throws InterruptedException, ExecutionException {
        return edt.await(answer);
    }

    void runGameMutation(Runnable action) { edt.runGameMutation(action); }

    <T> T awaitGameAnswer(CompletableFuture<T> answer, long timeoutMillis)
            throws InterruptedException, ExecutionException, java.util.concurrent.TimeoutException {
        return edt.awaitGameAnswer(answer, timeoutMillis);
    }

    @Override public String getAssetsDir() { return assetsDir; }
    @Override public ImageFetcher getImageFetcher() { return null; }
    @Override public ISkinImage getSkinIcon(FSkinProp skinProp) { return null; }
    @Override public ISkinImage getUnskinnedIcon(String path) { return null; }
    @Override public ISkinImage getCardArt(PaperCard card, boolean backFace) { return null; }
    @Override public ISkinImage createLayeredImage(PaperCard card, FSkinProp background, String overlayFilename, float opacity) { return null; }
    @Override public void clearImageCache() { }
    @Override public String encodeSymbols(String str, boolean formatReminderText) { return str; }
    @Override public int getAvatarCount() { return 0; }
    @Override public int getSleevesCount() { return 0; }
    @Override public float getScreenScale() { return 1.0f; }
    @Override public void preventSystemSleep(boolean preventSleep) { }
    @Override public void download(GuiDownloadService service, Consumer<Boolean> callback) { callback.accept(false); }
    @Override public void copyToClipboard(String text) { }
    @Override public void browseToUrl(String url) { }
    @Override public void showCardList(String title, String message, List<PaperCard> list) { }
    @Override public boolean showBoxedProduct(String title, String message, List<PaperCard> list) { return false; }
    @Override public void showBugReportDialog(String title, String text, boolean showExitAppBtn) { System.err.println(title + ": " + text); }
    @Override public void showImageDialog(ISkinImage image, String message, String title) { }
    @Override public int showOptionDialog(String message, String title, FSkinProp icon, List<String> options, int defaultOption) { return defaultOption; }
    @Override public String showInputDialog(String message, String title, FSkinProp icon, String initialInput, List<String> inputOptions, boolean isNumeric) { return initialInput; }
    @Override public String showFileDialog(String title, String defaultDir) { return defaultDir; }
    @Override public File getSaveFile(File defaultFile) { return defaultFile; }
    @Override public <T> List<T> order(String title, String top, int remainingObjectsMin, int remainingObjectsMax, List<T> sourceChoices, List<T> destChoices) {
        return destChoices != null ? destChoices : new ArrayList<>(sourceChoices);
    }
    @Override public <T> List<T> getChoices(String message, int min, int max, Collection<T> choices, Collection<T> selected, FSerializableFunction<T, String> display) {
        if (selected != null && !selected.isEmpty()) return new ArrayList<>(selected);
        List<T> out = new ArrayList<>(choices);
        return out.subList(0, Math.min(Math.max(min, 0), out.size()));
    }
    @Override public PaperCard chooseCard(String title, String message, List<PaperCard> list) { return list.isEmpty() ? null : list.get(0); }
    @Override public boolean isSupportedAudioFormat(File file) { return false; }
    @Override public IAudioClip createAudioClip(String filename) { return null; }
    @Override public IAudioMusic createAudioMusic(String filename) { return null; }
    @Override public void startAltSoundSystem(String filename, boolean isSynchronized) { }
    @Override public void showSpellShop() { }
    @Override public void showBazaar() { }
    @Override public IGuiGame getNewGuiGame() { return null; }
    @Override public HostedMatch hostMatch() { return new HostedMatch(); }
    @Override public UpnpServiceConfiguration getUpnpPlatformService() { return null; }
    @Override public boolean hasNetGame() { return false; }
}
