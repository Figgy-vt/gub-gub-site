export function logError(db, info = {}) {
  try {
    db.ref('logs/client').push({
      timestamp: Date.now(),
      ...info,
    });
  } catch (e) {
    console.error('failed to log error', e);
  }
}
