let rate = 0;
let last = Date.now();

self.onmessage = (e) => {
  const data = e.data || {};
  if (data.type === "rate") {
    rate = data.value || 0;
  } else if (data.type === "reset") {
    last = Date.now();
  }
};

setInterval(() => {
  const now = Date.now();
  const deltaSec = (now - last) / 1000;
  last = now;
  if (rate > 0 && deltaSec > 0) {
    self.postMessage({ earned: rate * deltaSec });
  }
}, 1000);
