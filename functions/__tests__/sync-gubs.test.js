import { describe, test, expect, jest } from '@jest/globals';

let rootState;
function getVal(path = '') {
  const parts = path.split('/').filter(Boolean);
  let val = rootState;
  for (const p of parts) {
    val = val && val[p];
  }
  return val;
}

function setVal(path = '', value) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) {
    rootState = value;
    return;
  }
  let obj = rootState;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    obj[p] = obj[p] || {};
    obj = obj[p];
  }
  obj[parts[parts.length - 1]] = value;
}

const mockDb = {
  ref: jest.fn((path = '') => ({
    transaction: (update) => {
      const current = getVal(path);
      const res = update(current);
      if (res === undefined) {
        return {
          committed: false,
          snapshot: {
            val: () => current,
            child: (childPath) => ({
              val: () => getVal(`${path}/${childPath}`),
            }),
          },
        };
      }
      setVal(path, res);
      return {
        committed: true,
        snapshot: {
          val: () => getVal(path),
          child: (childPath) => ({
            val: () => getVal(`${path}/${childPath}`),
          }),
        },
      };
    },
    once: async () => ({ val: () => getVal(path) }),
  })),
};

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
    rootState = {
      leaderboard_v3: { [uid]: { score: 0, lastUpdated: 0 } },
      shop_v2: {},
    };
    await Promise.all(
      Array.from({ length: 5 }, () =>
        syncGubs({ delta: 1 }, { auth: { uid } }),
      ),
    );
    expect(rootState.leaderboard_v3[uid].score).toBe(5);
  });

  test('rejects non-finite delta', async () => {
    const uid = 'user2';
    rootState = {
      leaderboard_v3: { [uid]: { score: 0, lastUpdated: 0 } },
      shop_v2: {},
    };
    await expect(
      syncGubs({ delta: Infinity }, { auth: { uid } }),
    ).rejects.toHaveProperty('code', 'invalid-argument');
  });

  test('clamps large delta', async () => {
    const uid = 'user3';
    rootState = {
      leaderboard_v3: { [uid]: { score: 0, lastUpdated: 0 } },
      shop_v2: {},
    };
    const res = await syncGubs({ delta: 1e7 }, { auth: { uid } });
    expect(res).toEqual({ score: 1e6, offlineEarned: 0 });
    expect(rootState.leaderboard_v3[uid].score).toBe(1e6);
  });
});
