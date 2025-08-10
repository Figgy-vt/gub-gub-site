const functions = require('firebase-functions');
const { SHOP_ITEMS } = require('./config');

function validateSyncGubs(data = {}) {
  const delta = typeof data.delta === 'number' ? Math.floor(data.delta) : 0;
  const requestOffline = Boolean(data.offline);
  return { delta, requestOffline };
}

function validatePurchaseItem(data = {}) {
  const item = data.item;
  if (!SHOP_ITEMS[item]) {
    throw new functions.https.HttpsError('invalid-argument', 'Unknown item');
  }
  const quantity = Math.max(1, Math.floor(Number(data.quantity || 1)));
  return { item, quantity };
}

module.exports = { validateSyncGubs, validatePurchaseItem };
