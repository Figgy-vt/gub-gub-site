/* eslint-env jest */

// Mock firebase-admin before requiring index.js
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

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  database: () => mockDb,
}));

jest.mock('firebase-functions', () => ({
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

const { purchaseItem } = require('../index');

describe('purchaseItem', () => {
  test('handles owned values stored as strings', async () => {
    const uid = 'user1';
    rootState = {
      leaderboard_v3: { [uid]: { score: 150 } },
      shop_v2: { [uid]: { passiveMaker: '1' } },
    };

    const result = await purchaseItem(
      { item: 'passiveMaker', quantity: 1 },
      { auth: { uid } },
    );
    expect(result).toEqual({ score: 36, owned: 2 });
    expect(rootState.shop_v2[uid].passiveMaker).toBe(2);
    expect(rootState.leaderboard_v3[uid].score).toBe(36);
  });
});
