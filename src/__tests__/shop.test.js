/**
 * @jest-environment jsdom
 */
import { describe, test, expect, jest } from '@jest/globals';
import { initShop } from '../shop.js';

function setupDOM() {
  document.body.innerHTML = `
    <div id="shopPanel"></div>
    <div id="shopItemsContainer"></div>
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
    const buyBtn = document.getElementById('buy-passiveMaker');
    buyBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(purchaseItemFn).toHaveBeenCalledWith({
      item: 'passiveMaker',
      quantity: 1,
    });
    expect(document.getElementById('owned-passiveMaker').textContent).toBe('1');
    expect(gameState.globalCount).toBe(100);
    expect(document.getElementById('cost-passiveMaker').textContent).toBe('114');
    expect(passiveWorker.postMessage).toHaveBeenCalledWith({
      type: 'rate',
      value: 1,
    });
    expect(renderCounter).toHaveBeenCalled();
    expect(queueScoreUpdate).toHaveBeenCalled();
  });

  test('shows error when purchase cannot be afforded and clears on success', async () => {
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
    const error = new Error('Not enough gubs');
    error.code = 'failed-precondition';
    const purchaseItemFn = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ data: { owned: 1, score: 100 } });
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
    const buyBtn = document.getElementById('buy-passiveMaker');
    const errorEl = document.getElementById('error-passiveMaker');
    buyBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(errorEl.style.display).toBe('block');
    expect(errorEl.textContent.toLowerCase()).toContain('afford');
    buyBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(errorEl.style.display).toBe('none');
    expect(errorEl.textContent).toBe('');
  });
});

