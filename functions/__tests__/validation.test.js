import { describe, test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('firebase-functions', () => ({
  https: {
    HttpsError: class extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    },
  },
}));

const {
  validateSyncGubs,
  validatePurchaseItem,
  validatePurchaseUpgrade,
  validateUsername,
  validateAdminUpdate,
  validateAdminDelete,
} = await import('../validation.js');

describe('validation utilities', () => {
  test('validateSyncGubs floors delta and parses offline flag', () => {
    expect(validateSyncGubs({ delta: 2.5, offline: 1 })).toEqual({
      delta: 2,
      requestOffline: true,
    });
    // Large deltas should be accepted as-is to allow high rate syncing
    expect(validateSyncGubs({ delta: 1e7 })).toEqual({
      delta: 1e7,
      requestOffline: false,
    });
  });

  test('validateSyncGubs rejects non-finite delta', () => {
    expect(() => validateSyncGubs({ delta: Infinity })).toThrow(
      'Invalid delta',
    );
  });

  test('validatePurchaseItem validates item and quantity', () => {
    expect(validatePurchaseItem({ item: 'passiveMaker', quantity: 2 })).toEqual({
      item: 'passiveMaker',
      quantity: 2,
      dryRun: false,
    });
    expect(
      validatePurchaseItem({ item: 'passiveMaker', dryRun: true }),
    ).toEqual({ item: 'passiveMaker', quantity: 1, dryRun: true });
    expect(() => validatePurchaseItem({ item: 'nope', quantity: 1 })).toThrow(
      'Unknown item',
    );
  });

  test('validatePurchaseUpgrade handles dryRun', () => {
    expect(validatePurchaseUpgrade({ upgrade: 'upg1' })).toEqual({
      upgrade: 'upg1',
      dryRun: false,
    });
    expect(
      validatePurchaseUpgrade({ upgrade: 'upg1', dryRun: true }),
    ).toEqual({ upgrade: 'upg1', dryRun: true });
    expect(() => validatePurchaseUpgrade({ upgrade: 'nope' })).toThrow(
      'Unknown upgrade',
    );
  });

  test('validateUsername and admin helpers', () => {
    expect(validateUsername('Good_User')).toBe('Good_User');
    expect(() => validateUsername('bad user')).toThrow('Invalid username');
    expect(validateAdminUpdate({ username: 'AdminUser', score: '5' })).toEqual({
      username: 'AdminUser',
      score: 5,
    });
    expect(() => validateAdminUpdate({ username: 'x', score: 1 })).toThrow(
      'Invalid username',
    );
    expect(validateAdminDelete({ username: 'DelUser' })).toEqual({
      username: 'DelUser',
    });
  });
});
