export function initTwitchEmbed() {
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

