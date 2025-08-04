const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.incrementScore = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const amount = Number(data.amount || 0);
  if (!Number.isFinite(amount)) {
    throw new functions.https.HttpsError('invalid-argument', 'Amount must be a number');
  }

  const presenceRef = admin.database().ref(`/presence/${uid}`);
  const presenceSnap = await presenceRef.once('value');
  if (!presenceSnap.exists()) {
    throw new functions.https.HttpsError('failed-precondition', 'User not online');
  }

  const scoreRef = admin.database().ref(`/leaderboard/${uid}/score`);
  const snap = await scoreRef.once('value');
  if (!snap.exists()) {
    throw new functions.https.HttpsError('failed-precondition', 'Score entry does not exist');
  }

  await scoreRef.transaction(current => {
    return (current || 0) + amount;
  });

  const newSnap = await scoreRef.once('value');
  return { score: newSnap.val() };
});
