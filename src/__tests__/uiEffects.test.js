/**
 * @jest-environment jsdom
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { initUIEffects } from '../uiEffects.js';

describe('uiEffects settings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <button id="spdDec"></button>
      <button id="spdInc"></button>
      <button id="imgDec"></button>
      <button id="imgInc"></button>
      <span id="spdVal"></span>
      <span id="imgVal"></span>
      <button id="moveToggle"></button>
      <button id="qualityBtn"></button>
      <button id="comicBtn"></button>
      <button id="lowPerfBtn"></button>
      <div id="perfMenu"></div>
      <button id="chaosBtn"></button>
      <button id="twitchBtn"></button>
      <div id="twitchPlayer"></div>
    `;
    const Embed = function () {
      return { addEventListener: () => {}, getPlayer: () => ({ setMuted: () => {} }) };
    };
    Embed.VIDEO_READY = 'ready';
    global.Twitch = { Embed };
  });

  test('adjusting speed and image count saves to localStorage', () => {
    const audio = {
      state: { flashing: false, musicPlaying: false },
      chaosAudio: { play: jest.fn(), pause: jest.fn() },
      audioCtx: { state: 'suspended', resume: jest.fn() },
    };
    const imageState = {};
    initUIEffects({ numFloaters: 0, audio, imageState });
    document.getElementById('spdInc').click();
    expect(localStorage.getItem('gubSpeed')).toBe('3');
    expect(document.getElementById('spdVal').textContent).toBe('3');
    document.getElementById('imgInc').click();
    expect(localStorage.getItem('gubImages')).toBe('2');
    expect(document.getElementById('imgVal').textContent).toBe('2');
  });
});

