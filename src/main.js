import { initAudio } from './audio.js';
import { initFeedback } from './feedback.js';
import { initFirebase } from './firebase.js';
import { initUIEffects } from './uiEffects.js';
import { initUsername, sanitizeUsername } from './username.js';
import { initErrorLogging } from './errorHandling.js';
import { initGameLoop } from './gameLoop.js';

window.addEventListener('DOMContentLoaded', () => {
  const CLIENT_VERSION = '0.1.9';
  document.getElementById('versionNumber').textContent = `v${CLIENT_VERSION}`;
  const isMobile = window.innerWidth < 768;
  const NUM_FLOATERS = isMobile ? 5 : 20;

  const audio = initAudio();
  const { playMentionSound, playBuySound } = audio;
  // ─── SPECIAL GUB STYLE ───
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

  const { auth, db, functions } = initFirebase();

  initUsername(db, (username) => {
    const imageState = { images: [] };

    auth
      .signInAnonymously()
      .then(() => {
        initErrorLogging(db);
        const destroyGameLoop = initGameLoop({
          db,
          functions,
          auth,
          username,
          sanitizeUsername,
          playMentionSound,
          playBuySound,
          CLIENT_VERSION,
          imageState,
        });
        initFeedback({ db, username });

        window.addEventListener('beforeunload', destroyGameLoop);
        if (import.meta.hot) {
          import.meta.hot.dispose(() => {
            window.removeEventListener('beforeunload', destroyGameLoop);
            destroyGameLoop();
          });
        }
      })
      .catch((err) => console.error('Auth Error', err));

    initUIEffects({ numFloaters: NUM_FLOATERS, audio, imageState });
  });
});
