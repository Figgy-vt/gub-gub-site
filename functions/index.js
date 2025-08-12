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

/** ---------------- purchaseItem (single atomic transaction) ---------------- */
export const purchaseItem = functions.https.onCall(
  withAuth(async (uid, data) => {
    return withUserLock(uid, 'purchaseItem', async () => {
      let item, quantity;
      try {
        ({ item, quantity } = validatePurchaseItem(data));
        const db = admin.database();

        // One root transaction to read + modify both score and owned atomically.
        let computedCost = 0;

        const result = await db.ref().transaction((root) => {
          const state = root || {};
          const leaderboard = state[LEADERBOARD_PATH] || {};
          const shop = state[SHOP_PATH] || {};

          let user = leaderboard[uid];
          // Normalize legacy numeric/null user node
          if (typeof user !== 'object' || user === null) {
            user = { score: Number(user) || 0, lastUpdated: Date.now() };
          }

          const currentScore = Number(user.score) || 0;
          const owned = Number(shop[uid]?.[item]) || 0;

          // Compute total cost of this batch at current owned
          computedCost = totalCost(SHOP_ITEMS[item], owned, quantity, COST_MULTIPLIER);

          // Insufficient -> abort txn (no commit)
          if (currentScore < computedCost) return;

          const now = Date.now();
          const newScore = currentScore - computedCost;
          const newOwned = owned + quantity;

          return {
            ...state,
            [LEADERBOARD_PATH]: {
              ...leaderboard,
              [uid]: { ...user, score: newScore, lastUpdated: now },
            },
            [SHOP_PATH]: {
              ...shop,
              [uid]: { ...(shop[uid] || {}), [item]: newOwned },
            },
          };
        });

        if (!result.committed) {
          // Re-read to craft an accurate error
          const [scoreSnap, ownedSnap] = await Promise.all([
            admin.database().ref(`${LEADERBOARD_PATH}/${uid}/score`).once('value'),
            admin.database().ref(`${SHOP_PATH}/${uid}/${item}`).once('value'),
          ]);
          const have = Number(scoreSnap.val()) || 0;
          const ownedNow = Number(ownedSnap.val()) || 0;
          const need = totalCost(SHOP_ITEMS[item], ownedNow, quantity, COST_MULTIPLIER);

          // If truly not enough, say so; otherwise mark as transient conflict
          if (have < need) {
            await logError('server', new Error('Not enough gubs'), {
              function: 'purchaseItem',
              uid,
              data,
              score: have,
              cost: need,
              owned: ownedNow,
            });
            throw new functions.https.HttpsError(
              'failed-precondition',
              `Not enough gubs: have ${have}, need ${need}`,
            );
          } else {
            await logError('server', new Error('Purchase conflict'), {
              function: 'purchaseItem',
              uid,
              data,
              score: have,
              cost: need,
              owned: ownedNow,
            });
            throw new functions.https.HttpsError(
              'aborted',
              'Could not complete purchase, please try again.',
            );
          }
        }

        const snap = result.snapshot;
        const newScore =
          Number(snap.child(`${LEADERBOARD_PATH}/${uid}/score`).val()) || 0;
        const newOwned =
          Number(snap.child(`${SHOP_PATH}/${uid}/${item}`).val()) || 0;

        functions.logger.info('purchaseItem.success', {
          uid,
          item,
          quantity,
          cost: computedCost,
          score: newScore,
          owned: newOwned,
        });

        return { score: newScore, owned: newOwned };
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
