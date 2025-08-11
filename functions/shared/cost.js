export function currentCost(baseCost, owned, multiplier) {
  return Math.floor(baseCost * Math.pow(multiplier, owned));
}

export function totalCost(baseCost, owned, quantity, multiplier) {
  if (quantity <= 0) return 0;
  const startCost = baseCost * Math.pow(multiplier, owned);
  if (multiplier === 1) {
    return Math.floor(startCost * quantity);
  }
  const total =
    (startCost * (Math.pow(multiplier, quantity) - 1)) / (multiplier - 1);
  return Math.floor(total);
}

export function maxAffordable(baseCost, owned, available, multiplier) {
  const startCost = baseCost * Math.pow(multiplier, owned);
  if (startCost > available) return 0;
  if (multiplier === 1) {
    return Math.floor(available / startCost);
  }
  const qty =
    Math.log(((available + 1) * (multiplier - 1)) / startCost + 1) /
    Math.log(multiplier);
  return Math.floor(qty);
}

export default { currentCost, totalCost, maxAffordable };
