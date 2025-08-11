export function loadSettings({ initialFloaters, imageState }) {
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

  let speedMultiplier = 2;
  let numFloaters = initialFloaters;
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

  const movementPaused = localStorage.getItem('gubPaused') === 'true';

  return {
    useHighQuality,
    useComicSans,
    speedMultiplier,
    numFloaters,
    movementPaused,
    highImages,
    lowImages,
  };
}

export function initSettingsMenu({ config, floaterManager, imageState }) {
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

  qualityBtn.textContent = config.useHighQuality
    ? 'High Quality: On'
    : 'High Quality: Off';
  comicBtn.textContent = config.useComicSans
    ? 'Comic Sans: On'
    : 'Comic Sans: Off';

  qualityBtn.onclick = () => {
    config.useHighQuality = !config.useHighQuality;
    localStorage.setItem('gubHighQuality', config.useHighQuality);
    imageState.images = config.useHighQuality
      ? config.highImages
      : config.lowImages;
    floaterManager.setImagesArray(imageState.images);
    qualityBtn.textContent = config.useHighQuality
      ? 'High Quality: On'
      : 'High Quality: Off';
  };

  comicBtn.onclick = () => {
    config.useComicSans = !config.useComicSans;
    document.body.classList.toggle('comic-sans', config.useComicSans);
    comicBtn.textContent = config.useComicSans
      ? 'Comic Sans: On'
      : 'Comic Sans: Off';
    localStorage.setItem('gubComicSans', config.useComicSans);
  };

  settingsBtn.onclick = () => {
    perfMenu.style.display =
      perfMenu.style.display === 'block' ? 'none' : 'block';
  };

  function updateLabels() {
    const { speedMultiplier, numFloaters } = floaterManager.getState();
    spdVal.textContent = speedMultiplier;
    imgVal.textContent = numFloaters;
  }

  function adjustSpeed(d) {
    const val = floaterManager.adjustSpeed(d);
    localStorage.setItem('gubSpeed', val);
    updateLabels();
  }

  function adjustImages(d) {
    const val = floaterManager.adjustImages(d);
    localStorage.setItem('gubImages', val);
    updateLabels();
  }

  spdDec.onclick = () => adjustSpeed(-1);
  spdInc.onclick = () => adjustSpeed(1);
  imgDec.onclick = () => adjustImages(-2);
  imgInc.onclick = () => adjustImages(2);

  moveToggle.onclick = () => {
    const { movementPaused, storedSpeed } = floaterManager.toggleMovement();
    config.movementPaused = movementPaused;
    moveToggle.textContent = movementPaused
      ? 'Resume Movement'
      : 'Pause Movement';
    localStorage.setItem('gubPaused', movementPaused);
    localStorage.setItem('gubSpeed', storedSpeed);
    updateLabels();
  };

  if (config.movementPaused) {
    moveToggle.textContent = 'Resume Movement';
  } else {
    moveToggle.textContent = 'Pause Movement';
  }

  updateLabels();

  return { updateLabels };
}

