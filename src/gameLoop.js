import { initChat } from './chat.js';
import { initGoldenGubs } from './goldenGub.js';
import { initPresenceAndLeaderboard } from './presence.js';
import { initShop } from './shop.js';
import { logError } from './logger.js';

export function initGameLoop({
  db,
  functions,
  auth,
  username,
  sanitizeUsername,
  playMentionSound,
  playBuySound = () => {},
  CLIENT_VERSION,
  imageState,
}) {
  const syncGubsFn = functions.httpsCallable('syncGubs');
  const purchaseItemFn = functions.httpsCallable('purchaseItem');
  const purchaseUpgradeFn = functions.httpsCallable('purchaseUpgrade');
  const updateUserScoreFn = functions.httpsCallable('updateUserScore');
  const deleteUserFn = functions.httpsCallable('deleteUser');
  const uid = auth.currentUser.uid;
  const allUsers = new Set([username]);

  const offlineModal = document.getElementById('offlineModal');
  const offlineMessage = document.getElementById('offlineMessage');
  const offlineClose = document.getElementById('offlineClose');
  const offlineCloseHandler = () => {
    offlineModal.style.display = 'none';
  };
  offlineClose.addEventListener('click', offlineCloseHandler);

  initPresenceAndLeaderboard({
    db,
    uid,
    username,
    sanitizeUsername,
    allUsers,
    CLIENT_VERSION,
  });

  let sessionCount = 0,
    globalCount = 0,
    displayedCount = 0,
    unsyncedDelta = 0;
  let offlineShown = false;
  let gubRateMultiplier = 1;
  let scoreDirty = false;
  let syncPaused = false;

  // explicit pause/resume hooks (shop can use these if needed)
  function pauseSync() {
    syncPaused = true;
  }
  function resumeSync() {
    syncPaused = false;
  }

  let syncingPromise = null;
  async function syncGubsFromServer(requestOffline = false) {
    if (syncingPromise) return syncingPromise;

    const sendDelta = Math.floor(unsyncedDelta);
    unsyncedDelta -= sendDelta;

    syncingPromise = (async () => {
      try {
        // Build payload that supports both keys to match server validator
        const payload = { delta: sendDelta };
        if (requestOffline) {
          payload.requestOffline = true;
          payload.offline = true;
        }
        const res = await syncGubsFn(payload);

        if (res.data && typeof res.data.score === 'number') {
          const { score, offlineEarned = 0 } = res.data;
          globalCount = displayedCount = score + unsyncedDelta;
          renderCounter();

          if (requestOffline && !offlineShown && offlineEarned > 0) {
            offlineMessage.textContent = `You earned ${abbreviateNumber(offlineEarned)} gubs while you were away!`;
            offlineModal.style.display = 'block';
            offlineShown = true;
          }
        } else {
          // revert on failure
          unsyncedDelta += sendDelta;
        }
      } catch (err) {
        unsyncedDelta += sendDelta;
        console.error('syncGubs failed', err);
        logError(db, {
          message: err.message,
          stack: err.stack,
          context: 'syncGubsFromServer',
        });
        throw err;
      } finally {
        syncingPromise = null;
      }
    })();

    return syncingPromise;
  }

  function queueScoreUpdate() {
    scoreDirty = true;
  }

  const scoreInterval = setInterval(() => {
    if (scoreDirty && !syncPaused) {
      scoreDirty = false;
      syncGubsFromServer().catch(() => {});
    }
  }, 1000);

  // Regularly pull server-side gub totals even if no local actions
  const syncInterval = setInterval(() => {
    if (!syncPaused) {
      syncGubsFromServer().catch(() => {});
    }
  }, 10000);

  function abbreviateNumber(num) {
    if (num < 1000) return Math.floor(num).toString();
    const units = [
      '',
      'k',
      'm',
      'b',
      't',
      'quad',
      'quin',
      'sext',
      'sept',
      'octi',
      'noni',
      'deci',
    ];
    let idx = Math.floor(Math.log10(num) / 3);
    if (idx >= units.length) idx = units.length - 1;
    const scaled = num / Math.pow(1000, idx);
    return scaled.toFixed(2) + units[idx];
  }

  // Load or initialize user's score, migrating legacy username entries
  const userRef = db.ref(`leaderboard_v3/${uid}/score`);
  const leaderboardRef = db
    .ref('leaderboard_v3')
    .orderByChild('score')
    .limitToLast(10);

  function userValueListener(s) {
    const v = s.val();
    if (typeof v === 'number') {
      const total = v + unsyncedDelta;
      globalCount = displayedCount = total;
      scoreDirty = unsyncedDelta !== 0;
      renderCounter();
    }
  }

  function leaderboardListener(snap) {
    const list = [];
    snap.forEach((child) => {
      const data = child.val() || {};
      const user = sanitizeUsername(data.username || '');
      list.push({ user, score: data.score || 0 });
      allUsers.add(user);
    });
    list.sort((a, b) => b.score - a.score);
    const lbEl = document.getElementById('leaderboard');
    lbEl.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = 'Leaderboard (Top 10)';
    lbEl.appendChild(title);
    lbEl.appendChild(document.createElement('br'));
    list.forEach((e, i) => {
      const line = document.createElement('div');
      line.textContent = `${i + 1}. ${e.user}: ${abbreviateNumber(e.score)}`;
      lbEl.appendChild(line);
    });
  }

  userRef.once('value').then(async (snap) => {
    if (snap.exists()) {
      globalCount = snap.val() || 0;
    } else {
      const legacyRef = db.ref(`leaderboard_v3/${username}/score`);
      const legacySnap = await legacyRef.once('value');
      globalCount = legacySnap.val() || 0;
      if (legacySnap.exists()) {
        await legacyRef.parent.remove();
      }
    }
    displayedCount = globalCount;
    renderCounter();
    syncGubsFromServer(true).catch(() => {});

    // Keep local score in sync with external/manual updates
    userRef.on('value', userValueListener);

    // Real-time leaderboard updates (top 10 only)
    leaderboardRef.on('value', leaderboardListener);
  });

  initChat({
    db,
    username,
    allUsers,
    sanitizeUsername,
    playMentionSound,
  });

  // Elements for displaying totals and rate
  const gubTotalEl = document.getElementById('gubTotal');
  let passiveRatePerSec = 0;

  const passiveWorker = new Worker(
    new URL('./passiveWorker.js', import.meta.url),
    { type: 'module' },
  );
  passiveWorker.onmessage = (e) => {
    const { earned } = e.data || {};
    if (typeof earned === 'number' && earned > 0) {
      gainGubs(earned);
    }
  };
  passiveWorker.postMessage({ type: 'rate', value: passiveRatePerSec });

  function renderCounter() {
    const rate = abbreviateNumber(passiveRatePerSec * gubRateMultiplier);
    gubTotalEl.textContent =
      'Gubs: ' +
      abbreviateNumber(Math.floor(displayedCount)) +
      ' (' +
      rate +
      ' gub/s)';
  }

  function gainGubs(amount) {
    amount *= gubRateMultiplier;
    globalCount += amount;
    displayedCount += amount;
    unsyncedDelta += amount;
    renderCounter();
    queueScoreUpdate();
  }

  function spendGubs(amount) {
    globalCount -= amount;
    displayedCount -= amount;
    unsyncedDelta -= amount;
    renderCounter();
    queueScoreUpdate();
  }

  const visibilityHandler = () => {
    if (!document.hidden) {
      passiveWorker.postMessage({ type: 'reset' });
      syncGubsFromServer(true).catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  // main gub handler
  const mainGub = document.getElementById('main-gub');
  const clickMe = document.getElementById('clickMe');
  if (!sessionStorage.getItem('gubClicked')) {
    clickMe.style.display = 'block';
  }
  let popTimeout;

  const mainGubHandler = (e) => {
    clickMe.style.display = 'none';
    sessionStorage.setItem('gubClicked', 'true');
    const clickGain = gubRateMultiplier;
    sessionCount += clickGain;
    gainGubs(clickGain);

    const plusOne = document.createElement('div');
    plusOne.textContent = '+' + abbreviateNumber(clickGain);
    plusOne.className = 'plus-one';
    plusOne.style.left = `${e.clientX}px`;
    plusOne.style.top = `${e.clientY}px`;
    document.body.appendChild(plusOne);
    setTimeout(() => plusOne.remove(), 1000);

    mainGub.classList.remove('pop-effect');
    void mainGub.offsetWidth;
    mainGub.classList.add('pop-effect');

    clearTimeout(popTimeout);
    popTimeout = setTimeout(() => mainGub.classList.remove('pop-effect'), 150);
  };
  mainGub.addEventListener('click', mainGubHandler);

  const golden = initGoldenGubs({
    getImages: () => imageState.images,
    getGlobalCount: () => globalCount,
    getGubRateMultiplier: () => gubRateMultiplier,
    setGubRateMultiplier: (v) => {
      gubRateMultiplier = v;
    },
    mainGub,
    renderCounter,
    gainGubs,
    abbreviateNumber,
    incrementSessionCount: (amt) => {
      sessionCount += amt;
    },
  });
  golden.scheduleNextGolden();

  const gameState = {
    get globalCount() {
      return globalCount;
    },
    set globalCount(v) {
      globalCount = v;
    },

    get displayedCount() {
      return displayedCount;
    },
    set displayedCount(v) {
      displayedCount = v;
    },

    get unsyncedDelta() {
      return unsyncedDelta;
    },
    set unsyncedDelta(v) {
      unsyncedDelta = v;
    },

    get passiveRatePerSec() {
      return passiveRatePerSec;
    },
    set passiveRatePerSec(v) {
      passiveRatePerSec = v;
    },

    get syncPaused() {
      return syncPaused;
    },
    set syncPaused(v) {
      syncPaused = v;
    },
  };

  initShop({
    db,
    uid,
    purchaseItemFn,
    purchaseUpgradeFn,
    updateUserScoreFn,
    deleteUserFn,
    syncGubsFromServer,

    // Shop can pause/resume the background sync if you wire it up later
    pauseSync,
    resumeSync,

    gameState,
    renderCounter,
    queueScoreUpdate,
    abbreviateNumber,
    passiveWorker,
    logError,
    sanitizeUsername,
    playBuySound,
  });

  return function destroy() {
    clearInterval(scoreInterval);
    clearInterval(syncInterval);
    clearTimeout(popTimeout);
    passiveWorker.terminate();
    offlineClose.removeEventListener('click', offlineCloseHandler);
    document.removeEventListener('visibilitychange', visibilityHandler);
    mainGub.removeEventListener('click', mainGubHandler);
    userRef.off('value', userValueListener);
    leaderboardRef.off('value', leaderboardListener);
  };
}
