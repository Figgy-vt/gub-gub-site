const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { calculateOfflineGubs } = require('./offline');
admin.initializeApp();

const MAX_DELTA = 1000; // clamp client-supplied score changes

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
