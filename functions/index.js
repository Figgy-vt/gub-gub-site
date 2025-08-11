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

/**
 * If a purchase lock is held for this user, we skip mutating state here.
 * This avoids transaction collisions with purchaseItem.
 */
export const syncGubs = functions.https.onCall(
  withAuth(async (uid, data) => {
    try {
      const { delta, requestOffline } = validateSyncGubs(data);
      const db = admin.database();

      // Bail out during purchase to avoid txn collisions; client will retry next tick.
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
 * Purchase flow with a per-user lock:
 * 1) Acquire lock /locks/purchase/<uid>
 * 2) Deduct score via /leaderboard_v3/<uid>/score transaction (with small retry)
 * 3) Increment /shop_v2/<uid>/<item> in a transaction
 * 4) If step 3 fails, refund the cost
 * 5) Release lock
 */
export const purchaseItem = functions.https.onCall(
  withAuth(async (uid, data) => {
    let item, quantity;
    const db = admin.database();
    const lockRef = db.ref(`locks/purchase/${uid}`);

    // Acquire lock (fail if already locked)
    const lockTx = await lockRef.transaction((curr) => (curr ? undefined : true));
    if (!lockTx.committed) {
      throw new functions.https.HttpsError('aborted', 'Purchase busy, try again.');
    }

    try {
      ({ item, quantity } = validatePurchaseItem(data));

      const userRef = db.ref(`${LEADERBOARD_PATH}/${uid}`);
      const scoreRef = userRef.child('score');
      const itemRef = db.ref(`${SHOP_PATH}/${uid}/${item}`);

      // Read owned to compute cost
      const ownedSnap = await itemRef.once('value');
      const ownedBefore = Number(ownedSnap.val()) || 0;

      const baseCost = SHOP_ITEMS[item];
      const cost = totalCost(baseCost, ownedBefore, quantity, COST_MULTIPLIER);

      // Deduct score (retry a few times to avoid rare txn clashes)
      async function deductScoreWithRetry(ref, maxTries = 5) {
        let lastHave = 0;
        for (let i = 0; i < maxTries; i++) {
          const tx = await ref.transaction((curr) => {
            const have = Number(curr) || 0;
            if (have < cost) return; // abort this attempt if truly unaffordable
            return have - cost;
          });

          if (tx.committed) return Number(tx.snapshot.val()) || 0;

          // Not committed: check fresh; if affordable, retry; else fail fast.
          const haveSnap = await ref.once('value');
          lastHave = Number(haveSnap.val()) || 0;
          if (lastHave < cost) {
            throw new functions.https.HttpsError(
              'failed-precondition',
              `Not enough gubs: have ${lastHave}, need ${cost}`,
            );
          }
        }
        await logError('server', new Error('Deduct retries exhausted'), {
          function: 'purchaseItem',
          uid,
          data,
          cost,
          lastHave,
        });
        throw new functions.https.HttpsError('aborted', 'Could not complete purchase, please try again.');
      }

      const newScore = await deductScoreWithRetry(scoreRef);
      // Keep lastUpdated fresh for offline calc while we hold the lock
      await userRef.child('lastUpdated').set(Date.now());

      // Increment owned; on failure, refund
      const ownedTx = await itemRef.transaction((curr) => (Number(curr) || 0) + quantity);
      if (!ownedTx.committed) {
        // Refund
        await scoreRef.transaction((curr) => (Number(curr) || 0) + cost);
        await userRef.child('lastUpdated').set(Date.now());

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
      // Always release the lock
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
