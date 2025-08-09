const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.syncGubs = functions.https.onCall(async (data, ctx) => {
  const uid = ctx.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated');
  }
  const delta = typeof data?.delta === 'number' ? data.delta : 0;

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
  const elapsed = delta === 0 ? now - lastUpdated : 0;
  // Award only 0.25% of the normal passive rate while the user was away
  const earned = rate * 0.0025 * (elapsed / 1000);
  const offlineEarned = Math.floor(earned);
  const newScore = Math.max(0, Math.floor(score + earned + delta));
  await userRef.update({ score: newScore, lastUpdated: now });
  return { score: newScore, offlineEarned };
});
