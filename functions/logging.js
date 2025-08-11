import admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { LOGS_PATH } from './paths.js';

export function logError(collection, error, payload = {}) {
  try {
    const ref = admin.database().ref(`${LOGS_PATH}/${collection}`).push();
    return ref.set({
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      ...payload,
    });
  } catch (e) {
    functions.logger.error('Failed to log error', e);
    return Promise.resolve();
  }
}

export async function logAction(collection, payload = {}) {
  try {
    const ref = admin.database().ref(`${LOGS_PATH}/${collection}`).push();
    await ref.set({
      timestamp: Date.now(),
      ...payload,
    });
  } catch (e) {
    functions.logger.error('Failed to log action', e);
  }
}
