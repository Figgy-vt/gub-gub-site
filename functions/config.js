import shopConfig from '../shared/shop-config.js';

export const COST_MULTIPLIER = shopConfig.costMultiplier;
export const SHOP_ITEMS = Object.fromEntries(
  shopConfig.items.map((item) => [item.id, item.baseCost]),
);
export const RATES = Object.fromEntries(
  shopConfig.items.map((item) => [item.id, item.rate]),
);
