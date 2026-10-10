export const DEFAULT_SERVER_CLOSE_GRACE_MS = 5_000;

function reportCleanupFailure(logger, stage) {
  try {
    logger?.error?.(`Server cleanup failed during ${stage}`);
  } catch {
    // Cleanup continues even when diagnostics are unavailable.
  }
}

export function closeServerBounded({
  server,
  graceMs = DEFAULT_SERVER_CLOSE_GRACE_MS,
  logger = console,
} = {}) {
  if (!server) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      try {
        server.closeAllConnections?.();
      } catch {
        reportCleanupFailure(logger, 'forced connection close');
      } finally {
        finish();
      }
    }, Math.max(0, graceMs));

    try {
      server.close(() => finish());
    } catch {
      finish();
    }
    try {
      server.closeIdleConnections?.();
    } catch {
      reportCleanupFailure(logger, 'idle connection close');
    }
  });
}

export async function closeServerResources({
  server,
  scheduler,
  database,
  graceMs = DEFAULT_SERVER_CLOSE_GRACE_MS,
  logger = console,
} = {}) {
  try {
    try {
      const stopResult = scheduler?.stop?.();
      Promise.resolve(stopResult).catch(() => reportCleanupFailure(logger, 'scheduler stop'));
    } catch {
      reportCleanupFailure(logger, 'scheduler stop');
    }
  } finally {
    try {
      await closeServerBounded({ server, graceMs, logger });
    } finally {
      try {
        database?.close?.();
      } catch {
        reportCleanupFailure(logger, 'database close');
      }
    }
  }
}

export function createServerTerminationController({
  processTarget = process,
  server,
  scheduler,
  database,
  graceMs = DEFAULT_SERVER_CLOSE_GRACE_MS,
  logger = console,
} = {}) {
  let attached = false;
  let requestedExitCode = Number(processTarget.exitCode) || 0;
  let terminationPromise;

  const removeListener = (target, event, listener) => {
    if (typeof target?.off === 'function') target.off(event, listener);
    else target?.removeListener?.(event, listener);
  };

  const detach = () => {
    if (!attached) return;
    attached = false;
    removeListener(processTarget, 'SIGTERM', onSignal);
    removeListener(processTarget, 'SIGINT', onSignal);
    removeListener(processTarget, 'message', onMessage);
    removeListener(server, 'error', onServerError);
  };

  const disconnect = () => {
    if (!processTarget.connected || typeof processTarget.disconnect !== 'function') return;
    try {
      processTarget.disconnect();
    } catch {
      reportCleanupFailure(logger, 'IPC disconnect');
    }
  };

  const runTermination = async () => {
    try {
      await closeServerResources({ server, scheduler, database, graceMs, logger });
    } finally {
      detach();
      disconnect();
      processTarget.exitCode = requestedExitCode;
    }
  };

  function terminate(exitCode = 0) {
    if (exitCode !== 0) requestedExitCode = Math.max(requestedExitCode, exitCode);
    processTarget.exitCode = requestedExitCode;
    terminationPromise ??= runTermination();
    return terminationPromise;
  }

  function onSignal() {
    void terminate(0);
  }

  function onMessage(message) {
    if (message?.type === 'shutdown') void terminate(0);
  }

  function onServerError(error) {
    try {
      logger?.error?.(`Server error: ${error?.message || error}`);
    } catch {
      // Fatal cleanup must continue when diagnostics fail.
    }
    void terminate(1);
  }

  function attach() {
    if (attached) return;
    attached = true;
    processTarget.once('SIGTERM', onSignal);
    processTarget.once('SIGINT', onSignal);
    if (typeof processTarget.send === 'function') processTarget.on('message', onMessage);
    server?.on?.('error', onServerError);
  }

  return {
    attach,
    terminate,
    wait() {
      return terminationPromise ?? Promise.resolve();
    },
  };
}
