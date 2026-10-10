export function startScheduledPublishing({ service, logger = console, intervalMs = 60_000 }) {
  const run = () => {
    try {
      const result = service.runDue();
      for (const failure of result.failed) {
        logger.error(`Scheduled publish failed for ${failure.id}: ${failure.message}`);
      }
    } catch (error) {
      logger.error(`Scheduled publishing job failed: ${error?.message || error}`);
    }
  };

  run();
  const interval = setInterval(run, intervalMs);
  interval.unref?.();
  return { stop: () => clearInterval(interval), run };
}
