// Web worker that tracks passive gub income. The old implementation sent
// fractional gub amounts every second which, when rounded for syncing, could
// lead to drift and visible flicker in the counter. We now accumulate time at a
// higher resolution and only post whole gubs back to the main thread. Any
// fractional remainder is kept locally so that over longer periods the total
// earned matches the configured rate exactly.

let rate = 0; // gubs per second
let last = performance.now();
let buffer = 0; // fractional gubs waiting to be sent

self.onmessage = (e) => {
  const data = e.data || {};
  if (data.type === "rate") {
    rate = data.value || 0;
  } else if (data.type === "reset") {
    last = performance.now();
    buffer = 0;
  }
};

function tick() {
  const now = performance.now();
  const deltaSec = (now - last) / 1000;
  last = now;
  if (rate > 0 && deltaSec > 0) {
    buffer += rate * deltaSec;
    const whole = Math.floor(buffer);
    if (whole > 0) {
      buffer -= whole;
      self.postMessage({ earned: whole });
    }
  }
  // Run more frequently to smooth out timing jitter.
  setTimeout(tick, 250);
}

tick();
