/* eslint-env jest */
import { totalCost, maxAffordable } from './cost.js';

function totalCostLoop(baseCost, owned, quantity, multiplier) {
  let cost = 0;
  for (let i = 0; i < quantity; i++) {
    cost += baseCost * Math.pow(multiplier, owned + i);
  }
  return Math.floor(cost);
}

test('totalCost uses geometric series for high quantities', () => {
  const baseCost = 20;
  const owned = 0;
  const multiplier = 1.01;
  const quantity = 1000; // high quantity to ensure formula is used
  const expected = totalCostLoop(baseCost, owned, quantity, multiplier);
  expect(totalCost(baseCost, owned, quantity, multiplier)).toBe(expected);
});

test('maxAffordable computes correct quantity for large budgets', () => {
  const baseCost = 20;
  const owned = 0;
  const multiplier = 1.01;
  const quantity = 1000;
  const available = totalCost(baseCost, owned, quantity, multiplier);
  expect(maxAffordable(baseCost, owned, available, multiplier)).toBe(quantity);
});
