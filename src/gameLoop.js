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
  CLIENT_VERSION,
  imageState,
}) {
  const syncGubsFn = functions.httpsCallable('syncGubs');
  const purchaseItemFn = functions.httpsCallable('purchaseItem');
  const updateUserScoreFn = functions.httpsCallable('updateUserScore');
  const deleteUserFn = functions.httpsCallable('deleteUser');
  const uid = auth.currentUser.uid;
  const allUsers = new Set([username]);

  const offlineModal = document.getElementById('offlineModal');
  const offlineMessage = document.getElementById('offlineMessage');
  const offlineClose = document.getElementById('offlineClose');
  offlineClose.addEventListener('click', () => {
    offlineModal.style.display = 'none';
  });

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

  let syncingPromise = null;
  async function syncGubsFromServer(requestOffline = false) {
    if (syncingPromise) return syncingPromise;
    // Only sync whole gubs to avoid dropping fractional amounts
    const sendDelta = Math.floor(unsyncedDelta);
    unsyncedDelta -= sendDelta; // keep remainder locally

    syncingPromise = (async () => {
      try {
        const res = await syncGubsFn({
          delta: sendDelta,
          offline: requestOffline,
        });

        if (res.data && typeof res.data.score === 'number') {
          const { score, offlineEarned = 0 } = res.data;
          // Server stores integer scores, so re-add any local remainder
          globalCount = displayedCount = score + unsyncedDelta;
          renderCounter();

          if (requestOffline && !offlineShown && offlineEarned > 0) {
            offlineMessage.textContent = `You earned ${abbreviateNumber(offlineEarned)} gubs while you were away!`;
            offlineModal.style.display = 'block';
            offlineShown = true;
          }
        } else {
          // Revert on failure to ensure no loss
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

  setInterval(() => {
    if (scoreDirty && !syncPaused) {
      scoreDirty = false;
      syncGubsFromServer().catch(() => {});
    }
  }, 1000);

  // Regularly pull server-side gub totals even if no local actions
  setInterval(() => {
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

  // Load or initialize user's score, migrating any legacy username entries
  const userRef = db.ref(`leaderboard_v3/${uid}/score`);
  userRef.once('value').then(async (snap) => {
    if (snap.exists()) {
      globalCount = snap.val() || 0;
    } else {
      // Try to migrate from old username-based key
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
    userRef.on('value', (s) => {
      const v = s.val();
      if (typeof v === 'number') {
        const total = v + unsyncedDelta;
        globalCount = displayedCount = total;
        scoreDirty = unsyncedDelta !== 0;
        renderCounter();
      }
    });

    // Real-time leaderboard updates (top 10 only)
    db.ref('leaderboard_v3')
      .orderByChild('score')
      .limitToLast(10)
      .on('value', (snap) => {
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
      });
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

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      passiveWorker.postMessage({ type: 'reset' });
      syncGubsFromServer(true).catch(() => {});
    }
  });
  // main gub handler
  const mainGub = document.getElementById('main-gub');
  const clickMe = document.getElementById('clickMe');
  if (!sessionStorage.getItem('gubClicked')) {
    clickMe.style.display = 'block';
  }
  let popTimeout;

  mainGub.addEventListener('click', (e) => {
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
    popTimeout = setTimeout(
      () => mainGub.classList.remove('pop-effect'),
      150,
    );
  });
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
    updateUserScoreFn,
    deleteUserFn,
    syncGubsFromServer,
    gameState,
    renderCounter,
    queueScoreUpdate,
    abbreviateNumber,
    passiveWorker,
    logError,
    sanitizeUsername,
  });
}
