const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { calculateOfflineGubs } = require('./offline');
admin.initializeApp();

const MAX_CLICKS = 100; // clamp client-supplied click counts
const RATE_LIMIT_MS = 1000; // minimum interval between syncs per user
const GOLDEN_SECRET = functions.config().golden?.secret || 'dev-secret';
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

function verifyGoldenToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split(':');
  if (parts.length !== 3) return null;
  const [id, rewardStr, sig] = parts;
  const reward = parseInt(rewardStr, 10);
  if (!id || !reward || !sig) return null;
  const expected = crypto
    .createHmac('sha256', GOLDEN_SECRET)
    .update(`${id}:${reward}`)
    .digest('hex');
  if (sig !== expected) return null;
  return { id, reward };
}

exports.syncGubs = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }

  const db = admin.database();
  const now = Date.now();


  // simple rate limiting stored in RTDB; failure to update should not break sync
  const rlRef = db.ref(`rateLimits/syncGubs/${uid}`);
  try {
    const lastCall = (await rlRef.once('value')).val() || 0;
    if (now - lastCall < RATE_LIMIT_MS) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Too many requests',
      );
    }
    await rlRef.set(now);
  } catch (e) {
    functions.logger.warn('rateLimit check failed', e);
  }

  const clicks = Math.max(
    0,
    Math.min(MAX_CLICKS, Math.floor(data?.clicks || 0)),
  );
  const requestOffline = !!data?.offline;
  const goldenToken = data?.goldenToken;

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
  const { score = 0, lastUpdated = now } = snap.val() || {};

  let offlineEarned = 0;
  if (requestOffline) {
    offlineEarned = calculateOfflineGubs(rate, lastUpdated, now);
  }

  let goldenReward = 0;
  if (typeof goldenToken === 'string') {
    const verified = verifyGoldenToken(goldenToken);
    if (verified) {
      const tokenRef = db.ref(`goldenTokens/${uid}/${verified.id}`);
      const tokenData = (await tokenRef.once('value')).val();
      if (tokenData && !tokenData.used && tokenData.reward === verified.reward) {
        goldenReward = verified.reward;
        await tokenRef.update({ used: true });
      }
    }
  }

  const delta = clicks + goldenReward;
  const newScore = Math.max(0, score + delta + offlineEarned);


  const updates = {};
  updates[`leaderboard_v3/${uid}/score`] = newScore;
  updates[`leaderboard_v3/${uid}/lastUpdated`] = now;
  await db.ref().update(updates);

  return { score: newScore, offlineEarned, goldenReward };
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

exports.generateGoldenToken = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }
  const reward = 100; // fixed reward for now
  const id = crypto.randomBytes(16).toString('hex');
  const signature = crypto
    .createHmac('sha256', GOLDEN_SECRET)
    .update(`${id}:${reward}`)
    .digest('hex');
  await admin.database().ref(`goldenTokens/${uid}/${id}`).set({ reward });
  return { token: `${id}:${reward}:${signature}` };
});
