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

functions.logger.info('admin.init', {
  dbURL: admin.app().options.databaseURL,
  projectId: process.env.GCLOUD_PROJECT,
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
 * Per-UID mutex in RTDB to serialize server work (prevents syncGubs/purchaseItem collisions).
 */
async function withUserLock(uid, owner, fn) {
  const db = admin.database();
  const lockRef = db.ref(`locks/${uid}`);
  const TTL_MS = 8000;
  const MAX_TRIES = 80;
  const BACKOFF_MS = 75;

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const now = Date.now();
    const res = await lockRef.transaction((curr) => {
      // Acquire if missing or expired
      if (curr && Number(curr.expires) > now) return; // keep existing (no commit)
      return { by: owner, since: now, expires: now + TTL_MS };
    });
    if (res.committed) {
      try {
        return await fn();
      } finally {
        // best-effort unlock
        lockRef.remove().catch(() => {});
      }
    }
    await new Promise((r) => setTimeout(r, BACKOFF_MS));
  }
  throw new functions.https.HttpsError('aborted', 'Busy, try again.');
}

/** ---------------- syncGubs ---------------- */
export const syncGubs = functions.https.onCall(
  withAuth(async (uid, data) => {
    return withUserLock(uid, 'syncGubs', async () => {
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
        const tx = await userRef.transaction((curr) => {
          let user = curr;
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

        const newScore = Number(tx.snapshot.child('score').val()) || 0;

        functions.logger.info('syncGubs.success', {
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
    });
  }),
);

/** ---------------- purchaseItem (score child transaction + owned increment) ---------------- */
export const purchaseItem = functions.https.onCall(
  withAuth(async (uid, data) => {
    return withUserLock(uid, 'purchaseItem', async () => {
      // version marker so we can confirm the deployed code path
      functions.logger.info('purchaseItem.version', { v: 'score-child-tx-1' });

      let item, quantity;
      try {
        ({ item, quantity } = validatePurchaseItem(data));
        const db = admin.database();

        const userRef  = db.ref(`${LEADERBOARD_PATH}/${uid}`);
        const scoreRef = userRef.child('score');
        const itemRef  = db.ref(`${SHOP_PATH}/${uid}/${item}`);

        // Read owned to compute cost once
        const ownedBefore = Number((await itemRef.once('value')).val()) || 0;
        const baseCost = SHOP_ITEMS[item];
        const cost = totalCost(baseCost, ownedBefore, quantity, COST_MULTIPLIER);

        functions.logger.info('purchaseItem.start', {
          uid, item, quantity, cost, ownedBefore,
        });

        // ---- Deduct score: transaction on the *number* only ----
        async function tryDeduct() {
          const tx = await scoreRef.transaction((curr) => {
            const currentScore = Number(curr) || 0;
            if (currentScore < cost) return; // abort
            return currentScore - cost;
          });
          return tx;
        }

        let tx = await tryDeduct();

        if (!tx.committed) {
          // Not committed — check if truly insufficient or just contention
          const have = Number((await scoreRef.once('value')).val()) || 0;
          if (have < cost) {
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

          // One more attempt after a brief backoff
          await new Promise((r) => setTimeout(r, 75));
          tx = await tryDeduct();

          if (!tx.committed) {
            await logError('server', new Error('Score deduction contention'), {
              function: 'purchaseItem',
              uid,
              data,
              cost,
              owned: ownedBefore,
            });
            throw new functions.https.HttpsError(
              'aborted',
              'Could not complete purchase, please try again.',
            );
          }
        }

        const committedScoreVal = Number(tx.snapshot.val()) || 0;

        // ---- Increment owned; refund on failure ----
        const ownedTx = await itemRef.transaction((curr) => (Number(curr) || 0) + quantity);
        if (!ownedTx.committed) {
          // Refund score
          await scoreRef.transaction((curr) => (Number(curr) || 0) + cost);
          await logError('server', new Error('Purchase rollback'), {
            function: 'purchaseItem',
            uid,
            data,
            reason: 'owned increment failed',
            cost,
          });
          throw new functions.https.HttpsError(
            'aborted',
            'Purchase failed, your gubs were refunded.',
          );
        }

        const newOwned = Number(ownedTx.snapshot.val()) || 0;

        // Best-effort lastUpdated (not part of the transaction)
        userRef.child('lastUpdated').set(Date.now()).catch(() => {});

        functions.logger.info('purchaseItem.success', {
          uid,
          item,
          quantity,
          cost,
          score: committedScoreVal,
          owned: newOwned,
        });

        return { score: committedScoreVal, owned: newOwned };
      } catch (err) {
        await logError('server', err, { function: 'purchaseItem', uid, data });
        throw err;
      }
    });
  }),
);

/** ---------------- admin helpers ---------------- */
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
