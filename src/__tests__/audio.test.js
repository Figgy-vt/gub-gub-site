/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

describe('initAudio', () => {
  let AudioBackup;
  let AudioContextBackup;
  let requestAnimationFrameBackup;

  beforeEach(() => {
    document.body.innerHTML = `
      <input id="volumeSlider" type="range">
      <canvas id="visualizer"></canvas>
    `;
    localStorage.clear();
    const canvas = document.getElementById('visualizer');
    canvas.getContext = () => ({
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      fillStyle: ''
    });

    class FakeAudio {
      constructor() { this.loop = false; this._volume = 1; }
      set volume(v) { this._volume = parseFloat(v); }
      get volume() { return this._volume; }
    }
    AudioBackup = global.Audio;
    global.Audio = FakeAudio;

    class FakeAnalyser {
      constructor() { this.fftSize = 0; this.frequencyBinCount = 32; }
      getByteFrequencyData() {}
      connect() {}
    }
    class FakeMediaSource { connect() {} }
    class FakeAudioContext {
      constructor() { this.state = 'suspended'; this.destination = {}; this.currentTime = 0; }
      createAnalyser() { return new FakeAnalyser(); }
      createMediaElementSource() { return new FakeMediaSource(); }
      createOscillator() { return { connect() {}, frequency: { value: 0 }, type: '', start() {}, stop() {} }; }
      createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
      resume() { this.state = 'running'; }
    }
    AudioContextBackup = global.AudioContext;
    global.AudioContext = FakeAudioContext;
    global.webkitAudioContext = FakeAudioContext;
    requestAnimationFrameBackup = global.requestAnimationFrame;
    global.requestAnimationFrame = () => {};
  });

  afterEach(() => {
    global.Audio = AudioBackup;
    global.AudioContext = AudioContextBackup;
    global.webkitAudioContext = AudioContextBackup;
    global.requestAnimationFrame = requestAnimationFrameBackup;
  });

  it('initializes volume from localStorage and updates on slider input', async () => {
    localStorage.setItem('gubVolume', '0.7');
    const { initAudio } = await import('../audio.js');
    const audio = initAudio();
    const slider = document.getElementById('volumeSlider');
    expect(audio.chaosAudio.volume).toBeCloseTo(0.7);
    slider.value = '0.3';
    slider.dispatchEvent(new Event('input'));
    expect(audio.chaosAudio.volume).toBeCloseTo(0.3);
    expect(localStorage.getItem('gubVolume')).toBe('0.3');
  });
});
