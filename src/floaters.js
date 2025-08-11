export function initFloaters({
  numFloaters,
  images,
  speedMultiplier = 2,
  storedSpeed = speedMultiplier,
  movementPaused = false,
}) {
  const floaters = [];
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

  let currentSpeed = speedMultiplier;
  let currentNum = numFloaters;
  let paused = movementPaused;
  let savedSpeed = storedSpeed;

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
      f.x += f.vx * currentSpeed;
      f.y += f.vy * currentSpeed;
      if (f.x <= 0 || f.x + f.width >= window.innerWidth) f.vx *= -1;
      if (f.y <= 0 || f.y + f.height >= window.innerHeight) f.vy *= -1;
      f.elem.style.left = f.x + 'px';
      f.elem.style.top = f.y + 'px';
    });
    requestAnimationFrame(animate);
  }

  for (let i = 0; i < currentNum; i++) {
    createEntity(false);
    createEntity(true);
  }
  animate();

  function adjustSpeed(d) {
    if (paused) {
      savedSpeed = Math.max(1, savedSpeed + d);
      return savedSpeed;
    }
    currentSpeed = Math.max(1, currentSpeed + d);
    return currentSpeed;
  }

  function adjustImages(d) {
    const newVal = Math.max(0, currentNum + d);
    if (newVal !== currentNum) {
      if (d > 0) {
        for (let i = 0; i < d; i++) {
          createEntity(false);
          createEntity(true);
        }
      } else {
        for (let i = 0; i < -d; i++) {
          removeEntity();
          removeEntity();
        }
      }
      currentNum = newVal;
    }
    return currentNum;
  }

  function toggleMovement() {
    if (!paused) {
      savedSpeed = currentSpeed;
      currentSpeed = 0;
    } else {
      currentSpeed = savedSpeed;
    }
    paused = !paused;
    return { movementPaused: paused, speedMultiplier: currentSpeed, storedSpeed: savedSpeed };
  }

  function setImagesArray(newImages) {
    images = newImages;
    floaters.forEach((f) => {
      if (!f.isText && f.imgIdx !== null) {
        const img = f.elem.querySelector('img');
        img.src = images[f.imgIdx];
      }
    });
  }

  function getState() {
    return { speedMultiplier: currentSpeed, numFloaters: currentNum, movementPaused: paused };
  }

  return {
    floaters,
    adjustSpeed,
    adjustImages,
    toggleMovement,
    setImagesArray,
    getState,
  };
}

