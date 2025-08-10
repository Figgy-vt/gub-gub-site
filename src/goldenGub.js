export function initGoldenGubs({
  getImages,
  getGlobalCount,
  getGubRateMultiplier,
  setGubRateMultiplier,
  mainGub,
  renderCounter,
  gainGubs,
  abbreviateNumber,
  incrementSessionCount,
}) {
  let feralTimeout;

  function getGoldenGubReward() {
    return Math.max(10, Math.floor(getGlobalCount() * 0.03));
  }

  function activateFeralGubMode() {
    const duration = 30000 + Math.random() * 90000;
    setGubRateMultiplier(10);
    renderCounter();
    mainGub.classList.add('feral-glow');
    clearTimeout(feralTimeout);
    feralTimeout = setTimeout(() => {
      setGubRateMultiplier(1);
      mainGub.classList.remove('feral-glow');
      renderCounter();
    }, duration);
  }

  function spawnGolden() {
    const images = getImages();
    const el = document.createElement('img');
    el.src = images[Math.floor(Math.random() * images.length)];
    el.className = 'floater';
    const size = 80 + Math.random() * 320;
    el.style.width = el.style.height = size + 'px';
    el.style.left = `${Math.random() * (window.innerWidth - size)}px`;
    el.style.top = `${Math.random() * (window.innerHeight - size)}px`;
    el.style.zIndex = 10000;
    el.style.filter = 'sepia(1) hue-rotate(20deg) saturate(5) brightness(1.2)';
    el.style.border = '2px solid white';
    el.style.pointerEvents = 'auto';
    el.style.opacity = 0;
    el.style.transition = 'opacity 3s';
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = 1;
    });
    const timeout = setTimeout(() => {
      el.style.pointerEvents = 'none';
      el.style.opacity = 0;
      setTimeout(() => {
        el.remove();
        scheduleNextGolden();
      }, 3000);
    }, 60000);
    el.addEventListener('click', (e) => {
      clearTimeout(timeout);
      const reward = getGoldenGubReward();
      const actualReward = reward * getGubRateMultiplier();
      incrementSessionCount(actualReward);
      gainGubs(reward);

      const plusOne = document.createElement('div');
      plusOne.textContent = '+' + abbreviateNumber(actualReward);
      plusOne.className = 'plus-one';
      plusOne.style.left = `${e.clientX}px`;
      plusOne.style.top = `${e.clientY}px`;
      document.body.appendChild(plusOne);
      setTimeout(() => plusOne.remove(), 1000);

      el.remove();
      scheduleNextGolden();
    });
  }

  function spawnSpecialGub() {
    const images = getImages();
    const imgSrc = images[Math.floor(Math.random() * images.length)];
    const container = document.createElement('div');
    container.className = 'floater special-gub';
    const size = 80 + Math.random() * 320;
    container.style.width = size + 'px';
    container.style.height = size + 'px';
    container.style.left = `${Math.random() * (window.innerWidth - size)}px`;
    container.style.top = `${Math.random() * (window.innerHeight - size)}px`;

    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.filter = 'hue-rotate(30deg) saturate(3) brightness(1.3)';
    container.appendChild(img);

    const label = document.createElement('div');
    label.textContent = 'SPESHAL GUB';
    Object.assign(label.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      color: 'white',
      textShadow: '0 0 5px black',
      pointerEvents: 'none',
    });
    container.appendChild(label);

    container.style.opacity = 0;
    container.style.transition = 'opacity 3s';
    document.body.appendChild(container);
    requestAnimationFrame(() => {
      container.style.opacity = 1;
    });
    const timeout = setTimeout(() => {
      container.style.pointerEvents = 'none';
      container.style.opacity = 0;
      setTimeout(() => {
        container.remove();
        scheduleNextGolden();
      }, 3000);
    }, 60000);

    container.addEventListener('click', (e) => {
      clearTimeout(timeout);
      activateFeralGubMode();

      const plusOne = document.createElement('div');
      plusOne.textContent = 'FERAL GUB MODE!';
      plusOne.className = 'plus-one';
      plusOne.style.animationDuration = '2s';
      plusOne.style.left = `${e.clientX}px`;
      plusOne.style.top = `${e.clientY}px`;
      document.body.appendChild(plusOne);
      setTimeout(() => plusOne.remove(), 2000);

      container.remove();
      scheduleNextGolden();
    });
  }

  function scheduleNextGolden() {
    const min = 300000; // 5 minutes
    const max = 1500000; // 25 minutes
    setTimeout(() => {
      if (Math.random() < 0.05) spawnSpecialGub();
      else spawnGolden();
    }, min + Math.random() * (max - min));
  }

  return { scheduleNextGolden };
}
