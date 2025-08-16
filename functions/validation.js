import * as functions from 'firebase-functions';
import { SHOP_ITEMS, UPGRADES } from './config.js';

export function validateSyncGubs(data = {}) {
  const rawDelta = data.delta;
  if (!Number.isFinite(rawDelta)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid delta');
  }
  // Previously we clamped the delta to +/-1e6 to prevent excessive writes.
  // High rate players now quickly exceed this limit causing their scores to
  // fall behind as only a portion of their local delta could be synced each
  // tick.  The database can handle larger updates, so we simply floor the
  // value without clamping so the full amount is applied in a single call.
  const delta = Math.floor(rawDelta);
  const requestOffline = Boolean(data.offline);
  return { delta, requestOffline };
}

export function validatePurchaseItem(data = {}) {
  const item = data.item;
  const dryRun = Boolean(data.dryRun);
  if (!SHOP_ITEMS[item]) {
    throw new functions.https.HttpsError('invalid-argument', 'Unknown item');
  }
  const rawQuantity = data.quantity ?? 1;
  const numQuantity = Number(rawQuantity);
  if (!Number.isFinite(numQuantity)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid quantity',
    );
  }
  const quantity = Math.floor(numQuantity);
  if (quantity < 0 || quantity > 1000 || (!dryRun && quantity < 1)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Quantity must be between 1 and 1000',
    );
  }
  return { item, quantity, dryRun };
}

export function validatePurchaseUpgrade(data = {}) {
  const upgrade = data.upgrade;
  const dryRun = Boolean(data.dryRun);
  if (!UPGRADES[upgrade] && !dryRun) {
    throw new functions.https.HttpsError('invalid-argument', 'Unknown upgrade');
  }
  return { upgrade, dryRun };
}

export function validateUsername(rawUsername) {
  const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
  if (!username || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid username',
    );
  }
  return username;
}

export function validateAdminUpdate(data = {}) {
  const score = Number.isInteger(data.score)
    ? data.score
    : Math.floor(Number(data.score));
  const username = validateUsername(data.username);
  if (!Number.isFinite(score)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid score');
  }
  return { username, score };
}

export function validateAdminDelete(data = {}) {
  const username = validateUsername(data.username);
  return { username };
}
