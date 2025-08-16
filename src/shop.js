import {
  shopConfig,
  currentCost as calcCurrentCost,
  totalCost as calcTotalCost,
} from '../shared/index.js';

export function initShop({
  db,
  uid,
  purchaseItemFn,
  purchaseUpgradeFn,
  updateUserScoreFn,
  deleteUserFn,

  // Provided by gameLoop to avoid racing the sync loop during purchases
  pauseSync,
  resumeSync,

  gameState,
  renderCounter,
  queueScoreUpdate,
  abbreviateNumber,
  passiveWorker,
  logError,
  sanitizeUsername,
  playBuySound = () => {},
}) {
  const DEFAULT_COST_MULTIPLIER = shopConfig.costMultiplier;
  const shopItems = shopConfig.items;
  const upgrades = shopConfig.upgrades || [];
  const shopRef = db.ref(`shop_v2/${uid}`);
  const upgradeRef = db.ref(`upgrades_v1/${uid}`);

  const updateFns = [];

  // local cache of owned counts (populated from DB on load)
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
  const ownedUpgrades = {};

  // Warm cloud functions to avoid cold-start delay on first purchase
  function warmupPurchases() {
    if (shopItems[0]) {
      Promise.resolve(
        purchaseItemFn({ item: shopItems[0].id, dryRun: true }),
      ).catch(() => {});
    }
    if (upgrades[0]) {
      Promise.resolve(
        purchaseUpgradeFn({ upgrade: upgrades[0].id, dryRun: true }),
      ).catch(() => {});
    }
  }
  warmupPurchases();
  const warmInterval = setInterval(warmupPurchases, 5 * 60 * 1000);
  if (warmInterval && typeof warmInterval.unref === 'function') warmInterval.unref();

  function updatePassiveIncome() {
    const perSecondTotal = shopItems.reduce((sum, item) => {
      let rate = item.rate;
      upgrades.forEach((u) => {
        if (u.target === item.id && ownedUpgrades[u.id]) {
          rate *= u.multiplier;
        }
      });
      return sum + (owned[item.id] || 0) * rate;
    }, 0);
    gameState.passiveRatePerSec = perSecondTotal;
    passiveWorker.postMessage({
      type: 'rate',
      value: gameState.passiveRatePerSec,
    });
    renderCounter();
    queueScoreUpdate();
  }

  const shopPanel = document.getElementById('shopPanel');
  const shopContainer = document.getElementById('shopItemsContainer');
  const upgradesContainer = document.getElementById('upgradesBar');
  const adminBtn = document.getElementById('adminBtn');
  const adminPanel = document.getElementById('adminPanel');
  const adminUser = document.getElementById('adminUsername');
  const adminScore = document.getElementById('adminScore');
  const adminUpdate = document.getElementById('adminUpdate');
  const adminDelete = document.getElementById('adminDelete');
  const shopToggleBtn = document.getElementById('shopToggleBtn');
  if (shopToggleBtn) {
    shopToggleBtn.addEventListener('click', () => {
      const hidden = shopPanel.style.display === 'none';
      shopPanel.style.display = hidden ? 'block' : 'none';
      shopToggleBtn.textContent = hidden ? 'Hide Shop' : 'Show Shop';
    });
  }

  const ADMIN_UIDS = [
    'sGd1ZHR1nvMKKCw9A1O5bwtbFD23',
    'YHtvs4JyAtS3SUtNAUJuPMm3ac22',
  ];

  db.ref('admins/' + uid)
    .once('value')
    .then((snap) => {
      if (!snap.exists() && ADMIN_UIDS.includes(uid)) {
        db.ref('admins/' + uid).set(true);
        adminBtn.style.display = 'block';
      } else if (snap.val()) {
        adminBtn.style.display = 'block';
      }
    });

  adminBtn.addEventListener('click', () => {
    adminPanel.style.display =
      adminPanel.style.display === 'block' ? 'none' : 'block';
  });

  adminUpdate.addEventListener('click', () => {
    const target = sanitizeUsername(adminUser.value);
    const score = parseInt(adminScore.value, 10);
    if (!target || isNaN(score)) return;
    updateUserScoreFn({ username: target, score }).catch((err) =>
      logError(db, {
        message: err.message,
        stack: err.stack,
        context: 'updateUserScore',
      }),
    );
  });

  adminDelete.addEventListener('click', () => {
    const target = sanitizeUsername(adminUser.value);
    if (!target) return;
    deleteUserFn({ username: target }).catch((err) =>
      logError(db, {
        message: err.message,
        stack: err.stack,
        context: 'deleteUser',
      }),
    );
  });

  // Render upgrades bar
  upgrades.forEach((upg, idx) => {
    const div = document.createElement('div');
    div.className = 'upgrade-item disabled';
    if (idx > 0) div.classList.add('hidden');
    div.id = `upgrade-${upg.id}`;
    const costText = abbreviateNumber(upg.cost);
    div.innerHTML = `
      <img src="${upg.image}" alt="${upg.name}">
      <div class="upgrade-tooltip">
        <strong>${upg.name}<span class="upgrade-cost">${costText}</span></strong><br>
        ${upg.modifier}<br>
        <span class="desc">${upg.description}</span>
      </div>
    `;
    upgradesContainer.appendChild(div);

    const costSpan = div.querySelector('.upgrade-cost');
    if (costSpan) costSpan.style.color = 'red';

    async function attemptPurchase() {
      if (div.classList.contains('disabled')) return;
      if (ownedUpgrades[upg.id]) return;
      if (gameState.globalCount < upg.cost) return;
      playBuySound();
      if (typeof pauseSync === 'function') pauseSync();
      try {
        const res = await purchaseUpgradeFn({ upgrade: upg.id });
        if (res.data) {
          if (res.data.owned) {
            ownedUpgrades[upg.id] = true;
            div.classList.add('owned');
            if (costSpan) {
          costSpan.textContent = 'Purchased';
          costSpan.style.color = 'red';
            }
          }
          if (typeof res.data.score === 'number') {
            gameState.globalCount = gameState.displayedCount = res.data.score;
            gameState.unsyncedDelta = 0;
            renderCounter();
          }
        }
        updatePassiveIncome();
      } catch (err) {
        console.error('purchaseUpgrade failed', err);
        if (
          err?.code !== 'failed-precondition' &&
          !/not enough gubs/i.test(err.message)
        ) {
          window.alert('Purchase failed');
        }
        logError(db, {
          message: err.message,
          stack: err.stack,
          context: 'purchaseUpgrade',
        });
      } finally {
        if (typeof resumeSync === 'function') resumeSync();
        updateState();
      }
    }

    function updateState() {
      const unlocked = (owned[upg.target] || 0) >= (upg.unlockAt || 0);
      div.classList.toggle('hidden', !unlocked && idx > 0);
      const affordable =
        unlocked && gameState.globalCount >= upg.cost && !ownedUpgrades[upg.id];
      div.classList.toggle('disabled', !affordable);
      if (costSpan) {
        if (ownedUpgrades[upg.id]) {
          costSpan.style.color = 'red';
          costSpan.textContent = 'Purchased';
        } else {
          costSpan.style.color = affordable ? 'green' : 'red';
          costSpan.textContent = costText;
        }
      }
    }

    updateFns.push(updateState);
    div.addEventListener('click', attemptPurchase);
  });

  // Render each shop item
  shopItems.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.innerHTML = `
      ${
        item.image
          ? `<img src="${item.image}" alt="${item.name}" class="shop-item-image">`
          : ''
      }
      <div class="shop-item-details">
        <strong>${item.name}</strong>${
          item.caption
            ? ` <span style="color:red;font-size:0.8em;">${item.caption}</span>`
            : ''
        }<br>
        Cost: <span id="cost-${item.id}"></span> Gubs<br>
        Rate: ${abbreviateNumber(item.rate)} Gub/s<br>
        <button id="buy-${item.id}">x1</button>
        <button id="buy-${item.id}-x10">x10</button>
        <button id="buy-${item.id}-x100">x100</button>
      </div>
      <span id="owned-${item.id}" class="owned-count">0</span>
    `;
    shopContainer.appendChild(div);
    const hr = document.createElement('hr');
    hr.style.borderColor = '#444';
    shopContainer.appendChild(hr);

    const buy1 = div.querySelector(`#buy-${item.id}`);
    const buy10 = div.querySelector(`#buy-${item.id}-x10`);
    const buy100 = div.querySelector(`#buy-${item.id}-x100`);
    const costSpan = div.querySelector(`#cost-${item.id}`);
    const itemMultiplier = item.costMultiplier || DEFAULT_COST_MULTIPLIER;

    function updateCostDisplay() {
      costSpan.textContent = abbreviateNumber(
        calcCurrentCost(item.baseCost, owned[item.id] || 0, itemMultiplier),
      );
    }

    // Prevent double-submits per item
    let purchasing = false;

    function updateButtons() {
      if (purchasing) return;
      const gubs = gameState.globalCount;
      const ownedCount = owned[item.id] || 0;
      const cost1 = calcCurrentCost(item.baseCost, ownedCount, itemMultiplier);
      buy1.disabled = gubs < cost1;
      const cost10 = calcTotalCost(
        item.baseCost,
        ownedCount,
        10,
        itemMultiplier,
      );
      buy10.disabled = gubs < cost10;
      const cost100 = calcTotalCost(
        item.baseCost,
        ownedCount,
        100,
        itemMultiplier,
      );
      buy100.disabled = gubs < cost100;
    }
    updateFns.push(updateButtons);

    async function attemptPurchase(quantity) {
      if (purchasing) return;
      purchasing = true;
      playBuySound();

      // disable these buttons while in-flight
      [buy1, buy10, buy100].forEach((b) => (b.disabled = true));

      // pause background sync loop so we don't race the server op
      if (typeof pauseSync === 'function') pauseSync();

      try {
        const res = await purchaseItemFn({ item: item.id, quantity });

        if (res.data) {
          if (typeof res.data.owned === 'number') {
            owned[item.id] = res.data.owned;
            const ownedEl = document.getElementById(`owned-${item.id}`);
            if (ownedEl) ownedEl.textContent = owned[item.id];
          }
          if (typeof res.data.score === 'number') {
            // Trust server score; clear local delta and refresh UI
            gameState.globalCount = gameState.displayedCount = res.data.score;
            gameState.unsyncedDelta = 0;
            renderCounter();
          }
        }

        updatePassiveIncome();
        updateCostDisplay();
      } catch (err) {
        console.error('purchaseItem failed', err);
        if (
          err?.code !== 'failed-precondition' &&
          !/not enough gubs/i.test(err.message)
        ) {
          window.alert('Purchase failed');
        }
        logError(db, {
          message: err.message,
          stack: err.stack,
          context: 'attemptPurchase',
        });
      } finally {
        if (typeof resumeSync === 'function') resumeSync();
        purchasing = false;
        updateButtons();
      }
    }

    buy1.addEventListener('click', () => attemptPurchase(1));
    buy10.addEventListener('click', () => attemptPurchase(10));
    buy100.addEventListener('click', () => attemptPurchase(100));

    updateCostDisplay();
    updateButtons();
  });

  setInterval(() => {
    updateFns.forEach((fn) => fn());
  }, 100);

  // Initial load of owned counts and upgrades
  Promise.all([shopRef.once('value'), upgradeRef.once('value')]).then(
    ([shopSnap, upgradeSnap]) => {
      const stored = shopSnap.val() || {};
      shopItems.forEach((item) => {
        owned[item.id] = stored[item.id] || 0;
        const ownedEl = document.getElementById(`owned-${item.id}`);
        if (ownedEl) ownedEl.textContent = owned[item.id];
        const costSpan = document.getElementById(`cost-${item.id}`);
        if (costSpan) {
          const multiplier = item.costMultiplier || DEFAULT_COST_MULTIPLIER;
          costSpan.textContent = abbreviateNumber(
            calcCurrentCost(item.baseCost, owned[item.id], multiplier),
          );
        }
      });
      const upgStored = upgradeSnap.val() || {};
      upgrades.forEach((upg) => {
        if (upgStored[upg.id]) {
          ownedUpgrades[upg.id] = true;
          const div = document.getElementById(`upgrade-${upg.id}`);
          if (div) {
            div.classList.add('owned');
            const costSpan = div.querySelector('.upgrade-cost');
            if (costSpan) {
              costSpan.textContent = 'Purchased';
              costSpan.style.color = 'red';
            }
          }
        }
      });
      updatePassiveIncome();
      updateFns.forEach((fn) => fn());
    },
  );
}
