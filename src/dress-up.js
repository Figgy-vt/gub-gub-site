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
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const ctx = canvas.getContext('2d');
  const scaleX = base.naturalWidth / base.width;
  const scaleY = base.naturalHeight / base.height;
  ctx.drawImage(base, 0, 0, base.naturalWidth, base.naturalHeight);
  document.querySelectorAll('#character img:not(#base)').forEach((img) => {
    const x = (parseFloat(img.style.left) || 0) * scaleX;
    const y = (parseFloat(img.style.top) || 0) * scaleY;
    ctx.drawImage(img, x, y, img.naturalWidth, img.naturalHeight);
  });
  const link = document.createElement('a');
  link.download = 'gub-dress-up.png';
  link.href = canvas.toDataURL();
  link.click();
});
