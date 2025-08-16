// functions/index.js
import * as functions from 'firebase-functions';
import admin from 'firebase-admin';

import { calculateOfflineGubs } from './offline.js';
import { RATES, SHOP_ITEMS, COST_MULTIPLIERS, UPGRADES } from './config.js';
import {
  validateSyncGubs,
  validatePurchaseItem,
  validatePurchaseUpgrade,
  validateAdminUpdate,
  validateAdminDelete,
} from './validation.js';
import { totalCost } from './shared/cost.js';
import { logError, logAction } from './logging.js';
import {
  ADMINS_PATH,
  LEADERBOARD_PATH,
  SHOP_PATH,
  UPGRADES_PATH,
} from './paths.js';
const LOCKS_BASE = '_sys/runtime/locks_v1';

admin.initializeApp({
  databaseURL: 'https://gub-leaderboard-default-rtdb.firebaseio.com',
});

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
    if (!uid) throw new functions.https.HttpsError('unauthenticated');
    return handler(uid, data, ctx);
  };
}

/**
 * Simple per-UID mutex using RTDB, stored under _sys/runtime/locks_v1/<uid>
 * so it stays out of your way in the console UI.
 */
async function withUserLock(uid, owner, fn) {
  const db = admin.database();
  const lockRef = db.ref(`${LOCKS_BASE}/${uid}`);
  const TTL_MS = 8000;
  const MAX_TRIES = 80;

  // If you want jitter back, swap this for a jittery delay
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

    // Small backoff before retrying
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

        // Transaction on the user node; the per-UID lock prevents overlap with purchaseItem.
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

/** -------- purchaseItem (lock + read/verify + multi-path update) -------- */
export const purchaseItem = functions.https.onCall(
  withAuth(async (uid, data) => {
    return withUserLock(uid, 'purchaseItem', async () => {
      try {
        const { item, quantity } = validatePurchaseItem(data);
        const db = admin.database();

        const scoreRef = db.ref(`${LEADERBOARD_PATH}/${uid}/score`);
        const itemRef = db.ref(`${SHOP_PATH}/${uid}/${item}`);

        // Read current state
        const [scoreSnap, ownedSnap] = await Promise.all([
          scoreRef.once('value'),
          itemRef.once('value'),
        ]);

        const currentScore = Number(scoreSnap.val()) || 0;
        const ownedBefore = Number(ownedSnap.val()) || 0;

        const cost = totalCost(
          SHOP_ITEMS[item],
          ownedBefore,
          quantity,
          COST_MULTIPLIERS[item],
        );

        if (currentScore < cost) {
          await logError('server', new Error('Not enough gubs'), {
            function: 'purchaseItem',
            uid,
            data,
            score: currentScore,
            cost,
            owned: ownedBefore,
          });
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Not enough gubs: have ${currentScore}, need ${cost}`,
          );
        }

        // Compute new values
        const now = Date.now();
        const newScore = currentScore - cost;
        const newOwned = ownedBefore + quantity;

        // Single atomic multi-location update
        const updates = {};
        updates[`${LEADERBOARD_PATH}/${uid}/score`] = newScore;
        updates[`${LEADERBOARD_PATH}/${uid}/lastUpdated`] = now;
        updates[`${SHOP_PATH}/${uid}/${item}`] = newOwned;

        await db.ref().update(updates);

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
        if (err instanceof functions.https.HttpsError) throw err;
        throw new functions.https.HttpsError(
          'aborted',
          'Could not complete purchase, please try again.',
        );
      }
    });
  }),
);

/** -------- purchaseUpgrade (single-purchase upgrades) -------- */
export const purchaseUpgrade = functions.https.onCall(
  withAuth(async (uid, data) => {
    return withUserLock(uid, 'purchaseUpgrade', async () => {
      try {
        const { upgrade } = validatePurchaseUpgrade(data);
        const db = admin.database();

        const scoreRef = db.ref(`${LEADERBOARD_PATH}/${uid}/score`);
        const upgradeRef = db.ref(`${UPGRADES_PATH}/${uid}/${upgrade}`);

        const itemPath = `${SHOP_PATH}/${uid}/${UPGRADES[upgrade].target}`;
        const itemRef = db.ref(itemPath);
        const [scoreSnap, ownedSnap, itemSnap] = await Promise.all([
          scoreRef.once('value'),
          upgradeRef.once('value'),
          itemRef.once('value'),
        ]);

        const currentScore = Number(scoreSnap.val()) || 0;
        const alreadyOwned = ownedSnap.val() === true;
        const ownedCount = Number(itemSnap.val()) || 0;
        if (alreadyOwned) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Upgrade already owned',
          );
        }
        const { cost, unlockAt = 0 } = UPGRADES[upgrade];
        if (ownedCount < unlockAt) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Need ${unlockAt} ${UPGRADES[upgrade].target} to unlock`,
          );
        }
        if (currentScore < cost) {
          await logError('server', new Error('Not enough gubs'), {
            function: 'purchaseUpgrade',
            uid,
            data,
            score: currentScore,
            cost,
          });
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Not enough gubs: have ${currentScore}, need ${cost}`,
          );
        }

        const newScore = currentScore - cost;
        const now = Date.now();
        const updates = {};
        updates[`${LEADERBOARD_PATH}/${uid}/score`] = newScore;
        updates[`${LEADERBOARD_PATH}/${uid}/lastUpdated`] = now;
        updates[`${UPGRADES_PATH}/${uid}/${upgrade}`] = true;

        await db.ref().update(updates);

        functions.logger.info('purchaseUpgrade.success', {
          uid,
          upgrade,
          cost,
          score: newScore,
        });

        return { score: newScore, owned: true };
      } catch (err) {
        await logError('server', err, {
          function: 'purchaseUpgrade',
          uid,
          data,
        });
        if (err instanceof functions.https.HttpsError) throw err;
        throw new functions.https.HttpsError(
          'aborted',
          'Could not complete purchase, please try again.',
        );
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
