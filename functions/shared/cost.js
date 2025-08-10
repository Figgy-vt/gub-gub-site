export function currentCost(baseCost, owned, multiplier) {
  return Math.floor(baseCost * Math.pow(multiplier, owned));
}

export function totalCost(baseCost, owned, quantity, multiplier) {
  let cost = 0;
  for (let i = 0; i < quantity; i++) {
    cost += currentCost(baseCost, owned + i, multiplier);
  }
  return cost;
}

export function maxAffordable(baseCost, owned, available, multiplier) {
  let qty = 0;
  let accumulated = 0;
  while (true) {
    const next = currentCost(baseCost, owned + qty, multiplier);
    if (accumulated + next > available) break;
    accumulated += next;
    qty++;
  }
  return qty;
}

export default { currentCost, totalCost, maxAffordable };
