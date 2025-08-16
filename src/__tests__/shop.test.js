/**
 * @jest-environment jsdom
 */
import { describe, test, expect, jest } from '@jest/globals';
import { initShop } from '../shop.js';

function setupDOM() {
  document.body.innerHTML = `
    <div id="shopPanel"></div>
    <div id="shopItemsContainer"></div>
    <div id="upgradesBar"></div>
    <button id="adminBtn" style="display:none"></button>
    <div id="adminPanel"></div>
    <input id="adminUsername" />
    <input id="adminScore" />
    <button id="adminUpdate"></button>
    <button id="adminDelete"></button>
  `;
  window.alert = jest.fn();
}

describe('shop purchasing flow', () => {
  test('buy button purchases item and updates state', async () => {
    setupDOM();
    const uid = 'user123';
    const refs = {};
    const db = {
      ref: (path) => {
        const ref =
          refs[path] ||
          (refs[path] = {
            on: jest.fn(),
            once: jest
              .fn()
              .mockResolvedValue(
                path === `shop_v2/${uid}`
                  ? { val: () => ({}) }
                  : { val: () => null, exists: () => false },
              ),
            set: jest.fn(),
            onDisconnect: () => ({ remove: jest.fn() }),
            push: jest.fn(() => ({ set: jest.fn() })),
            orderByChild: jest.fn().mockReturnThis(),
            equalTo: jest.fn().mockReturnThis(),
            update: jest.fn(),
          });
        return ref;
      },
    };
    const purchaseItemFn = jest.fn(async () => ({
      data: { owned: 1, score: 100 },
    }));
    const syncGubsFromServer = jest.fn();
    const renderCounter = jest.fn();
    const queueScoreUpdate = jest.fn();
    const passiveWorker = { postMessage: jest.fn() };
    const gameState = {
      globalCount: 200,
      displayedCount: 200,
      unsyncedDelta: 0,
      passiveRatePerSec: 0,
    };
    initShop({
      db,
      uid,
      purchaseItemFn,
      purchaseUpgradeFn: jest.fn(),
      updateUserScoreFn: jest.fn(),
      deleteUserFn: jest.fn(),
      syncGubsFromServer,
      gameState,
      renderCounter,
      queueScoreUpdate,
      abbreviateNumber: (n) => String(n),
      passiveWorker,
      logError: jest.fn(),
      sanitizeUsername: (u) => u,
    });
    await Promise.resolve();
    const buyBtn = document.getElementById('buy-passiveMaker');
    expect(buyBtn.textContent).toBe('x1');
    buyBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(purchaseItemFn).toHaveBeenCalledWith({
      item: 'passiveMaker',
      quantity: 1,
    });
    expect(document.getElementById('owned-passiveMaker').textContent).toBe('1');
    expect(gameState.globalCount).toBe(100);
    expect(document.getElementById('cost-passiveMaker').textContent).toBe(
      '114',
    );
    expect(passiveWorker.postMessage).toHaveBeenCalledWith({
      type: 'rate',
      value: 1,
    });
    expect(renderCounter).toHaveBeenCalled();
    expect(queueScoreUpdate).toHaveBeenCalled();
  });

  test('disables buy buttons when gubs are insufficient', () => {
    jest.useFakeTimers();
    setupDOM();
    const uid = 'user123';
    const refs = {};
    const db = {
      ref: (path) => {
        const ref =
          refs[path] ||
          (refs[path] = {
            on: jest.fn(),
            once: jest
              .fn()
              .mockResolvedValue(
                path === `shop_v2/${uid}`
                  ? { val: () => ({}) }
                  : { val: () => null, exists: () => false },
              ),
            set: jest.fn(),
            onDisconnect: () => ({ remove: jest.fn() }),
            push: jest.fn(() => ({ set: jest.fn() })),
            orderByChild: jest.fn().mockReturnThis(),
            equalTo: jest.fn().mockReturnThis(),
            update: jest.fn(),
          });
        return ref;
      },
    };
    const passiveWorker = { postMessage: jest.fn() };
    const gameState = {
      globalCount: 50,
      displayedCount: 50,
      unsyncedDelta: 0,
      passiveRatePerSec: 0,
    };
    initShop({
      db,
      uid,
      purchaseItemFn: jest.fn(),
      purchaseUpgradeFn: jest.fn(),
      updateUserScoreFn: jest.fn(),
      deleteUserFn: jest.fn(),
      gameState,
      renderCounter: jest.fn(),
      queueScoreUpdate: jest.fn(),
      abbreviateNumber: (n) => String(n),
      passiveWorker,
      logError: jest.fn(),
      sanitizeUsername: (u) => u,
    });
    const buy1 = document.getElementById('buy-passiveMaker');
    const buy10 = document.getElementById('buy-passiveMaker-x10');
    const buy100 = document.getElementById('buy-passiveMaker-x100');
    jest.advanceTimersByTime(200);
    expect(buy1.disabled).toBe(true);
    expect(buy10.disabled).toBe(true);
    expect(buy100.disabled).toBe(true);

    gameState.globalCount = 150;
    jest.advanceTimersByTime(200);
    expect(buy1.disabled).toBe(false);
    expect(buy10.disabled).toBe(true);
    expect(buy100.disabled).toBe(true);

    gameState.globalCount = 3000;
    jest.advanceTimersByTime(200);
    expect(buy10.disabled).toBe(false);
    expect(buy100.disabled).toBe(true);
    jest.useRealTimers();
  });

  test('keeps higher quantity buttons disabled after purchasing one item', async () => {
    jest.useFakeTimers();
    setupDOM();
    const uid = 'user123';
    const refs = {};
    const db = {
      ref: (path) => {
        const ref =
          refs[path] ||
          (refs[path] = {
            on: jest.fn(),
            once: jest
              .fn()
              .mockResolvedValue(
                path === `shop_v2/${uid}`
                  ? { val: () => ({}) }
                  : { val: () => null, exists: () => false },
              ),
            set: jest.fn(),
            onDisconnect: () => ({ remove: jest.fn() }),
            push: jest.fn(() => ({ set: jest.fn() })),
            orderByChild: jest.fn().mockReturnThis(),
            equalTo: jest.fn().mockReturnThis(),
            update: jest.fn(),
          });
        return ref;
      },
    };
    const purchaseItemFn = jest.fn(async () => ({
      data: { owned: 1, score: 0 },
    }));
    const renderCounter = jest.fn();
    const queueScoreUpdate = jest.fn();
    const passiveWorker = { postMessage: jest.fn() };
    const gameState = {
      globalCount: 100,
      displayedCount: 100,
      unsyncedDelta: 0,
      passiveRatePerSec: 0,
    };
    initShop({
      db,
      uid,
      purchaseItemFn,
      purchaseUpgradeFn: jest.fn(),
      updateUserScoreFn: jest.fn(),
      deleteUserFn: jest.fn(),
      gameState,
      renderCounter,
      queueScoreUpdate,
      abbreviateNumber: (n) => String(n),
      passiveWorker,
      logError: jest.fn(),
      sanitizeUsername: (u) => u,
    });
    const buy1 = document.getElementById('buy-passiveMaker');
    const buy10 = document.getElementById('buy-passiveMaker-x10');
    const buy100 = document.getElementById('buy-passiveMaker-x100');

    jest.advanceTimersByTime(200);
    expect(buy1.disabled).toBe(false);
    expect(buy10.disabled).toBe(true);
    expect(buy100.disabled).toBe(true);

    buy1.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(buy1.disabled).toBe(true);
    expect(buy10.disabled).toBe(true);
    expect(buy100.disabled).toBe(true);
    jest.useRealTimers();
  });

  test('buying an upgrade marks it owned', async () => {
    setupDOM();
    const uid = 'user123';
    const refs = {};
    const db = {
      ref: (path) => {
        const ref =
          refs[path] ||
          (refs[path] = {
            on: jest.fn(),
            once: jest.fn().mockResolvedValue(
              path === `shop_v2/${uid}`
                ? { val: () => ({ passiveMaker: 25 }) }
                : { val: () => ({}), exists: () => false },
            ),
            set: jest.fn(),
            onDisconnect: () => ({ remove: jest.fn() }),
            push: jest.fn(() => ({ set: jest.fn() })),
            orderByChild: jest.fn().mockReturnThis(),
            equalTo: jest.fn().mockReturnThis(),
            update: jest.fn(),
          });
        return ref;
      },
    };
    const purchaseUpgradeFn = jest.fn(async () => ({
      data: { owned: true, score: 190000 },
    }));
    const renderCounter = jest.fn();
    const queueScoreUpdate = jest.fn();
    const passiveWorker = { postMessage: jest.fn() };
    const gameState = {
      globalCount: 200000,
      displayedCount: 200000,
      unsyncedDelta: 0,
      passiveRatePerSec: 0,
    };
    initShop({
      db,
      uid,
      purchaseItemFn: jest.fn(),
      purchaseUpgradeFn,
      updateUserScoreFn: jest.fn(),
      deleteUserFn: jest.fn(),
      gameState,
      renderCounter,
      queueScoreUpdate,
      abbreviateNumber: (n) => String(n),
      passiveWorker,
      logError: jest.fn(),
      sanitizeUsername: (u) => u,
    });
    await Promise.resolve();
    await Promise.resolve();
    const upgEl = document.getElementById('upgrade-upg1');
    upgEl.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(purchaseUpgradeFn).toHaveBeenCalledWith({ upgrade: 'upg1' });
    expect(upgEl.classList.contains('owned')).toBe(true);
    expect(gameState.globalCount).toBe(190000);
  });

  test('upgrades hidden until requirement met except first', async () => {
    setupDOM();
    const uid = 'user456';
    const refs = {};
    const db = {
      ref: (path) => {
        const ref =
          refs[path] ||
          (refs[path] = {
            on: jest.fn(),
            once: jest.fn().mockResolvedValue(
              path === `shop_v2/${uid}`
                ? { val: () => ({ passiveMaker: 0 }) }
                : { val: () => ({}), exists: () => false },
            ),
            set: jest.fn(),
            onDisconnect: () => ({ remove: jest.fn() }),
            push: jest.fn(() => ({ set: jest.fn() })),
            orderByChild: jest.fn().mockReturnThis(),
            equalTo: jest.fn().mockReturnThis(),
            update: jest.fn(),
          });
        return ref;
      },
    };
    const gameState = {
      globalCount: 0,
      displayedCount: 0,
      unsyncedDelta: 0,
      passiveRatePerSec: 0,
    };
    initShop({
      db,
      uid,
      purchaseItemFn: jest.fn(),
      purchaseUpgradeFn: jest.fn(),
      updateUserScoreFn: jest.fn(),
      deleteUserFn: jest.fn(),
      gameState,
      renderCounter: jest.fn(),
      queueScoreUpdate: jest.fn(),
      abbreviateNumber: (n) => String(n),
      passiveWorker: { postMessage: jest.fn() },
      logError: jest.fn(),
      sanitizeUsername: (u) => u,
    });
    await Promise.resolve();
    await Promise.resolve();
    const upg1El = document.getElementById('upgrade-upg1');
    const upg2El = document.getElementById('upgrade-upg2');
    expect(upg1El.classList.contains('hidden')).toBe(false);
    expect(upg2El.classList.contains('hidden')).toBe(true);
  });
});
