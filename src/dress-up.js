const character = document.getElementById('character');

function makeDraggable(el) {
  el.addEventListener('mousedown', (e) => {
    const shiftX = e.clientX - el.getBoundingClientRect().left;
    const shiftY = e.clientY - el.getBoundingClientRect().top;

    function moveAt(clientX, clientY) {
      const rect = character.getBoundingClientRect();
      el.style.left = `${clientX - rect.left - shiftX}px`;
      el.style.top = `${clientY - rect.top - shiftY}px`;
    }

    function onMouseMove(event) {
      moveAt(event.clientX, event.clientY);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener(
      'mouseup',
      () => {
        document.removeEventListener('mousemove', onMouseMove);
      },
      { once: true }
    );
  });
}

document.querySelectorAll('#assets img').forEach((asset) => {
  asset.addEventListener('dragstart', (e) => {
    if (asset.dataset.used === 'true') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', asset.src);
    e.dataTransfer.setDragImage(asset, asset.width / 2, asset.height / 2);
  });
});

character.addEventListener('dragover', (e) => {
  e.preventDefault();
});

character.addEventListener('drop', (e) => {
  e.preventDefault();
  const src = e.dataTransfer.getData('text/plain');
  if (!src) return;
  if (character.querySelector(`img.layer[src="${src}"]`)) return;

  const img = document.createElement('img');
  img.src = src;
  img.className = 'layer';
  img.draggable = false;

  const rect = character.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  img.addEventListener('load', () => {
    img.style.left = `${x - img.width / 2}px`;
    img.style.top = `${y - img.height / 2}px`;
  });

  makeDraggable(img);
  character.appendChild(img);

  const asset = document.querySelector(`#assets img[src="${src}"]`);
  if (asset) {
    asset.dataset.used = 'true';
    asset.style.opacity = '0.5';
    asset.draggable = false;
  }
});

document.getElementById('download').addEventListener('click', () => {
  const base = document.getElementById('base');
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0);
  document.querySelectorAll('#character .layer').forEach((img) => {
    const x = parseFloat(img.style.left) || 0;
    const y = parseFloat(img.style.top) || 0;
    ctx.drawImage(img, x, y);
  });
  const link = document.createElement('a');
  link.download = 'gub-dress-up.png';
  link.href = canvas.toDataURL();
  link.click();
});

