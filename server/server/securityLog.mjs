export function writeSecurityEvent(event, sink = console.info) {
  const timestamp = event.timestamp === undefined ? new Date().toISOString() : String(event.timestamp);
  const output = {
    timestamp,
    type: event.type === undefined ? 'unknown' : String(event.type),
    result: event.result === undefined ? '' : String(event.result),
    userId: event.userId === undefined ? '' : String(event.userId),
    username: event.username === undefined ? '' : String(event.username).trim().toLowerCase(),
    ip: event.ip === undefined ? '' : String(event.ip)
  };

  sink(JSON.stringify(output));
}

export function emitSecurityEvent(log, event) {
  if (typeof log !== 'function') return;
  try {
    Promise.resolve(log(event)).catch(() => {});
  } catch {
    // Security logging is best-effort and must not change application behavior.
  }
}
