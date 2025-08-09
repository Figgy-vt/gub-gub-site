import { initAudio } from "./audio.js";
import { initChat } from "./chat.js";

window.addEventListener("DOMContentLoaded", () => {
  const CLIENT_VERSION = "0.1.6";
  const versionEl = document.getElementById("versionNumber");
  if (versionEl) versionEl.textContent = `v${CLIENT_VERSION}`;

  initAudio();
  initChat();

  const firebaseConfig = {
    apiKey: "AIzaSyBc2cDT3md2pk28dFMDoCeCgw37tpGBEjM",
    authDomain: "gub-leaderboard.firebaseapp.com",
    databaseURL: "https://gub-leaderboard-default-rtdb.firebaseio.com",
    projectId: "gub-leaderboard",
    storageBucket: "gub-leaderboard.firebasestorage.app",
    messagingSenderId: "851465760203",
    appId: "1:851465760203:web:1fc30c730a93c0fab25a4e",
    measurementId: "G-95SE4H7EEW",
  };
  firebase.initializeApp(firebaseConfig);

  firebase
    .auth()
    .signInAnonymously()
    .then(async () => {
      const functions = firebase.functions();
      const getStateFn = functions.httpsCallable("getState");
      const clickGubFn = functions.httpsCallable("clickGub");
      const purchaseItemFn = functions.httpsCallable("purchaseItem");
      const COST_MULTIPLIER = 1.15;
      const SHOP_COSTS = {
        passiveMaker: 100,
        guberator: 500,
        gubmill: 2000,
        gubsolar: 10000,
        gubfactory: 50000,
        gubhydro: 250000,
        gubnuclear: 1000000,
        gubquantum: 5000000,
        gubai: 25000000,
        gubclone: 125000000,
        gubspace: 625000000,
        intergalactic: 3125000000,
      };
      const SHOP_NAMES = {
        passiveMaker: "Passive Maker",
        guberator: "Guberator",
        gubmill: "Gubmill",
        gubsolar: "Gubsolar",
        gubfactory: "Gubfactory",
        gubhydro: "Gubhydro",
        gubnuclear: "Gubnuclear",
        gubquantum: "Gubquantum",
        gubai: "Gub AI",
        gubclone: "Gub Clone",
        gubspace: "Gub Space",
        intergalactic: "Intergalactic",
      };

      let score = 0;
      let passiveRate = 0;
      let shop = {};

      const gubTotalEl = document.getElementById("gubTotal");
      const mainGub = document.getElementById("main-gub");
      const shopContainer = document.getElementById("shopItemsContainer");

      function nextCost(itemId) {
        const base = SHOP_COSTS[itemId] || 0;
        const owned = shop[itemId] || 0;
        return Math.floor(base * Math.pow(COST_MULTIPLIER, owned));
      }

      function updateShopDisplay() {
        if (!shopContainer) return;
        document.querySelectorAll("[data-item]").forEach((el) => {
          const itemId = el.getAttribute("data-item");
          const name = SHOP_NAMES[itemId] || itemId;
          const owned = shop[itemId] || 0;
          const cost = nextCost(itemId);
          el.textContent = `${name} (${owned}) - ${cost} gubs`;
        });
      }

      function render() {
        if (gubTotalEl)
          gubTotalEl.textContent = `Gubs: ${Math.floor(score)} (${passiveRate} gub/s)`;
      }

      async function refreshState() {
        try {
          const res = await getStateFn();
          if (res.data) {
            score = res.data.score || 0;
            passiveRate = res.data.rate || 0;
            shop = res.data.shop || {};
            render();
            updateShopDisplay();
          }
        } catch (err) {
          console.error("getState failed", err);
        }
      }

      if (mainGub) {
        mainGub.addEventListener("click", async () => {
          try {
            const res = await clickGubFn();
            if (res.data) {
              score = res.data.score || score + 1;
              render();
            }
          } catch (err) {
            console.error("clickGub failed", err);
          }
        });
      }

      // Example purchase handler: elements with data-item attribute
      document.querySelectorAll("[data-item]").forEach((el) => {
        el.addEventListener("click", async () => {
          const itemId = el.getAttribute("data-item");
          try {
            const res = await purchaseItemFn({ itemId });
            if (res.data && typeof res.data.score === "number") {
              score = res.data.score;
              shop[itemId] = res.data.newCount;
              render();
              updateShopDisplay();
            }
          } catch (err) {
            console.error("purchase failed", err);
          }
        });
      });

      updateShopDisplay();
      await refreshState();
      setInterval(refreshState, 10000);
    });
});
