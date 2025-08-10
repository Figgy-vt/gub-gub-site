/* eslint-env jest */

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
          snapshot: { val: () => current },
        };
      }
      setVal(path, res);
      return {
        committed: true,
        snapshot: { val: () => getVal(path) },
      };
    },
    once: async () => ({ val: () => getVal(path) }),
    set: async (value) => setVal(path, value),
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

const { syncGubs } = require('../index');
const { MAX_DELTA } = require('../validation');

describe('syncGubs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('applies concurrent increments atomically', async () => {
    const uid = 'user1';
    rootState = { leaderboard_v3: { [uid]: { score: 0, lastUpdated: 0 } }, shop_v2: {} };
    await Promise.all([
      syncGubs({ delta: 1 }, { auth: { uid } }),
      syncGubs({ delta: 2 }, { auth: { uid } }),
    ]);
    expect(rootState.leaderboard_v3[uid].score).toBe(3);
  });

  test('clamps invalid deltas', async () => {
    const uid = 'user2';
    rootState = { leaderboard_v3: { [uid]: { score: 0, lastUpdated: 0 } }, shop_v2: {} };
    await syncGubs({ delta: Infinity }, { auth: { uid } });
    await syncGubs({ delta: MAX_DELTA * 2 }, { auth: { uid } });
    await syncGubs({ delta: -MAX_DELTA * 2 }, { auth: { uid } });
    expect(rootState.leaderboard_v3[uid].score).toBe(0);
  });
});

