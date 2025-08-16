export function initTwitchEmbed() {
  const twitchBtn = document.getElementById('twitchBtn');
  const twitchBox = document.getElementById('twitchPlayer');
  twitchBox.style.display = 'block';
  twitchBox.style.visibility = 'hidden';

  // restore saved position or default to top-right
  const savedTop = localStorage.getItem('twitchPlayerTop');
  const savedLeft = localStorage.getItem('twitchPlayerLeft');
  twitchBox.style.top = savedTop || '0px';
  twitchBox.style.left =
    savedLeft || `${window.innerWidth - twitchBox.offsetWidth - 10}px`;

  // make the player draggable and persist position
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragging = false;

  twitchBox.addEventListener('mousedown', (e) => {
    dragging = true;
    dragOffsetX = e.clientX - twitchBox.offsetLeft;
    dragOffsetY = e.clientY - twitchBox.offsetTop;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const left = e.clientX - dragOffsetX;
    const top = e.clientY - dragOffsetY;
    twitchBox.style.left = `${left}px`;
    twitchBox.style.top = `${top}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    localStorage.setItem('twitchPlayerLeft', twitchBox.style.left);
    localStorage.setItem('twitchPlayerTop', twitchBox.style.top);
  });

  const twitchEmbed = new Twitch.Embed('twitchPlayer', {
    width: '100%',
    height: '100%',
    channel: 'harupi',
    layout: 'video-with-chat',
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

  function toggle() {
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
  }

  twitchBtn.onclick = toggle;

  return { toggle };
}
