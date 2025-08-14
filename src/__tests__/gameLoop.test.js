/**
 * @jest-environment jsdom
 */
import { jest, test, expect } from '@jest/globals';

test('destroy clears timers and terminates worker', async () => {
  jest.useFakeTimers();
  jest.resetModules();

  await jest.unstable_mockModule('../chat.js', () => ({ initChat: jest.fn() }));
  await jest.unstable_mockModule('../goldenGub.js', () => ({
    initGoldenGubs: jest.fn(() => ({ scheduleNextGolden: jest.fn() })),
  }));
  await jest.unstable_mockModule('../presence.js', () => ({
    initPresenceAndLeaderboard: jest.fn(),
  }));
  await jest.unstable_mockModule('../shop.js', () => ({ initShop: jest.fn() }));

  const { initGameLoop } = await import('../gameLoop.js');

  document.body.innerHTML = `
    <div id="offlineModal"></div>
    <div id="offlineMessage"></div>
    <button id="offlineClose"></button>
    <div id="gubTotal"></div>
    <div id="main-gub"></div>
    <div id="clickMe"></div>
    <div id="leaderboard"></div>
  `;

  const terminate = jest.fn();
  global.Worker = jest.fn(() => ({ postMessage: jest.fn(), terminate }));

  const createRef = () => {
    const ref = {
      once: jest.fn(() => Promise.resolve({ exists: () => false, val: () => 0 })),
      on: jest.fn(),
      off: jest.fn(),
      orderByChild: jest.fn(() => ref),
      limitToLast: jest.fn(() => ref),
      parent: { remove: jest.fn() },
    };
    return ref;
  };
  const db = { ref: jest.fn(() => createRef()) };
  const functions = {
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: { score: 0 } }))),
  };
  const auth = { currentUser: { uid: 'uid' } };

  const destroy = initGameLoop({
    db,
    functions,
    auth,
    username: 'user',
    sanitizeUsername: (x) => x,
    playMentionSound: jest.fn(),
    CLIENT_VERSION: 'test',
    imageState: { images: [] },
  });

  await Promise.resolve();
  expect(jest.getTimerCount()).toBeGreaterThan(0);

  destroy();

  expect(terminate).toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);

  jest.useRealTimers();
  delete global.Worker;
});
