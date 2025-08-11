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

admin.initializeApp({
  databaseURL: 'https://gub-leaderboard-default-rtdb.firebaseio.com',
});

async function isAdmin(uid) {
  const snap = await admin.database().ref(`${ADMINS_PATH}/${uid}`).once('value');
  return snap.val() === true;
}

function withAuth(handler) {
  return async (data, ctx) => {
    const uid = ctx.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated');
    return handler(uid, data, ctx);
  };
}

/** Skip sync while a purchase lock is held to avoid txn collisions. */
export const syncGubs = functions.https.onCall(
  withAuth(async (uid, data) => {
    try {
      const { delta, requestOffline } = validateSyncGubs(data);
      const db = admin.database();

      const locked = (await db.ref(`locks/purchase/${uid}`).once('value')).val() === true;
      if (locked) {
        const scoreSnap = await db.ref(`${LEADERBOARD_PATH}/${uid}/score`).once('value');
        const score = Number(scoreSnap.val()) || 0;
        return { score, offlineEarned: 0 };
      }

      const userRef = db.ref(`${LEADERBOARD_PATH}/${uid}`);
      const shop = (await db.ref(`${SHOP_PATH}/${uid}`).once('value')).val() || {};
      const rate = Object.entries(shop).reduce((sum, [k, v]) => sum + (RATES[k] || 0) * v, 0);

      let offlineEarned = 0;
      const now = Date.now();

      const result = await userRef.transaction((curr) => {
        let user = curr;
        if (typeof user !== 'object' || user === null) user = { score: Number(user) || 0 };
        const score = Number(user.score) || 0;
        const lastUpdated = Number(user.lastUpdated) || now;
        if (requestOffline) offlineEarned = calculateOfflineGubs(rate, lastUpdated, now);
        return { ...user, score: score + delta + offlineEarned, lastUpdated: now };
      });

      const newScore = result.snapshot.child('score').val() || 0;
      return { score: newScore, offlineEarned };
    } catch (err) {
      await logError('server', err, { function: 'syncGubs', uid, data });
      throw err;
    }
  }),
);

/**
 * Purchase with a per-user lock:
 * 1) Acquire /locks/purchase/<uid>
 * 2) Txn on /leaderboard_v3/<uid> to deduct cost (same node as syncGubs)
 * 3) Txn on /shop_v2/<uid>/<item> to increment owned
 * 4) If step 3 fails, refund in a user-level txn
 * 5) Release lock
 */
export const purchaseItem = functions.https.onCall(
  withAuth(async (uid, data) => {
    const db = admin.database();
    const lockRef = db.ref(`locks/purchase/${uid}`);

    // Acquire lock
    const lockTx = await lockRef.transaction((curr) => (curr ? undefined : true));
    if (!lockTx.committed) {
      throw new functions.https.HttpsError('aborted', 'Purchase busy, try again.');
    }

    try {
      const { item, quantity } = validatePurchaseItem(data);

      const userRef = db.ref(`${LEADERBOARD_PATH}/${uid}`);
      const itemRef = db.ref(`${SHOP_PATH}/${uid}/${item}`);

      // Read owned to compute cost
      const ownedBefore = Number((await itemRef.once('value')).val()) || 0;
      const baseCost = SHOP_ITEMS[item];
      const cost = totalCost(baseCost, ownedBefore, quantity, COST_MULTIPLIER);

      // 2) Deduct on the SAME NODE as syncGubs to avoid path conflicts
      const userTx = await userRef.transaction((curr) => {
        let user = curr;
        if (typeof user !== 'object' || user === null) {
          user = { score: Number(user) || 0, lastUpdated: Date.now() };
        }
        const currentScore = Number(user.score) || 0;
        if (currentScore < cost) return; // abort if truly unaffordable
        return {
          ...user,
          score: currentScore - cost,
          lastUpdated: Date.now(),
        };
      });

      if (!userTx.committed) {
        // Accurate message from fresh read
        const have = Number((await userRef.child('score').once('value')).val()) || 0;
        await logError('server', new Error('Not enough gubs'), {
          function: 'purchaseItem',
          uid,
          data,
          score: have,
          cost,
          owned: ownedBefore,
        });
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Not enough gubs: have ${have}, need ${cost}`,
        );
      }

      const newScore = Number(userTx.snapshot.child('score').val()) || 0;

      // 3) Increment owned; 4) refund if it fails
      const ownedTx = await itemRef.transaction((curr) => (Number(curr) || 0) + quantity);
      if (!ownedTx.committed) {
        // Refund at user level
        await userRef.transaction((curr) => {
          let user = curr;
          if (typeof user !== 'object' || user === null) {
            user = { score: Number(user) || 0, lastUpdated: Date.now() };
          }
          const refunded = (Number(user.score) || 0) + cost;
          return { ...user, score: refunded, lastUpdated: Date.now() };
        });

        await logError('server', new Error('Purchase rollback'), {
          function: 'purchaseItem',
          uid,
          data,
          reason: 'owned increment failed',
          cost,
        });
        throw new functions.https.HttpsError('aborted', 'Purchase failed, your gubs were refunded.');
      }

      const newOwned = Number(ownedTx.snapshot.val()) || 0;

      functions.logger.info('purchaseItem.success', {
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
    } finally {
      await lockRef.remove().catch(() => {});
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
      snap.forEach((child) => updates.push(child.ref.update({ score })));
      await Promise.all(updates);
      await logAction('admin', { action: 'updateUserScore', admin: uid, username, score });
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
