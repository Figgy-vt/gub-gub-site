/**
 * @jest-environment jsdom
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { initTwitchEmbed } from '../twitchEmbed.js';

describe('twitch embed position persistence', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="twitchBtn"></button>
      <div id="twitchPlayer"></div>
    `;
    const Embed = function () {
      return {
        addEventListener: () => {},
        getPlayer: () => ({ setMuted: () => {} }),
      };
    };
    Embed.VIDEO_READY = 'ready';
    global.Twitch = { Embed };
    localStorage.clear();
  });

  test('restores saved position', () => {
    localStorage.setItem('twitchPlayerTop', '50px');
    localStorage.setItem('twitchPlayerLeft', '100px');
    initTwitchEmbed();
    const box = document.getElementById('twitchPlayer');
    expect(box.style.top).toBe('50px');
    expect(box.style.left).toBe('100px');
  });
});
