const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { calculateOfflineGubs } = require('./offline');
const { RATES, COST_MULTIPLIER, SHOP_ITEMS } = require('./config');
const { validateSyncGubs, validatePurchaseItem } = require('./validation');
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

exports.syncGubs = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }
  try {
    const { delta, requestOffline } = validateSyncGubs(data);

    const db = admin.database();
    const userRef = db.ref(`leaderboard_v3/${uid}`);
    const shop = (await db.ref(`shop_v2/${uid}`).once('value')).val() || {};
    const rate = Object.entries(shop).reduce(
      (sum, [k, v]) => sum + (RATES[k] || 0) * v,
      0,
    );

    const snap = await userRef.once('value');
    const { score = 0, lastUpdated = Date.now() } = snap.val() || {};
    const now = Date.now();

    let offlineEarned = 0;
    if (requestOffline) {
      offlineEarned = calculateOfflineGubs(rate, lastUpdated, now);
    }
    const newScore = score + delta + offlineEarned;

    await userRef.update({ score: newScore, lastUpdated: now });
    functions.logger.info('syncGubs', {
      uid,
      delta,
      offlineEarned,
      newScore,
    });
    return { score: newScore, offlineEarned };
  } catch (err) {
    await logServerError(err, { function: 'syncGubs', uid, data });
    throw err;
  }
});

exports.purchaseItem = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }
  let item, quantity;
  try {
    ({ item, quantity } = validatePurchaseItem(data));
    const db = admin.database();
    // Log current values before attempting the transaction so we can compare
    // what the transaction sees versus what's stored in the database.
    const [preScoreSnap, preOwnedSnap] = await Promise.all([
      db.ref(`leaderboard_v3/${uid}/score`).once('value'),
      db.ref(`shop_v2/${uid}/${item}`).once('value'),
    ]);
    const preScore = Number(preScoreSnap.val()) || 0;
    const preOwned = Number(preOwnedSnap.val()) || 0;
    functions.logger.info('purchaseItem.precheck', {
      uid,
      item,
      score: preScore,
      owned: preOwned,
    });

    // Calculate cost based on pre-transaction values
    let cost = 0;
    for (let i = 0; i < quantity; i++) {
      cost += Math.floor(
        SHOP_ITEMS[item] * Math.pow(COST_MULTIPLIER, preOwned + i),
      );
    }

    // Ensure the user's recorded score meets the cost before attempting
    // the transactional deduction to avoid unnecessary retries
    if (preScore < cost) {
      await logServerError(new Error('Not enough gubs'), {
        function: 'purchaseItem',
        uid,
        data,
        score: preScore,
        cost,
        owned: preOwned,
      });
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Not enough gubs: have ${preScore}, need ${cost}`,
      );
    }

    let availableScore = 0;
    const userRef = db.ref(`leaderboard_v3/${uid}`);
    const scoreResult = await userRef.transaction((user) => {
      user = user || {};
      const currentScore = Number(user.score) || 0;
      availableScore = currentScore;
      if (currentScore < cost) return; // abort
      return {
        ...user,
        score: currentScore - cost,
        lastUpdated: Date.now(),
      };
    });

    if (!scoreResult.committed) {
      await logServerError(new Error('Not enough gubs'), {
        function: 'purchaseItem',
        uid,
        data,
        score: availableScore,
        cost,
        owned: preOwned,
      });
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Not enough gubs: have ${availableScore}, need ${cost}`,
      );
    }

    const newScore = scoreResult.snapshot.child('score').val() || 0;

    const ownedResult = await db
      .ref(`shop_v2/${uid}/${item}`)
      .transaction((curr) => (Number(curr) || 0) + quantity);

    const newOwned = Number(ownedResult.snapshot.val()) || 0;
    functions.logger.info('purchaseItem', {
      uid,
      item,
      quantity,

      cost,
      score: newScore,
      owned: newOwned,
    });
    return { score: newScore, owned: newOwned };
  } catch (err) {
    await logServerError(err, { function: 'purchaseItem', uid, data });
    throw err;
  }
});
