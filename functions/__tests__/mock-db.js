import { jest } from '@jest/globals';

export let rootState;

export function getVal(path = '') {
  const parts = path.split('/').filter(Boolean);
  let val = rootState;
  for (const p of parts) {
    val = val && val[p];
  }
  return val;
}

export function setVal(path = '', value) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) {
    rootState = value;
    return;
  }
  let obj = rootState;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof obj[p] !== 'object' || obj[p] === null) {
      obj[p] = {};
    }
    obj = obj[p];
  }
  obj[parts[parts.length - 1]] = value;
}

export const mockDb = {
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
    once: async () => ({
      val: () => {
        const v = getVal(path);
        if (v === undefined) {
          const parentPath = path.split('/').slice(0, -1).join('/');
          const parentVal = getVal(parentPath);
          if (typeof parentVal === 'number') return parentVal;
        }
        return v;
      },
    }),
    push: () => ({ set: async () => {} }),
    remove: async () => {
      setVal(path, undefined);
    },
    update: async (updates) => {
      Object.entries(updates).forEach(([p, v]) => setVal(p, v));
    },
  })),
};
