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

const { syncGubs } = await import('../index.js');

describe('syncGubs', () => {
  test('applies increments atomically under concurrent calls', async () => {
    const uid = 'user1';
    setVal('', {
      leaderboard_v3: { [uid]: { score: 0, lastUpdated: 0 } },
      shop_v2: {},
    });
    await Promise.all(
      Array.from({ length: 5 }, () =>
        syncGubs({ delta: 1 }, { auth: { uid } }),
      ),
    );
    expect(rootState.leaderboard_v3[uid].score).toBe(5);
  });

  test('rejects non-finite delta', async () => {
    const uid = 'user2';
    setVal('', {
      leaderboard_v3: { [uid]: { score: 0, lastUpdated: 0 } },
      shop_v2: {},
    });
    await expect(
      syncGubs({ delta: Infinity }, { auth: { uid } }),
    ).rejects.toHaveProperty('code', 'invalid-argument');
  });

  test('syncs large delta without clamping', async () => {
    const uid = 'user3';
    setVal('', {
      leaderboard_v3: { [uid]: { score: 0, lastUpdated: 0 } },
      shop_v2: {},
    });
    const res = await syncGubs({ delta: 1e7 }, { auth: { uid } });
    expect(res).toEqual({ score: 1e7, offlineEarned: 0 });
    expect(rootState.leaderboard_v3[uid].score).toBe(1e7);
  });

  test('handles legacy numeric leaderboard entries', async () => {
    const uid = 'user4';
    setVal('', { leaderboard_v3: { [uid]: 50 }, shop_v2: {} });
    const res = await syncGubs({ delta: 10 }, { auth: { uid } });
    expect(res).toEqual({ score: 60, offlineEarned: 0 });
    expect(rootState.leaderboard_v3[uid].score).toBe(60);
  });
});
