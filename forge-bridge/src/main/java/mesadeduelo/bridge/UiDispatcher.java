package mesadeduelo.bridge;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

/** Serial UI mutations, with independent browser decisions allowed to wait concurrently. */
final class UiDispatcher implements AutoCloseable {
    private final ReentrantLock gate = new ReentrantLock(true);
    private final ThreadLocal<Boolean> onUi = ThreadLocal.withInitial(() -> false);
    private final AtomicInteger threadSequence = new AtomicInteger();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(1, Integer.MAX_VALUE, 30, TimeUnit.SECONDS,
        new LinkedBlockingQueue<>(), task -> {
            Thread thread = new Thread(task, "BridgeEDT-" + threadSequence.incrementAndGet());
            thread.setDaemon(true); return thread;
        });
    // Accessed only while holding gate. One runnable worker plus one worker for each parked decision.
    private int waiting;

    boolean isUiThread() { return onUi.get(); }

    void execute(Runnable task) {
        workers.execute(() -> {
            gate.lock(); onUi.set(true);
            try { task.run(); }
            finally { onUi.remove(); gate.unlock(); }
        });
    }

    void invokeAndWait(Runnable task) throws InterruptedException, ExecutionException {
        if (isUiThread()) { task.run(); return; }
        FutureTask<Void> result = new FutureTask<>(task, null);
        execute(result); result.get();
    }

    <T> T await(CompletableFuture<T> answer) throws InterruptedException, ExecutionException {
        if (!isUiThread() || answer.isDone()) return answer.get();
        // The suspended call does not mutate Forge. A replacement worker handles other sessions.
        // Its continuation must reacquire the same gate before touching engine state again.
        workers.setCorePoolSize(++waiting + 1);
        gate.unlock();
        try { return answer.get(); }
        finally {
            gate.lock();
            workers.setCorePoolSize(--waiting + 1);
        }
    }

    void runGameMutation(Runnable action) {
        gate.lock();
        try { action.run(); } finally { gate.unlock(); }
    }

    <T> T awaitGameAnswer(CompletableFuture<T> answer, long timeoutMillis)
            throws InterruptedException, ExecutionException, java.util.concurrent.TimeoutException {
        boolean held = gate.isHeldByCurrentThread();
        if (held) gate.unlock();
        try { return answer.get(timeoutMillis, TimeUnit.MILLISECONDS); }
        finally { if (held) gate.lock(); }
    }

    @Override public void close() { workers.shutdownNow(); }
}
