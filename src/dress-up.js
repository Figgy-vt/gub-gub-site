const character = document.getElementById('character');

function makeDraggable(el) {
  el.addEventListener('mousedown', (e) => {
    const rect = el.getBoundingClientRect();
    const shiftX = e.clientX - rect.left;
    const shiftY = e.clientY - rect.top;

    if (el.parentElement !== character) {
      character.appendChild(el);
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
  const base = document.getElementById('base');
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0);
  document.querySelectorAll('#character img:not(#base)').forEach((img) => {
    const x = parseFloat(img.style.left) || 0;
    const y = parseFloat(img.style.top) || 0;
    ctx.drawImage(img, x, y);
  });
  const link = document.createElement('a');
  link.download = 'gub-dress-up.png';
  link.href = canvas.toDataURL();
  link.click();
});
