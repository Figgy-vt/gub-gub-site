import { initAudio } from "./audio.js";
import { initChat } from "./chat.js";

window.addEventListener("DOMContentLoaded", () => {
  const CLIENT_VERSION = "0.1.6";
  const versionEl = document.getElementById("versionNumber");
  if (versionEl) versionEl.textContent = `v${CLIENT_VERSION}`;

  const { playMentionSound } = initAudio();

  function sanitizeUsername(name) {
    return (name || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);
  }

  let username = sanitizeUsername(localStorage.getItem("gubUser"));

  function showUsernamePrompt() {
    const overlay = document.getElementById("usernameOverlay");
    const input = document.getElementById("usernameInput");
    const submit = document.getElementById("usernameSubmit");
    overlay.style.display = "flex";

    function accept() {
      const val = sanitizeUsername(input.value);
      if (val.length >= 3) {
        username = val;
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

  if (username) {
    initApp();
  } else {
    showUsernamePrompt();
  }

  async function initApp() {
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

    await firebase.auth().signInAnonymously();
    const db = firebase.database();
    const functions = firebase.functions();
    const getStateFn = functions.httpsCallable("getState");
    const clickGubFn = functions.httpsCallable("clickGub");
    const purchaseItemFn = functions.httpsCallable("purchaseItem");
    const uid = firebase.auth().currentUser.uid;

    const allUsers = new Set([username]);

    db.ref(`leaderboard_v3/${uid}/username`).set(username);

    // Presence tracking
    const presenceRef = db.ref(".info/connected");
    const userOnlineRef = db.ref(`presence/${uid}`);
    presenceRef.on("value", (snap) => {
      if (snap.val() === true) {
        userOnlineRef.set(username);
        userOnlineRef.onDisconnect().remove();
      }
    });
    const onlineUsersEl = document.getElementById("online-users");
    const presenceListRef = db.ref("presence");
    const onlineUsers = new Map();
    function renderOnlineUsers() {
      const arr = Array.from(onlineUsers.values());
      onlineUsersEl.textContent = `Online: ${arr.length}`;
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

    // Leaderboard
    const leaderboardEl = document.getElementById("leaderboard");
    function renderLeaderboard(entries) {
      let html = "<strong>Leaderboard</strong><br />";
      entries.forEach((e) => {
        html += `${e.username || "anon"} - ${Math.floor(e.score || 0)}<br />`;
      });
      leaderboardEl.innerHTML = html;
    }
    db.ref("leaderboard_v3")
      .orderByChild("score")
      .limitToLast(10)
      .on("value", (snap) => {
        const arr = [];
        snap.forEach((child) => {
          const val = child.val() || {};
          arr.push({ username: val.username, score: val.score });
          if (val.username) allUsers.add(val.username);
        });
        arr.sort((a, b) => b.score - a.score);
        renderLeaderboard(arr);
      });

    initChat({ db, username, allUsers, sanitizeUsername, playMentionSound });

    // Basic UI toggles
    const shopPanel = document.getElementById("shopPanel");
    const shopBtn = document.getElementById("shopBtn");
    if (shopBtn && shopPanel) {
      shopBtn.addEventListener("click", () => {
        shopPanel.style.display =
          shopPanel.style.display === "block" ? "none" : "block";
      });
    }
    const adminPanel = document.getElementById("adminPanel");
    const adminBtn = document.getElementById("adminBtn");
    if (adminBtn && adminPanel) {
      adminBtn.addEventListener("click", () => {
        adminPanel.style.display =
          adminPanel.style.display === "block" ? "none" : "block";
      });
    }

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
        const owned = shop[itemId] || 0;
        const cost = nextCost(itemId);
        el.textContent = `${itemId} (${owned}) - ${cost} gubs`;
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
  }
});

