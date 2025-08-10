import * as functions from 'firebase-functions';
import { SHOP_ITEMS } from './config.js';

export function validateSyncGubs(data = {}) {
  const delta = typeof data.delta === 'number' ? Math.floor(data.delta) : 0;
  const requestOffline = Boolean(data.offline);
  return { delta, requestOffline };
}

export function validatePurchaseItem(data = {}) {
  const item = data.item;
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
  if (quantity < 1 || quantity > 1000) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Quantity must be between 1 and 1000',
    );
  }
  return { item, quantity };
}

export function validateAdminUpdate(data = {}) {
  const username =
    typeof data.username === 'string' ? data.username.trim() : '';
  const score = Number.isInteger(data.score)
    ? data.score
    : Math.floor(Number(data.score));
  if (!username || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid username',
    );
  }
  if (!Number.isFinite(score)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid score');
  }
  return { username, score };
}

export function validateAdminDelete(data = {}) {
  const username =
    typeof data.username === 'string' ? data.username.trim() : '';
  if (!username || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid username',
    );
  }
  return { username };
}
