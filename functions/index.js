const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

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

const RATES = {
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

function calculateTotalCost(base, owned, quantity) {
  let cost = 0;
  for (let i = 0; i < quantity; i++) {
    cost += Math.floor(base * Math.pow(COST_MULTIPLIER, owned + i));
  }
  return cost;
}

function calcPassiveRate(shop = {}) {
  return Object.entries(shop).reduce(
    (sum, [k, v]) => sum + (RATES[k] || 0) * v,
    0,
  );
}

async function applyPassiveGubs(db, uid, now = Date.now()) {
  const userRef = db.ref(`users/${uid}`);
  const snap = await userRef.once('value');
  const data = snap.val() || {};
  const { score = 0, lastUpdated = now, shop = {} } = data;
  const rate = calcPassiveRate(shop);
  const elapsed = Math.max(0, now - lastUpdated);
  const earned = Math.floor(rate * (elapsed / 1000));
  const newScore = score + earned;
  await userRef.update({ score: newScore, lastUpdated: now });

  await db.ref(`leaderboard_v3/${uid}/score`).set(newScore);

  return { score: newScore, shop, rate, earned };
}

exports.getState = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }
  const db = admin.database();
  const { score, shop, rate, earned } = await applyPassiveGubs(db, uid);
  return { score, shop, rate, passiveEarned: earned };
});

exports.clickGub = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }
  const db = admin.database();
  const { score } = await applyPassiveGubs(db, uid);
  const newScore = score + 1;
  await db.ref(`users/${uid}/score`).set(newScore);

  await db.ref(`leaderboard_v3/${uid}/score`).set(newScore);

  return { score: newScore };
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
  const { score, shop } = await applyPassiveGubs(db, uid);
  const owned = shop[itemId] || 0;
  const totalCost = calculateTotalCost(SHOP_COSTS[itemId], owned, quantity);
  if (score < totalCost) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Not enough gubs',
    );
  }
  const newScore = score - totalCost;
  const newCount = owned + quantity;
  await db.ref(`users/${uid}`).update({
    score: newScore,
    [`shop/${itemId}`]: newCount,
  });

  await db.ref(`leaderboard_v3/${uid}/score`).set(newScore);

  return { score: newScore, newCount };
});
