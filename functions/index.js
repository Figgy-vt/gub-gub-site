const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { calculateOfflineGubs } = require('./offline');
admin.initializeApp();

function logServerError(error, context = {}) {
  try {
    const ref = admin.database().ref('logs/server').push();
    return ref.set({
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      ...context,
    });
  } catch (e) {
    functions.logger.error('Failed to log error', e);
    return Promise.resolve();
  }
}

const MAX_DELTA = 1000; // clamp client-supplied score changes

exports.syncGubs = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }
  try {
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
  } catch (err) {
    await logServerError(err, { function: 'syncGubs', uid, data });
    throw err;
  }
});

const COST_MULTIPLIER = 1.15;
const SHOP_ITEMS = {
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

exports.purchaseItem = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }
  const item = data?.item;
  const quantity = Math.max(1, Math.floor(data?.quantity || 1));
  if (!SHOP_ITEMS[item]) {
    throw new functions.https.HttpsError('invalid-argument', 'Unknown item');
  }
  try {
    const db = admin.database();
    const result = await db.ref().runTransaction((root) => {
      if (root === null) root = {};
      const user = root.leaderboard_v3?.[uid] || {};
      const score = user.score || 0;
      const owned = root.shop_v2?.[uid]?.[item] || 0;

      let cost = 0;
      for (let i = 0; i < quantity; i++) {
        cost += Math.floor(
          SHOP_ITEMS[item] * Math.pow(COST_MULTIPLIER, owned + i),
        );
      }
      if (score < cost) {
        return; // abort
      }

      user.score = score - cost;
      user.lastUpdated = Date.now();
      if (!root.leaderboard_v3) root.leaderboard_v3 = {};
      root.leaderboard_v3[uid] = user;

      if (!root.shop_v2) root.shop_v2 = {};
      if (!root.shop_v2[uid]) root.shop_v2[uid] = {};
      root.shop_v2[uid][item] = owned + quantity;

      return root;
    });

    if (!result.committed) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Not enough gubs',
      );
    }

    const newScore =
      result.snapshot.child(`leaderboard_v3/${uid}/score`).val() || 0;
    const newOwned = result.snapshot.child(`shop_v2/${uid}/${item}`).val() || 0;
    return { score: newScore, owned: newOwned };
  } catch (err) {
    await logServerError(err, { function: 'purchaseItem', uid, data });
    throw err;
  }
});
