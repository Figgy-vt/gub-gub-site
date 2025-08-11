export function initChaosMode({ audio, floaters, updateLabels }) {
  const chaosBtn = document.getElementById('chaosBtn');

  function toggleChaos() {
    audio.state.flashing = !audio.state.flashing;

    floaters.forEach((f) => {
      const dur = (0.3 + Math.random() * 0.7).toFixed(2);
      const dir = Math.random() > 0.5 ? 'alternate' : 'alternate-reverse';
      const ease = Math.random() > 0.5 ? 'ease-in' : 'ease-out';
      if (audio.state.flashing) {
        if (f.elem.classList.contains('rainbow-text')) {
          f.elem.style.animation = `rainbow 5s linear infinite, spinmove ${dur}s infinite ${dir} ${ease}`;
        } else {
          f.elem.style.animation = `spinmove ${dur}s infinite ${dir} ${ease}`;
        }
      } else {
        f.elem.style.animation = '';
      }
    });

    if (audio.state.flashing) {
      document.body.style.animation = 'flash 0.1s infinite alternate';
      if (audio.audioCtx.state === 'suspended') audio.audioCtx.resume();
      if (!audio.state.musicPlaying) {
        audio.chaosAudio.play().catch(() => {});
        audio.state.musicPlaying = true;
      }
    } else {
      document.body.style.animation = 'none';
      audio.chaosAudio.pause();
      audio.state.musicPlaying = false;
    }

    updateLabels && updateLabels();
  }

  chaosBtn.addEventListener('click', toggleChaos);

  const styleEl = document.createElement('style');
  styleEl.textContent = `@keyframes flash{0%{background:#111}25%{background:#ff0}50%{background:#0ff}75%{background:#f0f}100%{background:#111}}@keyframes spinmove{0%{transform:scale(1) rotate(0deg)}50%{transform:scale(1.2) rotate(180deg)}100%{transform:scale(1) rotate(360deg)}}`;
  document.head.appendChild(styleEl);

  return { toggleChaos };
}

