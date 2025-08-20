const layers = {
  hat: {
    options: [
      '../small_gub_01_gluburple.png',
      '../small_gub_02_Glurp.png',
      '../small_gub_03_Gorpa.png'
    ],
    index: 0,
    element: document.getElementById('hat')
  },
  tie: {
    options: [
      '../small_gub_04_GubsUp.png',
      '../small_gub_05_GubShy.png',
      '../small_gub_06_GubsComfy.png'
    ],
    index: 0,
    element: document.getElementById('tie')
  },
  shoes: {
    options: [
      '../small_gub_07_gubpoint.png',
      '../small_gub_08_gubmote1.png',
      '../small_gub_09_gubgub.png'
    ],
    index: 0,
    element: document.getElementById('shoes')
  },
  accessory: {
    options: [
      '../small_gub_10_gubfinger.png',
      '../small_gub_11_Grizz.png'
    ],
    index: 0,
    element: document.getElementById('accessory')
  }
};

function updateLayer(name) {
  const layer = layers[name];
  if (layer.options.length) {
    layer.element.src = layer.options[layer.index];
  }
}

Object.keys(layers).forEach(updateLayer);

document.querySelectorAll('.control').forEach((ctrl) => {
  const name = ctrl.dataset.layer;
  ctrl.querySelector('.prev').addEventListener('click', () => {
    const layer = layers[name];
    layer.index = (layer.index - 1 + layer.options.length) % layer.options.length;
    updateLayer(name);
  });
  ctrl.querySelector('.next').addEventListener('click', () => {
    const layer = layers[name];
    layer.index = (layer.index + 1) % layer.options.length;
    updateLayer(name);
  });
});

document.getElementById('download').addEventListener('click', () => {
  const base = document.getElementById('base');
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0);
  ['hat', 'tie', 'shoes', 'accessory'].forEach((id) => {
    const img = document.getElementById(id);
    if (img && img.src) {
      ctx.drawImage(img, 0, 0);
    }
  });
  const link = document.createElement('a');
  link.download = 'gub-dress-up.png';
  link.href = canvas.toDataURL();
  link.click();
});
