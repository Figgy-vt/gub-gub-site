import {
  shopConfig,
  currentCost as calcCurrentCost,
  totalCost as calcTotalCost,
  maxAffordable as calcMaxAffordable,
} from '../shared/index.js';

export function initShop({
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
}) {
  const COST_MULTIPLIER = shopConfig.costMultiplier;
  const shopItems = shopConfig.items;
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

  function updatePassiveIncome() {
    const perSecondTotal = shopItems.reduce(
      (sum, item) => sum + owned[item.id] * item.rate,
      0,
    );
    gameState.passiveRatePerSec = perSecondTotal;
    passiveWorker.postMessage({
      type: 'rate',
      value: gameState.passiveRatePerSec,
    });
    renderCounter();
    queueScoreUpdate();
  }

  const shopBtn = document.getElementById('shopBtn');
  const shopPanel = document.getElementById('shopPanel');
  const shopContainer = document.getElementById('shopItemsContainer');
  const adminBtn = document.getElementById('adminBtn');
  const adminPanel = document.getElementById('adminPanel');
  const adminUser = document.getElementById('adminUsername');
  const adminScore = document.getElementById('adminScore');
  const adminUpdate = document.getElementById('adminUpdate');
  const adminDelete = document.getElementById('adminDelete');

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

  shopBtn.addEventListener('click', () => {
    shopPanel.style.display =
      shopPanel.style.display === 'block' ? 'none' : 'block';
  });

  shopItems.forEach((item) => {
    const div = document.createElement('div');
    div.innerHTML = `
    <strong>${item.name}</strong>${
      item.caption
        ? ` <span style="color:red;font-size:0.8em;">${item.caption}</span>`
        : ''
    }<br>
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

    function updateCostDisplay() {
      costSpan.textContent = abbreviateNumber(
        calcCurrentCost(item.baseCost, owned[item.id], COST_MULTIPLIER),
      );
    }

    async function attemptPurchase(quantity) {
      if (gameState.syncPaused) return;
      gameState.syncPaused = true;
      try {
        try {
          await syncGubsFromServer();
        } catch (err) {
          console.error('syncGubsFromServer failed', err);
          logError(db, {
            message: err.message,
            stack: err.stack,
            context: 'attemptPurchase.sync',
          });
          return;
        }
        const cost = calcTotalCost(
          item.baseCost,
          owned[item.id],
          quantity,
          COST_MULTIPLIER,
        );
        if (gameState.globalCount >= cost) {
          try {
            const res = await purchaseItemFn({
              item: item.id,
              quantity,
            });
            if (res.data) {
              if (typeof res.data.owned === 'number') {
                owned[item.id] = res.data.owned;
                document.getElementById(`owned-${item.id}`).textContent =
                  owned[item.id];
              }
              if (typeof res.data.score === 'number') {
                gameState.globalCount = gameState.displayedCount = res.data.score;
                gameState.unsyncedDelta = 0;
                renderCounter();
              }
            }
            updatePassiveIncome();
            updateCostDisplay();
          } catch (err) {
            console.error('purchaseItem failed', err);
            logError(db, {
              message: err.message,
              stack: err.stack,
              context: 'attemptPurchase',
            });
          }
        }
      } finally {
        gameState.syncPaused = false;
      }
    }
    buy1.addEventListener('click', () => attemptPurchase(1));
    buy10.addEventListener('click', () => attemptPurchase(10));
    buy100.addEventListener('click', () => attemptPurchase(100));
    buyAll.addEventListener('click', () => {
      const qty = calcMaxAffordable(
        item.baseCost,
        owned[item.id],
        gameState.globalCount,
        COST_MULTIPLIER,
      );
      if (qty > 0) attemptPurchase(qty);
    });
    updateCostDisplay();
  });

  shopRef.once('value').then((snapshot) => {
    const stored = snapshot.val() || {};
    shopItems.forEach((item) => {
      owned[item.id] = stored[item.id] || 0;
      document.getElementById(`owned-${item.id}`).textContent = owned[item.id];
      const costSpan = document.getElementById(`cost-${item.id}`);
      if (costSpan) {
        costSpan.textContent = abbreviateNumber(
          calcCurrentCost(item.baseCost, owned[item.id], COST_MULTIPLIER),
        );
      }
    });
    updatePassiveIncome();
  });
}
