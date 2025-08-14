import shopConfig from './shared/shop-config.js';

export const DEFAULT_COST_MULTIPLIER = shopConfig.costMultiplier;
export const SHOP_ITEMS = Object.fromEntries(
  shopConfig.items.map((item) => [item.id, item.baseCost]),
);
export const RATES = Object.fromEntries(
  shopConfig.items.map((item) => [item.id, item.rate]),
);
export const COST_MULTIPLIERS = Object.fromEntries(
  shopConfig.items.map((item) => [
    item.id,
    item.costMultiplier || DEFAULT_COST_MULTIPLIER,
  ]),
);
