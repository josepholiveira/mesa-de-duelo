package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.Test;

public class UiDispatcherLifecycleTest {
    @Test(timeout = 5000) public void gameMutationKeepsOwnerAndReleasesGateForBrowserAnswer() throws Exception {
        try (UiDispatcher ui = new UiDispatcher()) {
            CompletableFuture<String> answer = new CompletableFuture<>();
            CountDownLatch waiting = new CountDownLatch(1), otherAction = new CountDownLatch(1);
            CompletableFuture<Void> owner = CompletableFuture.runAsync(() -> {
                Thread gameThread = Thread.currentThread();
                ui.runGameMutation(() -> {
                    assertSame(gameThread, Thread.currentThread());
                    assertFalse(ui.isUiThread());
                    waiting.countDown();
                    try { assertEquals("answered", ui.awaitGameAnswer(answer, 2000)); }
                    catch (Exception error) { throw new AssertionError(error); }
                    assertSame(gameThread, Thread.currentThread());
                    assertFalse(ui.isUiThread());
                });
            });
            assertTrue(waiting.await(2, TimeUnit.SECONDS));
            ui.execute(() -> { assertTrue(ui.isUiThread()); otherAction.countDown(); });
            ui.execute(() -> answer.complete("answered"));
            assertTrue(otherAction.await(2, TimeUnit.SECONDS));
            owner.get(2, TimeUnit.SECONDS);
        }
    }

    @Test(timeout = 5000) public void timedWaitReacquiresMutationGateBeforeContinuing() throws Exception {
        try (UiDispatcher ui = new UiDispatcher()) {
            CountDownLatch timedOut = new CountDownLatch(1), finishMutation = new CountDownLatch(1), uiRan = new CountDownLatch(1);
            CompletableFuture<Void> owner = CompletableFuture.runAsync(() -> ui.runGameMutation(() -> {
                try {
                    ui.awaitGameAnswer(new CompletableFuture<>(), 10);
                    fail("Unanswered request must time out");
                } catch (TimeoutException expected) {
                    timedOut.countDown();
                    try { assertTrue(finishMutation.await(2, TimeUnit.SECONDS)); }
                    catch (InterruptedException error) { throw new AssertionError(error); }
                } catch (Exception error) { throw new AssertionError(error); }
            }));
            assertTrue(timedOut.await(2, TimeUnit.SECONDS));
            ui.execute(uiRan::countDown);
            assertFalse("EDT cannot mutate before owner releases the reacquired gate", uiRan.await(50, TimeUnit.MILLISECONDS));
            finishMutation.countDown();
            owner.get(2, TimeUnit.SECONDS);
            assertTrue(uiRan.await(2, TimeUnit.SECONDS));
        }
    }
}
