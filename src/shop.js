import { currentCost, totalCost, maxAffordable } from '../shared/cost.js';
export async function initShop({
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
}) {
  const configUrl = new URL('../shared/shopConfig.json', import.meta.url);
  const { COST_MULTIPLIER, RATES, SHOP_ITEMS } = await fetch(configUrl).then(
    (r) => r.json(),
  );
  const shopItems = [
    {
      id: 'passiveMaker',
      name: 'The Gub',
      baseCost: SHOP_ITEMS.passiveMaker,
      rate: RATES.passiveMaker,
    },
    {
      id: 'guberator',
      name: 'Guberator',
      baseCost: SHOP_ITEMS.guberator,
      rate: RATES.guberator,
    },
    {
      id: 'gubmill',
      name: 'Gubmill',
      baseCost: SHOP_ITEMS.gubmill,
      rate: RATES.gubmill,
    },
    {
      id: 'gubsolar',
      name: 'Solar Gub Panels',
      baseCost: SHOP_ITEMS.gubsolar,
      rate: RATES.gubsolar,
    },
    {
      id: 'gubfactory',
      name: 'Gubactory',
      baseCost: SHOP_ITEMS.gubfactory,
      rate: RATES.gubfactory,
    },
    {
      id: 'gubhydro',
      name: 'Hydro Gub Plant',
      baseCost: SHOP_ITEMS.gubhydro,
      rate: RATES.gubhydro,
    },
    {
      id: 'gubnuclear',
      name: 'Nuclear Gub Plant',
      baseCost: SHOP_ITEMS.gubnuclear,
      rate: RATES.gubnuclear,
    },
    {
      id: 'gubquantum',
      name: 'Quantum Gub Computer',
      baseCost: SHOP_ITEMS.gubquantum,
      rate: RATES.gubquantum,
    },
    {
      id: 'gubai',
      name: 'GUB AI',
      caption: '(be careful of gubnet...)',
      baseCost: SHOP_ITEMS.gubai,
      rate: RATES.gubai,
    },
    {
      id: 'gubclone',
      name: 'Gub Cloning Facility',
      baseCost: SHOP_ITEMS.gubclone,
      rate: RATES.gubclone,
    },
    {
      id: 'gubspace',
      name: 'Gub Space Program',
      baseCost: SHOP_ITEMS.gubspace,
      rate: RATES.gubspace,
    },
    {
      id: 'intergalactic',
      name: 'Intergalactic Gub',
      baseCost: SHOP_ITEMS.intergalactic,
      rate: RATES.intergalactic,
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

  function updatePassiveIncome() {
    const perSecondTotal = shopItems.reduce(
      (sum, item) => sum + owned[item.id] * item.rate,
      0,
    );
    gameState.passiveRatePerSec = perSecondTotal;
    passiveWorker.postMessage({ type: 'rate', value: gameState.passiveRatePerSec });
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
    db.ref('leaderboard_v3')
      .orderByChild('username')
      .equalTo(target)
      .once('value')
      .then((snap) => {
        snap.forEach((child) => {
          child.ref.update({ score });
        });
      });
  });

  adminDelete.addEventListener('click', () => {
    const target = sanitizeUsername(adminUser.value);
    if (!target) return;
    db.ref('leaderboard_v3')
      .orderByChild('username')
      .equalTo(target)
      .once('value')
      .then((snap) => {
        snap.forEach((child) => child.ref.remove());
      });
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

    function currentItemCost() {
      return currentCost(item.baseCost, COST_MULTIPLIER, owned[item.id]);
    }

    function totalItemCost(quantity) {
      return totalCost(item.baseCost, COST_MULTIPLIER, owned[item.id], quantity);
    }

    function updateCostDisplay() {
      costSpan.textContent = abbreviateNumber(currentItemCost());
    }

    async function attemptPurchase(quantity) {
      await syncGubsFromServer();
      const cost = totalItemCost(quantity);
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
    }

    function maxAffordableItem() {
      return maxAffordable(
        item.baseCost,
        COST_MULTIPLIER,
        owned[item.id],
        gameState.globalCount,
      );
    }

    buy1.addEventListener('click', () => attemptPurchase(1));
    buy10.addEventListener('click', () => attemptPurchase(10));
    buy100.addEventListener('click', () => attemptPurchase(100));
    buyAll.addEventListener('click', () => {
      const qty = maxAffordableItem();
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
          currentCost(item.baseCost, COST_MULTIPLIER, owned[item.id]),
        );
      }
    });
    updatePassiveIncome();
  });
}

