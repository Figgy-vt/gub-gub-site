import { describe, test, expect, jest } from '@jest/globals';
import { rootState, setVal, mockDb } from './mock-db.js';

jest.unstable_mockModule('firebase-admin', () => ({
  default: { initializeApp: jest.fn(), database: () => mockDb },
}));

jest.unstable_mockModule('firebase-functions', () => ({
  https: {
    onCall: (fn) => fn,
    HttpsError: class extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    },
  },
  logger: { error: jest.fn(), info: jest.fn() },
}));

const { purchaseItem } = await import('../index.js');

describe('purchaseItem', () => {
  test('handles owned values stored as strings', async () => {
    const uid = 'user1';
    setVal('', {
      leaderboard_v3: { [uid]: { score: 150 } },
      shop_v2: { [uid]: { passiveMaker: '1' } },
    });

    const result = await purchaseItem(
      { item: 'passiveMaker', quantity: 1 },
      { auth: { uid } },
    );
    expect(result).toEqual({ score: 35, owned: 2 });
    expect(rootState.shop_v2[uid].passiveMaker).toBe(2);
    expect(rootState.leaderboard_v3[uid].score).toBe(35);
  });

  test('handles scores stored as raw numbers', async () => {
    const uid = 'userNum';
    setVal('', {
      leaderboard_v3: { [uid]: 200 },
      shop_v2: {},
    });

    const result = await purchaseItem(
      { item: 'passiveMaker', quantity: 1 },
      { auth: { uid } },
    );
    expect(result).toEqual({ score: 100, owned: 1 });
    expect(rootState.shop_v2[uid].passiveMaker).toBe(1);
    expect(rootState.leaderboard_v3[uid].score).toBe(100);
  });

  test('rejects unknown shop items', async () => {
    const uid = 'user2';
    setVal('', { leaderboard_v3: { [uid]: { score: 1000 } }, shop_v2: {} });
    await expect(
      purchaseItem({ item: 'nope', quantity: 1 }, { auth: { uid } }),
    ).rejects.toHaveProperty('code', 'invalid-argument');
  });

  test('rejects quantities over limit', async () => {
    const uid = 'user3';
    setVal('', { leaderboard_v3: { [uid]: { score: 1000 } }, shop_v2: {} });
    await expect(
      purchaseItem({ item: 'passiveMaker', quantity: 1001 }, { auth: { uid } }),
    ).rejects.toHaveProperty('code', 'invalid-argument');
  });

  test('rejects negative quantities', async () => {
    const uid = 'user4';
    setVal('', { leaderboard_v3: { [uid]: { score: 1000 } }, shop_v2: {} });
    await expect(
      purchaseItem({ item: 'passiveMaker', quantity: -5 }, { auth: { uid } }),
    ).rejects.toHaveProperty('code', 'invalid-argument');
  });

  test('rejects non-numeric quantities', async () => {
    const uid = 'user5';
    setVal('', { leaderboard_v3: { [uid]: { score: 1000 } }, shop_v2: {} });
    await expect(
      purchaseItem(
        { item: 'passiveMaker', quantity: 'abc' },
        { auth: { uid } },
      ),
    ).rejects.toHaveProperty('code', 'invalid-argument');
  });
});
