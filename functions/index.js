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

// DEBUG: confirm functions are pointed at the right DB/project
functions.logger.info('admin.init', {
  dbURL: admin.app().options.databaseURL,
  projectId: process.env.GCLOUD_PROJECT,
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

      // DEBUG: prove what we see before the transaction (once only while debugging)
      const [lbAnySnap, userNodeSnap] = await Promise.all([
        db.ref(LEADERBOARD_PATH).limitToFirst(1).once('value'),
        db.ref(`${LEADERBOARD_PATH}/${uid}`).once('value'),
      ]);
      functions.logger.info('purchaseItem.env', {
        uid,
        lbExists: lbAnySnap.exists(),
        userNodeType: typeof userNodeSnap.val(),
        userNode: userNodeSnap.val(),
      });

      let cost = 0;

      const result = await db.ref().transaction((root) => {
        const state = root || {};
        const leaderboard = state[LEADERBOARD_PATH] || {};
        const shop = state[SHOP_PATH] || {};

        // TEMP sanity log – remove after confirming
        functions.logger.info('purchaseItem.txState', {
          hasLb: !!state[LEADERBOARD_PATH],
          type: typeof leaderboard[uid],
          raw: leaderboard[uid],
        });

        // Normalize user node if legacy value was a number/null
        let user = leaderboard[uid];
        if (typeof user !== 'object' || user === null) {
          user = { score: Number(user) || 0, lastUpdated: Date.now() };
        }
        const currentScore = Number(user.score) || 0;

        const owned = Number(shop[uid]?.[item]) || 0;

        cost = totalCost(SHOP_ITEMS[item], owned, quantity, COST_MULTIPLIER);
        if (currentScore < cost) return; // abort

        const now = Date.now();
        const newScore = currentScore - cost;
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

      // If the transaction aborted, read fresh values for an accurate error
      if (!result.committed) {
        const [scoreSnap, ownedSnap] = await Promise.all([
          admin.database().ref(`${LEADERBOARD_PATH}/${uid}/score`).once('value'),
          admin.database().ref(`${SHOP_PATH}/${uid}/${item}`).once('value'),
        ]);
        const have = Number(scoreSnap.val()) || 0;
        const owned = Number(ownedSnap.val()) || 0;
        const need = totalCost(SHOP_ITEMS[item], owned, quantity, COST_MULTIPLIER);

        await logError('server', new Error('Not enough gubs'), {
          function: 'purchaseItem',
          uid,
          data,
          score: have,
          cost: need,
          owned,
        });

        throw new functions.https.HttpsError(
          'failed-precondition',
          `Not enough gubs: have ${have}, need ${need}`,
        );
      }

      // Success: pull values from the committed snapshot
      const snapshot = result.snapshot;
      const newScore =
        Number(snapshot.child(`${LEADERBOARD_PATH}/${uid}/score`).val()) || 0;
      const newOwned =
        Number(snapshot.child(`${SHOP_PATH}/${uid}/${item}`).val()) || 0;

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
