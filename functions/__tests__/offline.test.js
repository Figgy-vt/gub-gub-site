/* eslint-env jest */
const { calculateOfflineGubs } = require('../offline');

describe('calculateOfflineGubs', () => {
  test('awards 25% of rate per second of elapsed time', () => {
    const rate = 100; // gubs per second
    const lastUpdated = 0;
    const now = 4000; // 4 seconds later
    expect(calculateOfflineGubs(rate, lastUpdated, now)).toBe(100);
  });

  test('returns 0 when elapsed time is negative', () => {
    const rate = 50;
    const lastUpdated = 10000;
    const now = 5000; // time went backwards
    expect(calculateOfflineGubs(rate, lastUpdated, now)).toBe(0);
  });
});
