/**
 * @jest-environment jsdom
 */
import { describe, test, expect, jest } from '@jest/globals';
import { initShop } from '../shop.js';

function setupDOM() {
  document.body.innerHTML = `
    <button id="shopBtn"></button>
    <div id="shopPanel"></div>
    <div id="shopItemsContainer"></div>
    <button id="adminBtn" style="display:none"></button>
    <div id="adminPanel"></div>
    <input id="adminUsername" />
    <input id="adminScore" />
    <button id="adminUpdate"></button>
    <button id="adminDelete"></button>
  `;
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

  test('purchase is aborted if sync fails', async () => {
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
    const purchaseItemFn = jest.fn();
    const syncGubsFromServer = jest
      .fn()
      .mockRejectedValue(new Error('network'));
    const logError = jest.fn();
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
      renderCounter: jest.fn(),
      queueScoreUpdate: jest.fn(),
      abbreviateNumber: (n) => String(n),
      passiveWorker,
      logError,
      sanitizeUsername: (u) => u,
    });
    const buyBtn = document.getElementById('buy-passiveMaker');
    buyBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(purchaseItemFn).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });
});

