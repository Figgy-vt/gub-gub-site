import { initFloaters } from './floaters.js';
import { loadSettings, initSettingsMenu } from './settingsMenu.js';
import { initTwitchEmbed } from './twitchEmbed.js';
import { initChaosMode } from './chaosMode.js';

export function initUIEffects({ numFloaters: initialFloaters, audio, imageState }) {
  const config = loadSettings({ initialFloaters, imageState });

  const floaterManager = initFloaters({
    numFloaters: config.numFloaters,
    images: imageState.images,
    speedMultiplier: config.movementPaused ? 0 : config.speedMultiplier,
    storedSpeed: config.speedMultiplier,
    movementPaused: config.movementPaused,
  });

  const { updateLabels } = initSettingsMenu({
    config,
    floaterManager,
    imageState,
  });

  initTwitchEmbed();
  initChaosMode({ audio, floaters: floaterManager.floaters, updateLabels });
}

