import { initAudio } from "./audio.js";
import { initChat } from "./chat.js";

window.addEventListener("DOMContentLoaded", () => {
  const CLIENT_VERSION = "0.1.6";
  document.getElementById("versionNumber").textContent = `v${CLIENT_VERSION}`;
  const isMobile = window.innerWidth < 768;
  const NUM_FLOATERS = isMobile ? 5 : 20;

  const audio = initAudio();
  const { playMentionSound } = audio;
  // ─── SPECIAL GUB STYLE ───────────────────────────────────────────────────
  const specialStyle = document.createElement("style");
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
  // Sanitize usernames (letters, numbers, underscore; max 20 chars)
  function sanitizeUsername(name) {
    return (name || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);
  }

  // Username handling
  let username = sanitizeUsername(localStorage.getItem("gubUser"));

  function showUsernamePrompt() {
    const overlay = document.getElementById("usernameOverlay");
    const input = document.getElementById("usernameInput");
    const submit = document.getElementById("usernameSubmit");
    overlay.style.display = "flex";
    function accept() {
      const u = sanitizeUsername(input.value);
      if (u.length >= 3) {
        username = u;
        localStorage.setItem("gubUser", username);
        overlay.style.display = "none";
        initApp();
      }
    }
    submit.addEventListener("click", accept);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") accept();
    });
    input.focus();
  }

  function initApp() {
  // 2. Initialize Firebase
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

  // 3. Authenticate then setup leaderboard
  firebase
    .auth()
    .signInAnonymously()
    .then(() => {
      const db = firebase.database();
      const functions = firebase.functions();
      const syncGubsFn = functions.httpsCallable("syncGubs");
      const purchaseItemFn = functions.httpsCallable("purchaseItem");
      const uid = firebase.auth().currentUser.uid;
      const allUsers = new Set([username]);
      const SYNC_URL =
        "https://us-central1-gub-leaderboard.cloudfunctions.net/syncGubs";

      const offlineModal = document.getElementById("offlineModal");
      const offlineMessage = document.getElementById("offlineMessage");
      const offlineClose = document.getElementById("offlineClose");
      offlineClose.addEventListener("click", () => {
        offlineModal.style.display = "none";
      });

      const versionRef = db.ref("config/version");
      versionRef.on("value", (snap) => {
        const serverVersion = snap.val();
        // Only force a reload when the server has a version and it differs from the client
        if (serverVersion && serverVersion !== CLIENT_VERSION) {
          const warn = document.createElement("div");
          warn.textContent = "Client outdated – refreshing in 5s...";
          warn.style.cssText =
            "position:fixed;top:0;left:0;width:100%;background:red;color:white;text-align:center;font-size:24px;padding:20px;z-index:100000;";
          document.body.appendChild(warn);
          setTimeout(() => location.reload(), 5000);
        }
      });

      // ─── Presence Setup ───────────────────────────────────────────────
      const presenceRef = db.ref(".info/connected");
      const userOnlineRef = db.ref("presence/" + uid);

      presenceRef.on("value", (snap) => {
        if (snap.val() === true) {
          userOnlineRef.set(username);
          userOnlineRef.onDisconnect().remove();
        }
      });

      const presenceListRef = db.ref("presence");
      const onlineUsersEl = document.getElementById("online-users");
      const onlineUsers = new Map();
      const MAX_DISPLAY = 20;

      function renderOnlineUsers() {
        const arr = Array.from(onlineUsers.values());
        const list = arr.slice(0, MAX_DISPLAY).join(", ");
        const more =
          arr.length > MAX_DISPLAY
            ? ` (+${arr.length - MAX_DISPLAY} more)`
            : "";
        onlineUsersEl.textContent = `Online (${arr.length}): ${list}${more}`;
      }

      presenceListRef.on("child_added", (snap) => {
        const name = sanitizeUsername(snap.val());
        onlineUsers.set(snap.key, name);
        allUsers.add(name);
        renderOnlineUsers();
      });

      presenceListRef.on("child_removed", (snap) => {
        onlineUsers.delete(snap.key);
        renderOnlineUsers();
      });
      db.ref("leaderboard_v3")
        .once("value")
        .then((snap) => {
          snap.forEach((child) => {
            const data = child.val() || {};
            const u = sanitizeUsername(data.username || "");
            if (u) allUsers.add(u);
          });
        });
      // ─────────────────────────────────────────────────────────────────

      let sessionCount = 0,
        globalCount = 0,
        displayedCount = 0,
        unsyncedClicks = 0;
      let offlineShown = false;
      let gubRateMultiplier = 1;
      let feralExpiresAt = 0;
      let scoreDirty = false;
      let hiddenStart = 0;
      let mainGub;

      let syncing = false;
      async function syncGubsFromServer(requestOffline = false) {
        if (syncing) return;
        syncing = true;
        // Only sync whole gubs to avoid dropping fractional amounts
        const sendClicks = Math.floor(unsyncedClicks);
        unsyncedClicks -= sendClicks;
        try {
          const res = await syncGubsFn({
            clicks: sendClicks,
            offline: requestOffline,
          });
          if (res.data && typeof res.data.score === "number") {
            const { score, offlineEarned = 0, goldenReward = 0 } = res.data;
            globalCount = score;
            displayedCount = score + unsyncedClicks;
            if (goldenReward) {
              globalCount += goldenReward;
              displayedCount += goldenReward;
            }
            renderCounter();

            if (requestOffline && !offlineShown && offlineEarned > 0) {

              offlineMessage.textContent =
                `You earned ${abbreviateNumber(offlineEarned)} gubs while you were away!`;
              offlineModal.style.display = "block";
              offlineShown = true;
            }
          } else {
            // Revert on failure to ensure no loss
            unsyncedClicks += sendClicks;
          }
        } catch (err) {
          unsyncedClicks += sendClicks;
          console.error("syncGubs failed", err);
        } finally {
          syncing = false;
        }
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
          "",
          "k",
          "m",
          "b",
          "t",
          "quad",
          "quin",
          "sext",
          "sept",
          "octi",
          "noni",
          "deci",
        ];
        let idx = Math.floor(Math.log10(num) / 3);
        if (idx >= units.length) idx = units.length - 1;
        const scaled = num / Math.pow(1000, idx);
        return scaled.toFixed(2) + units[idx];
      }

      // Load or initialize user's score, migrating any legacy username entries
      const userRef = db.ref(`leaderboard_v3/${uid}/score`);
      userRef.once("value").then(async (snap) => {
        if (snap.exists()) {
          globalCount = snap.val() || 0;
        } else {
          // Try to migrate from old username-based key
          const legacyRef = db.ref(`leaderboard_v3/${username}/score`);
          const legacySnap = await legacyRef.once("value");
          globalCount = legacySnap.val() || 0;
          if (legacySnap.exists()) {
            await legacyRef.parent.remove();
          }
        }
        displayedCount = globalCount;
        renderCounter();
        syncGubsFromServer(true);

        // Keep local score in sync with external/manual updates
        userRef.on("value", (s) => {
          const v = s.val();
          if (typeof v === "number") {
            const total = v + unsyncedClicks;
            globalCount = displayedCount = total;
            scoreDirty = unsyncedClicks !== 0;
            renderCounter();
          }
        });

        // Real-time leaderboard updates (top 10 only)
        db.ref("leaderboard_v3")
          .orderByChild("score")
          .limitToLast(10)
          .on("value", (snap) => {
            const list = [];
            snap.forEach((child) => {
              const data = child.val() || {};
              const user = sanitizeUsername(data.username || "");
              list.push({ user, score: data.score || 0 });
              allUsers.add(user);
            });
            list.sort((a, b) => b.score - a.score);
            const lbEl = document.getElementById("leaderboard");
            lbEl.innerHTML = "";
            const title = document.createElement("strong");
            title.textContent = "Leaderboard (Top 10)";
            lbEl.appendChild(title);
            lbEl.appendChild(document.createElement("br"));
            list.forEach((e, i) => {
              const line = document.createElement("div");
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
        playMentionSound
      });

      // Start spawning golden gubs
      scheduleNextGolden();

      function getGoldenGubReward() {
        return Math.max(10, Math.floor(globalCount * 0.03));
      }

      // Spawn golden gub and handle clicks
      function spawnGolden() {
        const el = document.createElement("img");
        el.src = images[Math.floor(Math.random() * images.length)];
        el.className = "floater";
        const size = 80 + Math.random() * 320;
        el.style.width = el.style.height = size + "px";
        el.style.left = `${Math.random() * (window.innerWidth - size)}px`;
        el.style.top = `${Math.random() * (window.innerHeight - size)}px`;
        el.style.zIndex = 10000;
        el.style.filter =
          "sepia(1) hue-rotate(20deg) saturate(5) brightness(1.2)";
        el.style.border = "2px solid white";
        el.style.pointerEvents = "auto";
        el.style.opacity = 0;
        el.style.transition = "opacity 3s";
        document.body.appendChild(el);
        requestAnimationFrame(() => {
          el.style.opacity = 1;
        });
        const timeout = setTimeout(() => {
          el.style.pointerEvents = "none";
          el.style.opacity = 0;
          setTimeout(() => {
            el.remove();
            scheduleNextGolden();
          }, 3000);
        }, 60000);
        el.addEventListener("click", (e) => {
          clearTimeout(timeout);
          const reward = getGoldenGubReward();
          const actualReward = reward * gubRateMultiplier;
          sessionCount += actualReward;
          gainGubs(reward);

          const plusOne = document.createElement("div");
          plusOne.textContent = "+" + abbreviateNumber(actualReward);
          plusOne.className = "plus-one";
          plusOne.style.left = `${e.clientX}px`;
          plusOne.style.top = `${e.clientY}px`;
          document.body.appendChild(plusOne);
          setTimeout(() => plusOne.remove(), 1000);

          el.remove();
          scheduleNextGolden();
        });
      }
      // ─── SPECIAL GUB SPAWNER ───────────────────────────────────────────────
      function activateFeralGubMode() {
        const duration = 30000 + Math.random() * 90000;
        gubRateMultiplier = 10;
        feralExpiresAt = Date.now() + duration;
        renderCounter();
        if (mainGub) mainGub.classList.add("feral-glow");
      }

      function spawnSpecialGub() {
        // 1. pick the exact same random image
        const imgSrc = images[Math.floor(Math.random() * images.length)];

        // 2. container for image + label
        const container = document.createElement("div");
        container.className = "floater special-gub";
        const size = 80 + Math.random() * 320;
        container.style.width = size + "px";
        container.style.height = size + "px";
        container.style.left = `${Math.random() * (window.innerWidth - size)}px`;
        container.style.top = `${Math.random() * (window.innerHeight - size)}px`;

        // 3. the image element itself
        const img = document.createElement("img");
        img.src = imgSrc;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        // orange-ify it
        img.style.filter =
          "hue-rotate(30deg) saturate(3) brightness(1.3)";
        container.appendChild(img);

        // 4. overlay the label
        const label = document.createElement("div");
        label.textContent = "SPESHAL GUB";
        Object.assign(label.style, {
          position: "absolute",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          fontWeight: "bold",
          color: "white",
          textShadow: "0 0 5px black",
          pointerEvents: "none",
        });
        container.appendChild(label);

        container.style.opacity = 0;
        container.style.transition = "opacity 3s";
        document.body.appendChild(container);
        requestAnimationFrame(() => {
          container.style.opacity = 1;
        });
        const timeout = setTimeout(() => {
          container.style.pointerEvents = "none";
          container.style.opacity = 0;
          setTimeout(() => {
            container.remove();
            scheduleNextGolden();
          }, 3000);
        }, 60000);

        // 5. click handler triggers feral mode
        container.addEventListener("click", (e) => {
          clearTimeout(timeout);
          activateFeralGubMode();

          const plusOne = document.createElement("div");
          plusOne.textContent = "FERAL GUB MODE!";
          plusOne.className = "plus-one";
          plusOne.style.animationDuration = "2s";
          plusOne.style.left = `${e.clientX}px`;
          plusOne.style.top = `${e.clientY}px`;
          document.body.appendChild(plusOne);
          setTimeout(() => plusOne.remove(), 2000);

          container.remove();
          scheduleNextGolden();
        });
      }

      // ─── UPDATED SCHEDULER ──────────────────
      function scheduleNextGolden() {
        const min = 300000; // 5 minutes
        const max = 1500000; // 25 minutes
        setTimeout(
          () => {
            if (Math.random() < 0.05) spawnSpecialGub();
            else spawnGolden();
          },
          min + Math.random() * (max - min),
        );
      }
      // Elements for displaying totals and rate
      const gubTotalEl = document.getElementById("gubTotal");
      let passiveRatePerSec = 0;

      const passiveWorker = new Worker(
        new URL("./passiveWorker.js", import.meta.url),
        { type: "module" },
      );
      passiveWorker.onmessage = (e) => {
        checkFeralExpiry();
        const { earned = 0 } = e.data || {};
        if (earned > 0) {
          gainGubs(earned);
        }
      };
      passiveWorker.postMessage({ type: "rate", value: passiveRatePerSec });

      function renderCounter() {
        const rate = abbreviateNumber(
          passiveRatePerSec * gubRateMultiplier,
        );
        gubTotalEl.textContent =
          "Gubs: " +
          abbreviateNumber(Math.floor(displayedCount)) +
          " (" +
          rate +
          " gub/s)";
      }

      function gainGubs(amount) {
        amount *= gubRateMultiplier;
        globalCount += amount;
        displayedCount += amount;
        renderCounter();
        queueScoreUpdate();
      }

      function spendGubs(amount) {
        globalCount -= amount;
        displayedCount -= amount;
        renderCounter();
        queueScoreUpdate();
      }

      function registerClick() {
        sessionCount += gubRateMultiplier;
        gainGubs(1);
        unsyncedClicks += 1;
      }

      function checkFeralExpiry() {
        if (feralExpiresAt && Date.now() >= feralExpiresAt) {
          gubRateMultiplier = 1;
          feralExpiresAt = 0;
          if (mainGub) mainGub.classList.remove("feral-glow");
          renderCounter();
        }
      }

      function reconcileHiddenTime() {
        if (hiddenStart) {
          const elapsedSec = (Date.now() - hiddenStart) / 1000;
          gainGubs(passiveRatePerSec * elapsedSec);
          hiddenStart = 0;
        }
      }

      function flushUnsynced() {
        const sendClicks = Math.floor(unsyncedClicks);
        const blob = new Blob(
          [JSON.stringify({ data: { clicks: sendClicks } })],
          { type: "application/json" },
        );
        navigator.sendBeacon(SYNC_URL, blob);
        unsyncedClicks -= sendClicks;
      }

      document.addEventListener("visibilitychange", () => {
        checkFeralExpiry();
        if (document.hidden) {
          hiddenStart = Date.now();
        } else {
          passiveWorker.postMessage({ type: "reset" });
          reconcileHiddenTime();
          syncGubsFromServer();
        }
      });

      document.addEventListener("freeze", () => {
        reconcileHiddenTime();
        flushUnsynced();
      });

      document.addEventListener("resume", () => {
        checkFeralExpiry();
        reconcileHiddenTime();
        passiveWorker.postMessage({ type: "reset" });
        if (document.hidden) {
          hiddenStart = Date.now();
        } else {
          syncGubsFromServer();
        }
      });

      function handleUnload() {
        reconcileHiddenTime();
        flushUnsynced();
      }
      window.addEventListener("pagehide", handleUnload);
      window.addEventListener("beforeunload", handleUnload);
      // main gub handler
      mainGub = document.getElementById("main-gub");
      const clickMe = document.getElementById("clickMe");
      if (!sessionStorage.getItem("gubClicked")) {
        clickMe.style.display = "block";
      }
      let popTimeout;

      mainGub.addEventListener("click", (e) => {
        clickMe.style.display = "none";
        sessionStorage.setItem("gubClicked", "true");
        const gain = gubRateMultiplier;
        registerClick();

        const plusOne = document.createElement("div");
        plusOne.textContent = "+" + abbreviateNumber(gain);
        plusOne.className = "plus-one";
        plusOne.style.left = `${e.clientX}px`;
        plusOne.style.top = `${e.clientY}px`;
        document.body.appendChild(plusOne);
        setTimeout(() => plusOne.remove(), 1000);

        mainGub.classList.remove("pop-effect");
        void mainGub.offsetWidth;
        mainGub.classList.add("pop-effect");

        clearTimeout(popTimeout);
        popTimeout = setTimeout(
          () => mainGub.classList.remove("pop-effect"),
          150,
        );
      });
      // ─── SHOP CODE (moved here!) ─────────────────────────────────────────
      const COST_MULTIPLIER = 1.15; // smoother exponential cost scaling factor
      const shopItems = [
        { id: "passiveMaker", name: "The Gub", baseCost: 100, rate: 1 },
        { id: "guberator", name: "Guberator", baseCost: 500, rate: 5 },
        { id: "gubmill", name: "Gubmill", baseCost: 2000, rate: 20 },
        {
          id: "gubsolar",
          name: "Solar Gub Panels",
          baseCost: 10000,
          rate: 100,
        },
        {
          id: "gubfactory",
          name: "Gubactory",
          baseCost: 50000,
          rate: 500,
        },
        {
          id: "gubhydro",
          name: "Hydro Gub Plant",
          baseCost: 250000,
          rate: 2500,
        },
        {
          id: "gubnuclear",
          name: "Nuclear Gub Plant",
          baseCost: 1000000,
          rate: 10000,
        },
        {
          id: "gubquantum",
          name: "Quantum Gub Computer",
          baseCost: 5000000,
          rate: 50000,
        },
        {
          id: "gubai",
          name: "GUB AI",
          caption: "(be careful of gubnet...)",
          baseCost: 25000000,
          rate: 250000,
        },
        {
          id: "gubclone",
          name: "Gub Cloning Facility",
          baseCost: 125000000,
          rate: 1250000,
        },
        {
          id: "gubspace",
          name: "Gub Space Program",
          baseCost: 625000000,
          rate: 6250000,
        },
        {
          id: "intergalactic",
          name: "Intergalactic Gub",
          baseCost: 3125000000,
          rate: 31250000,
        },
      ];
      const shopRef = db.ref(`shop_v2/${uid}`);
      const owned = {
        passiveMaker: 0,
        guberator: 0,
        gubmill: 0,
        gubsolar: 0,
        gubfactory: 0,
        gubhydro: 0,
        gubnuclear: 0,
        gubquantum: 0,
        gubai: 0,
        gubclone: 0,
        gubspace: 0,
        intergalactic: 0,
      };

      // Recompute passive gub rate and sync to server
      function updatePassiveIncome() {
        const perSecondTotal = shopItems.reduce(
          (sum, item) => sum + owned[item.id] * item.rate,
          0,
        );
        passiveRatePerSec = perSecondTotal;
        passiveWorker.postMessage({ type: "rate", value: passiveRatePerSec });
        renderCounter();
        queueScoreUpdate();
      }

      const shopBtn = document.getElementById("shopBtn");
      const shopPanel = document.getElementById("shopPanel");
      const shopContainer = document.getElementById("shopItemsContainer");
      const adminBtn = document.getElementById("adminBtn");
      const adminPanel = document.getElementById("adminPanel");
      const adminUser = document.getElementById("adminUsername");
      const adminScore = document.getElementById("adminScore");
      const adminUpdate = document.getElementById("adminUpdate");
      const adminDelete = document.getElementById("adminDelete");

      const ADMIN_UIDS = [
        "sGd1ZHR1nvMKKCw9A1O5bwtbFD23",
        "YHtvs4JyAtS3SUtNAUJuPMm3ac22",
      ];
      db.ref("admins/" + uid)
        .once("value")
        .then((snap) => {
          if (!snap.exists() && ADMIN_UIDS.includes(uid)) {
            db.ref("admins/" + uid).set(true);
            adminBtn.style.display = "block";
          } else if (snap.val()) {
            adminBtn.style.display = "block";
          }
        });

      adminBtn.addEventListener("click", () => {
        adminPanel.style.display =
          adminPanel.style.display === "block" ? "none" : "block";
      });

      adminUpdate.addEventListener("click", () => {
        const target = sanitizeUsername(adminUser.value);
        const score = parseInt(adminScore.value, 10);
        if (!target || isNaN(score)) return;
        db.ref("leaderboard_v3")
          .orderByChild("username")
          .equalTo(target)
          .once("value")
          .then((snap) => {
            snap.forEach((child) => {
              child.ref.update({ score });
            });
          });
      });

      adminDelete.addEventListener("click", () => {
        const target = sanitizeUsername(adminUser.value);
        if (!target) return;
        db.ref("leaderboard_v3")
          .orderByChild("username")
          .equalTo(target)
          .once("value")
          .then((snap) => {
            snap.forEach((child) => child.ref.remove());
          });
      });

      shopBtn.addEventListener("click", () => {
        shopPanel.style.display =
          shopPanel.style.display === "block" ? "none" : "block";
      });

      shopItems.forEach((item) => {
        const div = document.createElement("div");
        div.innerHTML = `
    <strong>${item.name}</strong>${item.caption ? ` <span style="color:red;font-size:0.8em;">${item.caption}</span>` : ""}<br>
    Cost: <span id="cost-${item.id}"></span> Gubs<br>
    Rate: ${abbreviateNumber(item.rate)} Gub/s<br>
    Owned: <span id="owned-${item.id}">0</span><br>
    <button id="buy-${item.id}">Buy</button>
    <button id="buy-${item.id}-x10">x10</button>
    <button id="buy-${item.id}-x100">x100</button>
    <button id="buy-${item.id}-all">All</button>
    <hr style="border-color:#444">
  `;
        shopContainer.appendChild(div);

        const buy1 = div.querySelector(`#buy-${item.id}`);
        const buy10 = div.querySelector(`#buy-${item.id}-x10`);
        const buy100 = div.querySelector(`#buy-${item.id}-x100`);
        const buyAll = div.querySelector(`#buy-${item.id}-all`);
        const costSpan = div.querySelector(`#cost-${item.id}`);

        function currentCost() {
          return Math.floor(
            item.baseCost * Math.pow(COST_MULTIPLIER, owned[item.id]),
          );
        }

        function updateCostDisplay() {
          costSpan.textContent = abbreviateNumber(currentCost());
        }

        async function attemptPurchase(quantity) {
          await syncGubsFromServer();
          try {
            const res = await purchaseItemFn({
              itemId: item.id,
              quantity,
            });
            if (res.data) {
              const { score, newCount } = res.data;
              owned[item.id] = newCount;
              document.getElementById(`owned-${item.id}`).textContent = newCount;
              globalCount = displayedCount = score;
              unsyncedClicks = 0;
              updatePassiveIncome();
              updateCostDisplay();
              renderCounter();
            }
          } catch (err) {
            console.error("purchase failed", err);
          }
        }

        function maxAffordable() {
          let qty = 0;
          let accumulated = 0;
          while (true) {
            const next = Math.floor(
              item.baseCost *
                Math.pow(COST_MULTIPLIER, owned[item.id] + qty),
            );
            if (accumulated + next > globalCount) break;
            accumulated += next;
            qty++;
          }
          return qty;
        }

        buy1.addEventListener("click", () => attemptPurchase(1));
        buy10.addEventListener("click", () => attemptPurchase(10));
        buy100.addEventListener("click", () => attemptPurchase(100));
        buyAll.addEventListener("click", () => {
          const qty = maxAffordable();
          if (qty > 0) attemptPurchase(qty);
        });
        updateCostDisplay();
      });

      shopRef.once("value").then((snapshot) => {
        const stored = snapshot.val() || {};
        shopItems.forEach((item) => {
          owned[item.id] = stored[item.id] || 0;
          document.getElementById(`owned-${item.id}`).textContent =
            owned[item.id];
          const costSpan = document.getElementById(`cost-${item.id}`);
          if (costSpan) {
            costSpan.textContent = abbreviateNumber(
              Math.floor(
                item.baseCost * Math.pow(COST_MULTIPLIER, owned[item.id]),
              ),
            );
          }
        });
        updatePassiveIncome();
      });
      // passive income handled by the Web Worker
      // ──────────────────────────────────────────────────────────────────────

      // Feedback submission
      const feedbackBtn = document.getElementById("feedbackBtn");
      const feedbackModal = document.getElementById("feedbackModal");
      const feedbackInput = document.getElementById("feedbackInput");
      const feedbackSubmit = document.getElementById("feedbackSubmit");
      const feedbackSee = document.getElementById("feedbackSee");
      const feedbackAnon = document.getElementById("feedbackAnon");
      const feedbackCounter = document.getElementById("feedbackCounter");

      feedbackInput.addEventListener("input", () => {
        const remaining = 200 - feedbackInput.value.length;
        feedbackCounter.textContent = `${remaining} characters remaining`;
      });

      feedbackBtn.addEventListener("click", () => {
        feedbackModal.style.display =
          feedbackModal.style.display === "block" ? "none" : "block";
      });

      feedbackSee.addEventListener("click", () => {
        window.open("feedback-list/", "_blank");
        feedbackModal.style.display = "none";
      });

      feedbackSubmit.addEventListener("click", () => {
        const text = feedbackInput.value.trim();
        if (!text) return;
        const who = feedbackAnon.checked ? "Anon" : username;
        db.ref("feedback").push({
          user: who,
          text,
          ts: Date.now(),
        });
        feedbackInput.value = "";
        feedbackAnon.checked = false;
        feedbackCounter.textContent = "200 characters remaining";
        feedbackModal.style.display = "none";
      });
    })
    .catch((err) => console.error("Auth Error", err));

  // --- Game Logic & Controls (unchanged) ---
  const highImages = [
    "floater1.jpg",
    "floater2.jpg",
    "floater3.jpg",
    "floater4.png",
    "floater5.jpg",
    "floater6.jpg",
    "floater7.jpg",
    "floater8.jpg",
    "floater9.jpg",
    "floater10.jpg",
    "floater11.jpg",
    "floater12.jpg",
    "floater13.jpg",
    "floater14.jpg",
    "floater15.jpg",
    "floater16.jpg",
    "floater17.png",
    "floater18.jpg",
  ];
  const lowImages = [
    "low_floater1.jpg",
    "low_floater2.jpg",
    "low_floater3.jpg",
    "floater4.png",
    "low_floater5.jpg",
    "low_floater6.jpg",
    "low_floater7.jpg",
    "low_floater8.jpg",
    "low_floater9.jpg",
    "low_floater10.jpg",
    "low_floater11.jpg",
    "low_floater12.jpg",
    "low_floater13.jpg",
    "low_floater14.jpg",
    "low_floater15.jpg",
    "low_floater16.jpg",
    "low_floater17.jpg",
    "low_floater18.jpg",
  ];
  let useHighQuality = localStorage.getItem("gubHighQuality") === "true";
  let useComicSans = localStorage.getItem("gubComicSans") === "true";
  if (useComicSans) {
    document.body.classList.add("comic-sans");
  }
  let images = useHighQuality ? highImages : lowImages;
  const texts = [
    "bark",
    "barke",
    "gubbling",
    "good boye",
    "sniffa",
    "shidded",
    "gubb",
    "gubbing",
    "i'm gonna gub",
    "he do be gubbin",
    "were my salami go",
    "Gub Gubtaro Pissboy420 Bong or Die",
    "bork",
    "aaaAAa",
    "im gubbing it im gubbing it",
    "bug",
    "lil gublets",
    "FUCKYOU BAILEY",
    "ish true ish true",
    "gub needs the funny 3 numbers on the back of ur credit card",
  ];
  let speedMultiplier = 2,
    numFloaters = NUM_FLOATERS;
  let movementPaused = false;
  const floaters = [];

  const savedSpeedStr = localStorage.getItem("gubSpeed");
  const savedImagesStr = localStorage.getItem("gubImages");

  if (savedSpeedStr !== null) {
    const parsedSpeed = parseInt(savedSpeedStr, 10);
    if (!Number.isNaN(parsedSpeed)) {
      speedMultiplier = parsedSpeed;
    }
  }

  if (savedImagesStr !== null) {
    const parsedImages = parseInt(savedImagesStr, 10);
    if (!Number.isNaN(parsedImages)) {
      numFloaters = parsedImages;
    }
  }

  movementPaused = localStorage.getItem("gubPaused") === "true";
  let storedSpeed = speedMultiplier;
  if (movementPaused) {
    speedMultiplier = 0;
  }
  function createEntity(isText = false) {
    const elem = document.createElement("div");
    const size = 80 + Math.random() * 320;
    elem.style.width = elem.style.height = size + "px";
    elem.style.left = Math.random() * (window.innerWidth - size) + "px";
    elem.style.top = Math.random() * (window.innerHeight - size) + "px";
    let imgIdx = null;
    if (isText) {
      elem.className = "rainbow-text";
      elem.textContent = texts[Math.floor(Math.random() * texts.length)];
    } else {
      elem.className = "floater";
      const img = document.createElement("img");
      imgIdx = Math.floor(Math.random() * images.length);
      img.src = images[imgIdx];
      elem.appendChild(img);
    }
    document.body.appendChild(elem);
    floaters.push({
      elem,
      x: parseFloat(elem.style.left),
      y: parseFloat(elem.style.top),
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      width: size,
      height: size,
      isText,
      imgIdx,
    });
  }
  function removeEntity() {
    const f = floaters.pop();
    if (f) f.elem.remove();
  }
  function animate() {
    floaters.forEach((f) => {
      f.x += f.vx * speedMultiplier;
      f.y += f.vy * speedMultiplier;
      if (f.x <= 0 || f.x + f.width >= window.innerWidth) f.vx *= -1;
      if (f.y <= 0 || f.y + f.height >= window.innerHeight) f.vy *= -1;
      f.elem.style.left = f.x + "px";
      f.elem.style.top = f.y + "px";
    });
    requestAnimationFrame(animate);
  }
  for (let i = 0; i < numFloaters; i++) {
    createEntity(false);
    createEntity(true);
  }
  animate();
  // Controls
  const settingsBtn = document.getElementById("lowPerfBtn");
  const perfMenu = document.getElementById("perfMenu");
  const spdDec = document.getElementById("spdDec");
  const spdInc = document.getElementById("spdInc");
  const imgDec = document.getElementById("imgDec");
  const imgInc = document.getElementById("imgInc");
  const spdVal = document.getElementById("spdVal");
  const imgVal = document.getElementById("imgVal");
  const moveToggle = document.getElementById("moveToggle");
  const qualityBtn = document.getElementById("qualityBtn");
  const comicBtn = document.getElementById("comicBtn");
  qualityBtn.textContent = useHighQuality
    ? "High Quality: On"
    : "High Quality: Off";
  comicBtn.textContent = useComicSans ? "Comic Sans: On" : "Comic Sans: Off";
  qualityBtn.onclick = () => {
    useHighQuality = !useHighQuality;
    localStorage.setItem("gubHighQuality", useHighQuality);
    images = useHighQuality ? highImages : lowImages;
    qualityBtn.textContent = useHighQuality
      ? "High Quality: On"
      : "High Quality: Off";
    floaters.forEach((f) => {
      if (!f.isText && f.imgIdx !== null) {
        const img = f.elem.querySelector("img");
        img.src = images[f.imgIdx];
      }
    });
  };
  comicBtn.onclick = () => {
    useComicSans = !useComicSans;
    document.body.classList.toggle("comic-sans", useComicSans);
    comicBtn.textContent = useComicSans
      ? "Comic Sans: On"
      : "Comic Sans: Off";
    localStorage.setItem("gubComicSans", useComicSans);
  };

  settingsBtn.onclick = () => {
    perfMenu.style.display =
      perfMenu.style.display === "block" ? "none" : "block";
  };
  function updateLabels() {
    spdVal.textContent = speedMultiplier;
    imgVal.textContent = numFloaters;
  }
  function adjustSpeed(d) {
    if (movementPaused) {
      storedSpeed = Math.max(1, storedSpeed + d);
      localStorage.setItem("gubSpeed", storedSpeed);
    } else {
      speedMultiplier = Math.max(1, speedMultiplier + d);
      localStorage.setItem("gubSpeed", speedMultiplier);
    }
    updateLabels();
  }
  function adjustImages(d) {
    const newVal = Math.max(0, numFloaters + d);
    if (newVal !== numFloaters) {
      if (d > 0)
        for (let i = 0; i < d; i++) {
          createEntity(false);
          createEntity(true);
        }
      else
        for (let i = 0; i < -d; i++) {
          removeEntity();
          removeEntity();
        }
      numFloaters = newVal;
      localStorage.setItem("gubImages", numFloaters);
      updateLabels();
    }
  }
  spdDec.onclick = () => adjustSpeed(-1);
  spdInc.onclick = () => adjustSpeed(1);
  imgDec.onclick = () => adjustImages(-2);
  imgInc.onclick = () => adjustImages(2);
  moveToggle.onclick = () => {
    if (!movementPaused) {
      storedSpeed = speedMultiplier;
      speedMultiplier = 0;
      moveToggle.textContent = "Resume Movement";
    } else {
      speedMultiplier = storedSpeed;
      moveToggle.textContent = "Pause Movement";
    }
    movementPaused = !movementPaused;
    localStorage.setItem("gubPaused", movementPaused);
    localStorage.setItem("gubSpeed", storedSpeed);
    updateLabels();
  };

  if (movementPaused) {
    moveToggle.textContent = "Resume Movement";
  }
  updateLabels();

  // Twitch & Chaos Mode
  const chaosBtn = document.getElementById("chaosBtn");
  const twitchBtn = document.getElementById("twitchBtn");
  const twitchBox = document.getElementById("twitchPlayer");
  twitchBox.style.display = "block";
  twitchBox.style.visibility = "hidden";
  const twitchEmbed = new Twitch.Embed("twitchPlayer", {
    width: "100%",
    height: "100%",
    channel: "harupi",
    layout: "video",
    parent: [location.hostname],
    autoplay: false,
    muted: true,
  });
  let twitchPlayer;
  twitchEmbed.addEventListener(Twitch.Embed.VIDEO_READY, () => {
    twitchPlayer = twitchEmbed.getPlayer();
    twitchPlayer.setMuted(true);
  });
  let twitchShown = false;

  twitchBtn.onclick = () => {
    if (!twitchShown) {
      twitchBox.style.visibility = "visible";
      twitchPlayer && twitchPlayer.play();
      twitchBtn.textContent = "Hide Stream";
    } else {
      twitchPlayer && twitchPlayer.pause();
      twitchBox.style.visibility = "hidden";
      twitchBtn.textContent = "Show Stream";
    }
    twitchShown = !twitchShown;
  };

  chaosBtn.addEventListener("click", () => {
    audio.state.flashing = !audio.state.flashing;

    floaters.forEach((f) => {
      const dur = (0.3 + Math.random() * 0.7).toFixed(2);
      const dir = Math.random() > 0.5 ? "alternate" : "alternate-reverse";
      const ease = Math.random() > 0.5 ? "ease-in" : "ease-out";
      if (audio.state.flashing) {
        // turn ON chaos: add animations
        if (f.elem.classList.contains("rainbow-text")) {
          f.elem.style.animation = `rainbow 5s linear infinite, spinmove ${dur}s infinite ${dir} ${ease}`;
        } else {
          f.elem.style.animation = `spinmove ${dur}s infinite ${dir} ${ease}`;
        }
      } else {
        // turn OFF chaos: remove any animation
        f.elem.style.animation = "";
      }
    });

    if (audio.state.flashing) {
      document.body.style.animation = "flash 0.1s infinite alternate";
      if (audio.audioCtx.state === "suspended") audio.audioCtx.resume();
      if (!audio.state.musicPlaying) {
        audio.chaosAudio.play().catch(() => {});
        audio.state.musicPlaying = true;
      }
    } else {
      document.body.style.animation = "none";
      audio.chaosAudio.pause();
      audio.state.musicPlaying = false;
    }
    updateLabels();
  });

  const styleEl = document.createElement("style");
  styleEl.textContent = `@keyframes flash{0%{background:#111}25%{background:#ff0}50%{background:#0ff}75%{background:#f0f}100%{background:#111}}@keyframes spinmove{0%{transform:scale(1) rotate(0deg)}50%{transform:scale(1.2) rotate(180deg)}100%{transform:scale(1) rotate(360deg)}}`;
  document.head.appendChild(styleEl);
  }

  if (username && username.length >= 3) {
    initApp();
  } else {
    showUsernamePrompt();
  }
});
