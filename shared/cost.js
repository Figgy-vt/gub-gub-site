export function currentCost(baseCost, multiplier, owned) {
  return Math.floor(baseCost * Math.pow(multiplier, owned));
}

export function totalCost(baseCost, multiplier, owned, quantity) {
  let cost = 0;
  for (let i = 0; i < quantity; i++) {
    cost += currentCost(baseCost, multiplier, owned + i);
  }
  return cost;
}

export function maxAffordable(baseCost, multiplier, owned, available) {
  let qty = 0;
  let accumulated = 0;
  while (true) {
    const next = currentCost(baseCost, multiplier, owned + qty);
    if (accumulated + next > available) break;
    accumulated += next;
    qty++;
  }
  return qty;
}
