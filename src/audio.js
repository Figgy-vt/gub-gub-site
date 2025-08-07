export function initAudio() {
  const chaosAudio = new Audio("music.mp3");
  chaosAudio.loop = true;
  const stored = parseFloat(localStorage.getItem("gubVolume"));
  chaosAudio.volume = isNaN(stored) ? 0.5 : stored;

  const volumeSlider = document.getElementById("volumeSlider");
  volumeSlider.value = chaosAudio.volume;
  volumeSlider.addEventListener("input", () => {
    chaosAudio.volume = volumeSlider.value;
    localStorage.setItem("gubVolume", volumeSlider.value);
  });

  const state = { flashing: false, musicPlaying: false };

  const canvas = document.getElementById("visualizer");
  const ctx = canvas.getContext("2d");
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = 100;
  }
  window.addEventListener("resize", resize);
  resize();

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioCtx.createAnalyser();
  const sourceNode = audioCtx.createMediaElementSource(chaosAudio);
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);
  analyser.fftSize = 256;

  ["touchstart", "click", "keydown"].forEach((ev) => {
    window.addEventListener(
      ev,
      () => {
        if (audioCtx.state === "suspended") audioCtx.resume();
      },
      { once: true },
    );
  });

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function drawVis() {
    requestAnimationFrame(drawVis);
    analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = canvas.width / bufferLength;
    for (let i = 0; i < bufferLength; i++) {
      const h = dataArray[i];
      ctx.fillStyle = `hsl(${i * 3},100%,50%)`;
      ctx.fillRect(i * barWidth, canvas.height - h, barWidth - 1, h);
    }
  }
  drawVis();

  function playMentionSound() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtx.currentTime + 0.2,
    );
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  }

  return { chaosAudio, audioCtx, playMentionSound, state };
}
