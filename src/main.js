import { initAudio } from './audio.js';
import { initChat } from './chat.js';
import { initFeedback } from './feedback.js';
import { initGoldenGubs } from './goldenGub.js';
import { logError } from './logger.js';
import { initFirebase } from './firebase.js';
import { initPresenceAndLeaderboard } from './presence.js';
import { initShop } from './shop.js';
import { initUIEffects } from './uiEffects.js';

export function sanitizeUsername(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);
}

window.addEventListener('DOMContentLoaded', () => {
  const CLIENT_VERSION = '0.1.6';
  document.getElementById('versionNumber').textContent = `v${CLIENT_VERSION}`;
  const isMobile = window.innerWidth < 768;
  const NUM_FLOATERS = isMobile ? 5 : 20;

  const audio = initAudio();
  const { playMentionSound } = audio;
  // ─── SPECIAL GUB STYLE ───────────────────────────────────────────────────
  const specialStyle = document.createElement('style');
  specialStyle.textContent = `
  .special-gub {
    position: absolute;
    filter: hue-rotate(30deg) saturate(3) brightness(1.3);
    border: none;
    pointer-events: auto;
    z-index: 10001;
    font-family: sans-serif;
    font-weight: bold;
    color: white;
    text-align: center;
    text-shadow: 0 0 5px black;
    outline: none;
  }
    .special-gub:focus {
    outline: none;        /* ← ensure no outline even when focused */
  }
`;
  document.head.appendChild(specialStyle);
  // Username handling
  let username = sanitizeUsername(localStorage.getItem('gubUser'));

  function showUsernamePrompt() {
    const overlay = document.getElementById('usernameOverlay');
    const input = document.getElementById('usernameInput');
    const submit = document.getElementById('usernameSubmit');
    overlay.style.display = 'flex';
    function accept() {
      const u = sanitizeUsername(input.value);
      if (u.length >= 3) {
        username = u;
        localStorage.setItem('gubUser', username);
        overlay.style.display = 'none';
        initApp();
      }
    }
    submit.addEventListener('click', accept);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') accept();
    });
    input.focus();
  }

  function initApp() {
    const { auth, db, functions } = initFirebase();
    const imageState = { images: [] };

    auth
      .signInAnonymously()
      .then(() => {

        window.addEventListener('error', (e) => {
          logError(db, {
            message: e.message,
            stack: e.error?.stack,
            source: e.filename,
            line: e.lineno,
            col: e.colno,
          });
        });

        window.addEventListener('unhandledrejection', (e) => {
          logError(db, {
            message: e.reason?.message || String(e.reason),
            stack: e.reason?.stack,
            type: 'unhandledrejection',
          });
        });

        const syncGubsFn = functions.httpsCallable('syncGubs');
        const purchaseItemFn = functions.httpsCallable('purchaseItem');
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
          if (scoreDirty) {
            scoreDirty = false;
            syncGubsFromServer();
          }
        }, 1000);

        // Regularly pull server-side gub totals even if no local actions
        setInterval(syncGubsFromServer, 10000);

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
          syncGubsFromServer(true);

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
            syncGubsFromServer(true);
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
        };
        initShop({
          db,
          uid,
          purchaseItemFn,
          syncGubsFromServer,
          gameState,
          renderCounter,
          queueScoreUpdate,
          abbreviateNumber,
          passiveWorker,
          logError,
          sanitizeUsername,
        });

        initFeedback({ db, username });
      })
      .catch((err) => console.error('Auth Error', err));

    initUIEffects({ numFloaters: NUM_FLOATERS, audio, imageState });
  }

  if (username && username.length >= 3) {
    initApp();
  } else {
    showUsernamePrompt();
  }
});
