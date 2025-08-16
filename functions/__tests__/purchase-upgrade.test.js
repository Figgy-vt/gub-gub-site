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

const { purchaseUpgrade } = await import('../index.js');

describe('purchaseUpgrade', () => {
  test('buys upgrade and deducts score', async () => {
    const uid = 'user1';
    setVal('', {
      leaderboard_v3: { [uid]: { score: 200000 } },
      upgrades_v1: {},
      shop_v2: { [uid]: { passiveMaker: 25 } },
    });

    const result = await purchaseUpgrade(
      { upgrade: 'upg1' },
      { auth: { uid } },
    );
    expect(result).toEqual({ score: 190000, owned: true });
    expect(rootState.upgrades_v1[uid].upg1).toBe(true);
    expect(rootState.leaderboard_v3[uid].score).toBe(190000);
  });

  test('rejects unknown upgrade', async () => {
    const uid = 'user2';
    setVal('', { leaderboard_v3: { [uid]: { score: 1000 } }, upgrades_v1: {} });
    await expect(
      purchaseUpgrade({ upgrade: 'nope' }, { auth: { uid } }),
    ).rejects.toHaveProperty('code', 'invalid-argument');
  });

  test('rejects if not enough items owned', async () => {
    const uid = 'user3';
    setVal('', {
      leaderboard_v3: { [uid]: { score: 200000 } },
      upgrades_v1: {},
      shop_v2: { [uid]: { passiveMaker: 10 } },
    });
    await expect(
      purchaseUpgrade({ upgrade: 'upg1' }, { auth: { uid } }),
    ).rejects.toHaveProperty('code', 'failed-precondition');
  });
});
