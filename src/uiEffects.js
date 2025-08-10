export function initUIEffects({ numFloaters: initialFloaters, audio, imageState }) {
  const highImages = [
    'floater1.jpg',
    'floater2.jpg',
    'floater3.jpg',
    'floater4.png',
    'floater5.jpg',
    'floater6.jpg',
    'floater7.jpg',
    'floater8.jpg',
    'floater9.jpg',
    'floater10.jpg',
    'floater11.jpg',
    'floater12.jpg',
    'floater13.jpg',
    'floater14.jpg',
    'floater15.jpg',
    'floater16.jpg',
    'floater17.png',
    'floater18.jpg',
  ];
  const lowImages = [
    'low_floater1.jpg',
    'low_floater2.jpg',
    'low_floater3.jpg',
    'floater4.png',
    'low_floater5.jpg',
    'low_floater6.jpg',
    'low_floater7.jpg',
    'low_floater8.jpg',
    'low_floater9.jpg',
    'low_floater10.jpg',
    'low_floater11.jpg',
    'low_floater12.jpg',
    'low_floater13.jpg',
    'low_floater14.jpg',
    'low_floater15.jpg',
    'low_floater16.jpg',
    'low_floater17.jpg',
    'low_floater18.jpg',
  ];
  let useHighQuality = localStorage.getItem('gubHighQuality') === 'true';
  let useComicSans = localStorage.getItem('gubComicSans') === 'true';
  if (useComicSans) {
    document.body.classList.add('comic-sans');
  }
  imageState.images = useHighQuality ? highImages : lowImages;
  let images = imageState.images;
  const texts = [
    'bark',
    'barke',
    'gubbling',
    'good boye',
    'sniffa',
    'shidded',
    'gubb',
    'gubbing',
    "i'm gonna gub",
    'he do be gubbin',
    'were my salami go',
    'Gub Gubtaro Pissboy420 Bong or Die',
    'bork',
    'aaaAAa',
    'im gubbing it im gubbing it',
    'bug',
    'lil gublets',
    'FUCKYOU BAILEY',
    'ish true ish true',
    'gub needs the funny 3 numbers on the back of ur credit card',
  ];
  let speedMultiplier = 2,
    numFloaters = initialFloaters;
  let movementPaused = false;
  const floaters = [];

  const savedSpeedStr = localStorage.getItem('gubSpeed');
  const savedImagesStr = localStorage.getItem('gubImages');

  if (savedSpeedStr !== null) {
    const parsedSpeed = parseInt(savedSpeedStr, 10);
    if (!Number.isNaN(parsedSpeed)) {
      speedMultiplier = parsedSpeed;
    }
  }

  if (savedImagesStr !== null) {
    const parsedImages = parseInt(savedImagesStr, 10);
    if (!Number.isNaN(parsedImages)) {
      numFloaters = parsedImages;
    }
  }

  movementPaused = localStorage.getItem('gubPaused') === 'true';
  let storedSpeed = speedMultiplier;
  if (movementPaused) {
    speedMultiplier = 0;
  }
  function createEntity(isText = false) {
    const elem = document.createElement('div');
    const size = 80 + Math.random() * 320;
    elem.style.width = elem.style.height = size + 'px';
    elem.style.left = Math.random() * (window.innerWidth - size) + 'px';
    elem.style.top = Math.random() * (window.innerHeight - size) + 'px';
    let imgIdx = null;
    if (isText) {
      elem.className = 'rainbow-text';
      elem.textContent = texts[Math.floor(Math.random() * texts.length)];
    } else {
      elem.className = 'floater';
      const img = document.createElement('img');
      imgIdx = Math.floor(Math.random() * images.length);
      img.src = images[imgIdx];
      elem.appendChild(img);
    }
    document.body.appendChild(elem);
    floaters.push({
      elem,
      x: parseFloat(elem.style.left),
      y: parseFloat(elem.style.top),
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      width: size,
      height: size,
      isText,
      imgIdx,
    });
  }
  function removeEntity() {
    const f = floaters.pop();
    if (f) f.elem.remove();
  }
  function animate() {
    floaters.forEach((f) => {
      f.x += f.vx * speedMultiplier;
      f.y += f.vy * speedMultiplier;
      if (f.x <= 0 || f.x + f.width >= window.innerWidth) f.vx *= -1;
      if (f.y <= 0 || f.y + f.height >= window.innerHeight) f.vy *= -1;
      f.elem.style.left = f.x + 'px';
      f.elem.style.top = f.y + 'px';
    });
    requestAnimationFrame(animate);
  }
  for (let i = 0; i < numFloaters; i++) {
    createEntity(false);
    createEntity(true);
  }
  animate();
  // Controls
  const settingsBtn = document.getElementById('lowPerfBtn');
  const perfMenu = document.getElementById('perfMenu');
  const spdDec = document.getElementById('spdDec');
  const spdInc = document.getElementById('spdInc');
  const imgDec = document.getElementById('imgDec');
  const imgInc = document.getElementById('imgInc');
  const spdVal = document.getElementById('spdVal');
  const imgVal = document.getElementById('imgVal');
  const moveToggle = document.getElementById('moveToggle');
  const qualityBtn = document.getElementById('qualityBtn');
  const comicBtn = document.getElementById('comicBtn');
  qualityBtn.textContent = useHighQuality
    ? 'High Quality: On'
    : 'High Quality: Off';
  comicBtn.textContent = useComicSans ? 'Comic Sans: On' : 'Comic Sans: Off';
  qualityBtn.onclick = () => {
    useHighQuality = !useHighQuality;
    localStorage.setItem('gubHighQuality', useHighQuality);
    imageState.images = images = useHighQuality ? highImages : lowImages;
    qualityBtn.textContent = useHighQuality
      ? 'High Quality: On'
      : 'High Quality: Off';
    floaters.forEach((f) => {
      if (!f.isText && f.imgIdx !== null) {
        const img = f.elem.querySelector('img');
        img.src = images[f.imgIdx];
      }
    });
  };
  comicBtn.onclick = () => {
    useComicSans = !useComicSans;
    document.body.classList.toggle('comic-sans', useComicSans);
    comicBtn.textContent = useComicSans
      ? 'Comic Sans: On'
      : 'Comic Sans: Off';
    localStorage.setItem('gubComicSans', useComicSans);
  };

  settingsBtn.onclick = () => {
    perfMenu.style.display =
      perfMenu.style.display === 'block' ? 'none' : 'block';
  };
  function updateLabels() {
    spdVal.textContent = speedMultiplier;
    imgVal.textContent = numFloaters;
  }
  function adjustSpeed(d) {
    if (movementPaused) {
      storedSpeed = Math.max(1, storedSpeed + d);
      localStorage.setItem('gubSpeed', storedSpeed);
    } else {
      speedMultiplier = Math.max(1, speedMultiplier + d);
      localStorage.setItem('gubSpeed', speedMultiplier);
    }
    updateLabels();
  }
  function adjustImages(d) {
    const newVal = Math.max(0, numFloaters + d);
    if (newVal !== numFloaters) {
      if (d > 0)
        for (let i = 0; i < d; i++) {
          createEntity(false);
          createEntity(true);
        }
      else
        for (let i = 0; i < -d; i++) {
          removeEntity();
          removeEntity();
        }
      numFloaters = newVal;
      localStorage.setItem('gubImages', numFloaters);
      updateLabels();
    }
  }
  spdDec.onclick = () => adjustSpeed(-1);
  spdInc.onclick = () => adjustSpeed(1);
  imgDec.onclick = () => adjustImages(-2);
  imgInc.onclick = () => adjustImages(2);
  moveToggle.onclick = () => {
    if (!movementPaused) {
      storedSpeed = speedMultiplier;
      speedMultiplier = 0;
      moveToggle.textContent = 'Resume Movement';
    } else {
      speedMultiplier = storedSpeed;
      moveToggle.textContent = 'Pause Movement';
    }
    movementPaused = !movementPaused;
    localStorage.setItem('gubPaused', movementPaused);
    localStorage.setItem('gubSpeed', storedSpeed);
    updateLabels();
  };

  if (movementPaused) {
    moveToggle.textContent = 'Resume Movement';
  }
  updateLabels();

  // Twitch & Chaos Mode
  const chaosBtn = document.getElementById('chaosBtn');
  const twitchBtn = document.getElementById('twitchBtn');
  const twitchBox = document.getElementById('twitchPlayer');
  twitchBox.style.display = 'block';
  twitchBox.style.visibility = 'hidden';
  const twitchEmbed = new Twitch.Embed('twitchPlayer', {
    width: '100%',
    height: '100%',
    channel: 'harupi',
    layout: 'video',
    parent: [location.hostname],
    autoplay: false,
    muted: true,
  });
  let twitchPlayer;
  twitchEmbed.addEventListener(Twitch.Embed.VIDEO_READY, () => {
    twitchPlayer = twitchEmbed.getPlayer();
    twitchPlayer.setMuted(true);
  });
  let twitchShown = false;

  twitchBtn.onclick = () => {
    if (!twitchShown) {
      twitchBox.style.visibility = 'visible';
      twitchPlayer && twitchPlayer.play();
      twitchBtn.textContent = 'Hide Stream';
    } else {
      twitchPlayer && twitchPlayer.pause();
      twitchBox.style.visibility = 'hidden';
      twitchBtn.textContent = 'Show Stream';
    }
    twitchShown = !twitchShown;
  };

  chaosBtn.addEventListener('click', () => {
    audio.state.flashing = !audio.state.flashing;

    floaters.forEach((f) => {
      const dur = (0.3 + Math.random() * 0.7).toFixed(2);
      const dir = Math.random() > 0.5 ? 'alternate' : 'alternate-reverse';
      const ease = Math.random() > 0.5 ? 'ease-in' : 'ease-out';
      if (audio.state.flashing) {
        // turn ON chaos: add animations
        if (f.elem.classList.contains('rainbow-text')) {
          f.elem.style.animation = `rainbow 5s linear infinite, spinmove ${dur}s infinite ${dir} ${ease}`;
        } else {
          f.elem.style.animation = `spinmove ${dur}s infinite ${dir} ${ease}`;
        }
      } else {
        // turn OFF chaos: remove any animation
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
    updateLabels();
  });

  const styleEl = document.createElement('style');
  styleEl.textContent = `@keyframes flash{0%{background:#111}25%{background:#ff0}50%{background:#0ff}75%{background:#f0f}100%{background:#111}}@keyframes spinmove{0%{transform:scale(1) rotate(0deg)}50%{transform:scale(1.2) rotate(180deg)}100%{transform:scale(1) rotate(360deg)}}`;
  document.head.appendChild(styleEl);
}

