const character = document.getElementById('character');
const base = document.getElementById('base');

function makeDraggable(el) {
  el.addEventListener('mousedown', (e) => {
    const rect = el.getBoundingClientRect();
    const shiftX = e.clientX - rect.left;
    const shiftY = e.clientY - rect.top;

    if (el.parentElement !== character) {
      character.appendChild(el);
      const scale = base.width / base.naturalWidth;
      el.style.width = `${el.naturalWidth * scale}px`;
      el.style.height = `${el.naturalHeight * scale}px`;
      const characterRect = character.getBoundingClientRect();
      el.style.left = `${rect.left - characterRect.left}px`;
      el.style.top = `${rect.top - characterRect.top}px`;
    }

    function moveAt(clientX, clientY) {
      const characterRect = character.getBoundingClientRect();
      el.style.left = `${clientX - characterRect.left - shiftX}px`;
      el.style.top = `${clientY - characterRect.top - shiftY}px`;
    }

    moveAt(e.clientX, e.clientY);

    function onMouseMove(event) {
      moveAt(event.clientX, event.clientY);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener(
      'mouseup',
      () => {
        document.removeEventListener('mousemove', onMouseMove);
      },
      { once: true },
    );
  });
}
document.querySelectorAll('#assets img').forEach((asset) => {
  asset.draggable = false;
  makeDraggable(asset);
});

document.getElementById('download').addEventListener('click', () => {
  const canvas = document.createElement('canvas');

  const containerWidth = base.clientWidth;
  const containerHeight = base.clientHeight;
  const naturalWidth = base.naturalWidth;
  const naturalHeight = base.naturalHeight;
  const containerAspect = containerWidth / containerHeight;
  const naturalAspect = naturalWidth / naturalHeight;

  let renderWidth = containerWidth;
  let renderHeight = containerHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (naturalAspect > containerAspect) {
    renderHeight = containerWidth / naturalAspect;
    offsetY = (containerHeight - renderHeight) / 2;
  } else {
    renderWidth = containerHeight * naturalAspect;
    offsetX = (containerWidth - renderWidth) / 2;
  }

  const scaleX = naturalWidth / renderWidth;
  const scaleY = naturalHeight / renderHeight;

  const positions = Array.from(document.querySelectorAll('#character img')).map(
    (img) => {
      if (img === base) {
        return {
          img,
          x: 0,
          y: 0,
          width: naturalWidth,
          height: naturalHeight,
        };
      }
      const x = (parseFloat(img.style.left) - offsetX) * scaleX;
      const y = (parseFloat(img.style.top) - offsetY) * scaleY;
      const width = parseFloat(img.style.width) * scaleX;
      const height = parseFloat(img.style.height) * scaleY;
      return { img, x, y, width, height };
    },
  );

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  positions.forEach(({ x, y, width, height }) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  canvas.width = maxX - minX;
  canvas.height = maxY - minY;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(base, -minX, -minY, naturalWidth, naturalHeight);
  positions
    .filter(({ img }) => img !== base)
    .forEach(({ img, x, y, width, height }) => {
      ctx.drawImage(img, x - minX, y - minY, width, height);
    });
  const link = document.createElement('a');
  link.download = 'gub-dress-up.png';
  link.href = canvas.toDataURL();
  link.click();
});
