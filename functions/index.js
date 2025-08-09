const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { calculateOfflineGubs } = require('./offline');
admin.initializeApp();

const MAX_DELTA = 1000; // clamp client-supplied score changes
const COST_MULTIPLIER = 1.15;
const MAX_QUANTITY = 1000;
const SHOP_COSTS = {
  passiveMaker: 100,
  guberator: 500,
  gubmill: 2000,
  gubsolar: 10000,
  gubfactory: 50000,
  gubhydro: 250000,
  gubnuclear: 1000000,
  gubquantum: 5000000,
  gubai: 25000000,
  gubclone: 125000000,
  gubspace: 625000000,
  intergalactic: 3125000000,
};

function calculateTotalCost(base, owned, quantity) {
  let cost = 0;
  for (let i = 0; i < quantity; i++) {
    cost += Math.floor(base * Math.pow(COST_MULTIPLIER, owned + i));
  }
  return cost;
}

exports.syncGubs = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }
  let delta = typeof data?.delta === 'number' ? Math.floor(data.delta) : 0;
  delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
  const requestOffline = !!data?.offline;

  const db = admin.database();
  const userRef = db.ref(`leaderboard_v3/${uid}`);
  const shop = (await db.ref(`shop_v2/${uid}`).once('value')).val() || {};
  const rates = {
    passiveMaker: 1,
    guberator: 5,
    gubmill: 20,
    gubsolar: 100,
    gubfactory: 500,
    gubhydro: 2500,
    gubnuclear: 10000,
    gubquantum: 50000,
    gubai: 250000,
    gubclone: 1250000,
    gubspace: 6250000,
    intergalactic: 31250000,
  };
  const rate = Object.entries(shop).reduce(
    (sum, [k, v]) => sum + (rates[k] || 0) * v,
    0,
  );

  const snap = await userRef.once('value');
  const { score = 0, lastUpdated = Date.now() } = snap.val() || {};
  const now = Date.now();

  let offlineEarned = 0;
  if (requestOffline) {
    offlineEarned = calculateOfflineGubs(rate, lastUpdated, now);
  }
  const newScore = Math.max(0, score + delta + offlineEarned);

  await userRef.update({ score: newScore, lastUpdated: now });
  return { score: newScore, offlineEarned };
});

exports.purchaseItem = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }
  const itemId = data?.itemId;
  let quantity =
    typeof data?.quantity === 'number' ? Math.floor(data.quantity) : 1;
  if (!SHOP_COSTS[itemId]) {
    throw new functions.https.HttpsError('invalid-argument', 'Unknown item');
  }
  if (quantity <= 0 || quantity > MAX_QUANTITY) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid quantity',
    );
  }

  const db = admin.database();
  const userRef = db.ref(`leaderboard_v3/${uid}`);
  const itemRef = db.ref(`shop_v2/${uid}/${itemId}`);

  const [userSnap, itemSnap] = await Promise.all([
    userRef.once('value'),
    itemRef.once('value'),
  ]);
  const { score = 0 } = userSnap.val() || {};
  const owned = itemSnap.val() || 0;
  const totalCost = calculateTotalCost(SHOP_COSTS[itemId], owned, quantity);
  if (score < totalCost) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Not enough gubs',
    );
  }
  const newScore = score - totalCost;
  const newCount = owned + quantity;
  const updates = {};
  const now = Date.now();
  updates[`leaderboard_v3/${uid}/score`] = newScore;
  updates[`leaderboard_v3/${uid}/lastUpdated`] = now;
  updates[`shop_v2/${uid}/${itemId}`] = newCount;
  await db.ref().update(updates);
  return { score: newScore, newCount };
});
