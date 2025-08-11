/**
 * @jest-environment jsdom
 */
import { describe, test, expect } from '@jest/globals';
import { initPresenceAndLeaderboard } from '../presence.js';

class FakeRef {
  constructor() {
    this.handlers = {};
  }
  on(event, cb) {
    this.handlers[event] = cb;
  }
  set() {}
  onDisconnect() {
    return { remove: () => {} };
  }
  once() {
    return Promise.resolve({ val: () => null, forEach: () => {} });
  }
  trigger(event, snap) {
    this.handlers[event]?.(snap);
  }
}

describe('presence list rendering', () => {
  test('updates online user list on child events', () => {
    document.body.innerHTML = '<div id="online-users"></div>';
    const refs = {};
    const db = {
      ref: (path) => {
        refs[path] ??= new FakeRef();
        return refs[path];
      },
    };
    const allUsers = new Set();
    initPresenceAndLeaderboard({
      db,
      uid: 'u0',
      username: 'self',
      sanitizeUsername: (u) => u,
      allUsers,
      CLIENT_VERSION: '1',
    });
    const presenceRef = refs['presence'];
    presenceRef.trigger('child_added', {
      key: 'a',
      val: () => 'Alice',
    });
    presenceRef.trigger('child_added', {
      key: 'b',
      val: () => 'Bob',
    });
    expect(document.getElementById('online-users').textContent).toBe(
      'Online (2): Alice, Bob',
    );
    expect(allUsers.has('Alice')).toBe(true);
    presenceRef.trigger('child_removed', { key: 'a' });
    expect(document.getElementById('online-users').textContent).toBe(
      'Online (1): Bob',
    );
  });

  test('limits displayed users and shows more count', () => {
    document.body.innerHTML = '<div id="online-users"></div>';
    const refs = {};
    const db = {
      ref: (path) => {
        refs[path] ??= new FakeRef();
        return refs[path];
      },
    };
    initPresenceAndLeaderboard({
      db,
      uid: 'u0',
      username: 'self',
      sanitizeUsername: (u) => u,
      allUsers: new Set(),
      CLIENT_VERSION: '1',
    });
    const presenceRef = refs['presence'];
    for (let i = 0; i < 22; i++) {
      presenceRef.trigger('child_added', {
        key: 'u' + i,
        val: () => 'User' + i,
      });
    }
    const text = document.getElementById('online-users').textContent;
    expect(text.startsWith('Online (22):')).toBe(true);
    expect(text.includes('(+2 more)')).toBe(true);
  });
});

