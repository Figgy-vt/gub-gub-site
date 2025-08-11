import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { calculateOfflineGubs } from './offline.js';
import { RATES, COST_MULTIPLIER, SHOP_ITEMS } from './config.js';
import {
  validateSyncGubs,
  validatePurchaseItem,
  validateAdminUpdate,
  validateAdminDelete,
} from './validation.js';
import { totalCost } from './shared/cost.js';
import { logError, logAction } from './logging.js';
import { ADMINS_PATH, LEADERBOARD_PATH, SHOP_PATH } from './paths.js';

admin.initializeApp();

async function isAdmin(uid) {
  const snap = await admin
    .database()
    .ref(`${ADMINS_PATH}/${uid}`)
    .once('value');
  return snap.val() === true;
}

function withAuth(handler) {
  return async (data, ctx) => {
    const uid = ctx.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError('unauthenticated');
    }
    return handler(uid, data, ctx);
  };
}

export const syncGubs = functions.https.onCall(
  withAuth(async (uid, data) => {
    try {
      const { delta, requestOffline } = validateSyncGubs(data);

      const db = admin.database();
      const userRef = db.ref(`${LEADERBOARD_PATH}/${uid}`);
      const shop =
        (await db.ref(`${SHOP_PATH}/${uid}`).once('value')).val() || {};
      const rate = Object.entries(shop).reduce(
        (sum, [k, v]) => sum + (RATES[k] || 0) * v,
        0,
      );

      let offlineEarned = 0;
      const now = Date.now();
      const result = await userRef.transaction((curr) => {
        let user = curr;
        // Handle legacy scores stored as a raw number instead of an object
        if (typeof user !== 'object' || user === null) {
          user = { score: Number(user) || 0 };
        }
        const score = Number(user.score) || 0;
        const lastUpdated = Number(user.lastUpdated) || now;
        if (requestOffline) {
          offlineEarned = calculateOfflineGubs(rate, lastUpdated, now);
        }
        return {
          ...user,
          score: score + delta + offlineEarned,
          lastUpdated: now,
        };
      });
      const newScore = result.snapshot.child('score').val() || 0;
      functions.logger.info('syncGubs', {
        uid,
        delta,
        offlineEarned,
        newScore,
      });
      return { score: newScore, offlineEarned };
    } catch (err) {
      await logError('server', err, { function: 'syncGubs', uid, data });
      throw err;
    }
  }),
);

export const purchaseItem = functions.https.onCall(
  withAuth(async (uid, data) => {
    let item, quantity;
    try {
      ({ item, quantity } = validatePurchaseItem(data));
      const db = admin.database();
      // Log current values before attempting the transaction so we can compare
      // what the transaction sees versus what's stored in the database.
      const [preScoreSnap, preOwnedSnap] = await Promise.all([
        db.ref(`${LEADERBOARD_PATH}/${uid}`).once('value'),
        db.ref(`${SHOP_PATH}/${uid}/${item}`).once('value'),
      ]);
      const rawScore = preScoreSnap.val();
      const preScore =
        typeof rawScore === 'object'
          ? Number(rawScore?.score) || 0
          : Number(rawScore) || 0;
      const preOwned = Number(preOwnedSnap.val()) || 0;
      functions.logger.info('purchaseItem.precheck', {
        uid,
        item,
        score: preScore,
        owned: preOwned,
      });

      // Calculate cost based on pre-transaction values
      const cost = totalCost(
        SHOP_ITEMS[item],
        preOwned,
        quantity,
        COST_MULTIPLIER,
      );

      // Ensure the user's recorded score meets the cost before attempting
      // the transactional deduction to avoid unnecessary retries
      if (preScore < cost) {
        await logError('server', new Error('Not enough gubs'), {
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
      const userRef = db.ref(`${LEADERBOARD_PATH}/${uid}`);
      const scoreResult = await userRef.transaction((curr) => {
        let user = curr;
        if (typeof user !== 'object' || user === null) {
          user = { score: Number(user) || 0 };
        }
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
        await logError('server', new Error('Not enough gubs'), {
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
        .ref(`${SHOP_PATH}/${uid}/${item}`)
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
      await logError('server', err, { function: 'purchaseItem', uid, data });
      throw err;
    }
  }),
);

export const updateUserScore = functions.https.onCall(
  withAuth(async (uid, data) => {
    try {
      if (!(await isAdmin(uid))) {
        throw new functions.https.HttpsError('permission-denied');
      }
      const { username, score } = validateAdminUpdate(data);
      const db = admin.database();
      const snap = await db
        .ref(LEADERBOARD_PATH)
        .orderByChild('username')
        .equalTo(username)
        .once('value');
      if (!snap.exists()) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }
      const updates = [];
      snap.forEach((child) => {
        updates.push(child.ref.update({ score }));
      });
      await Promise.all(updates);
      await logAction('admin', {
        action: 'updateUserScore',
        admin: uid,
        username,
        score,
      });
      return { success: true };
    } catch (err) {
      await logError('server', err, { function: 'updateUserScore', uid, data });
      throw err;
    }
  }),
);

export const deleteUser = functions.https.onCall(
  withAuth(async (uid, data) => {
    try {
      if (!(await isAdmin(uid))) {
        throw new functions.https.HttpsError('permission-denied');
      }
      const { username } = validateAdminDelete(data);
      const db = admin.database();
      const snap = await db
        .ref(LEADERBOARD_PATH)
        .orderByChild('username')
        .equalTo(username)
        .once('value');
      if (!snap.exists()) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }
      const removals = [];
      snap.forEach((child) => removals.push(child.ref.remove()));
      await Promise.all(removals);
      await logAction('admin', { action: 'deleteUser', admin: uid, username });
      return { success: true };
    } catch (err) {
      await logError('server', err, { function: 'deleteUser', uid, data });
      throw err;
    }
  }),
);
