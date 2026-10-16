package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class UiDispatcherTest {
    @Test public void independentQuestionsResumeWithoutWaitingForEachOther() throws Exception {
        try (UiDispatcher ui = new UiDispatcher()) {
            CompletableFuture<String> a = new CompletableFuture<>(), b = new CompletableFuture<>();
            CompletableFuture<String> resumedA = new CompletableFuture<>(), resumedB = new CompletableFuture<>();
            CountDownLatch waitingA = new CountDownLatch(1), waitingB = new CountDownLatch(1), otherAction = new CountDownLatch(1);
            ui.execute(() -> {
                try { assertTrue(ui.isUiThread()); waitingA.countDown(); resumedA.complete(ui.await(a)); }
                catch (Throwable failure) { resumedA.completeExceptionally(failure); }
            });
            assertTrue(waitingA.await(2, TimeUnit.SECONDS));
            ui.execute(() -> {
                try { assertTrue(ui.isUiThread()); waitingB.countDown(); resumedB.complete(ui.await(b)); }
                catch (Throwable failure) { resumedB.completeExceptionally(failure); }
            });
            assertTrue(waitingB.await(2, TimeUnit.SECONDS));
            ui.execute(otherAction::countDown);
            assertTrue(otherAction.await(2, TimeUnit.SECONDS));
            a.complete("first"); assertEquals("first", resumedA.get(2, TimeUnit.SECONDS));
            assertFalse(resumedB.isDone());
            b.complete("second"); assertEquals("second", resumedB.get(2, TimeUnit.SECONDS));
        }
    }

    @Test public void activeMutationsRemainSerializedWhileQuestionsWait() throws Exception {
        try (UiDispatcher ui = new UiDispatcher()) {
            CompletableFuture<Void> answer = new CompletableFuture<>();
            CountDownLatch started = new CountDownLatch(1), resumed = new CountDownLatch(1), work = new CountDownLatch(100);
            AtomicInteger active = new AtomicInteger(), maximum = new AtomicInteger();
            Runnable mutation = () -> {
                maximum.accumulateAndGet(active.incrementAndGet(), Math::max);
                Thread.yield(); active.decrementAndGet();
            };
            ui.execute(() -> {
                try { started.countDown(); ui.await(answer); mutation.run(); resumed.countDown(); }
                catch (Exception failure) { throw new AssertionError(failure); }
            });
            assertTrue(started.await(2, TimeUnit.SECONDS));
            for (int i = 0; i < 100; i++) ui.execute(() -> { mutation.run(); work.countDown(); });
            answer.complete(null);
            assertTrue(work.await(2, TimeUnit.SECONDS)); assertTrue(resumed.await(2, TimeUnit.SECONDS));
            assertEquals(1, maximum.get());
        }
    }
}
