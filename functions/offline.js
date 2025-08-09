const OFFLINE_RATE = 0.25; // earn 25% of passive rate while offline

function calculateOfflineGubs(rate, lastUpdated, now = Date.now()) {
  const elapsed = Math.max(0, now - lastUpdated); // milliseconds
  const earned = rate * OFFLINE_RATE * (elapsed / 1000); // 25% of rate per second
  return Math.floor(earned);
}

module.exports = { calculateOfflineGubs };
