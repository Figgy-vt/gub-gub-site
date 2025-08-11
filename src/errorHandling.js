import { logError } from './logger.js';

export function initErrorLogging(db) {
  window.addEventListener('error', (e) => {
    logError(db, {
      message: e.message,
      stack: e.error?.stack,
      source: e.filename,
      line: e.lineno,
      col: e.colno,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    logError(db, {
      message: e.reason?.message || String(e.reason),
      stack: e.reason?.stack,
      type: 'unhandledrejection',
    });
  });
}
