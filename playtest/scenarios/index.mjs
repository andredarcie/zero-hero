import smoke from './smoke.mjs';
import explore from './explore.mjs';
import dialog from './dialog.mjs';
import shop from './shop.mjs';
import audio from './audio.mjs';
import swordGet from './sword-get.mjs';
import textLegibility from './text-legibility.mjs';

export const scenarios = {
  smoke,
  explore,
  dialog,
  shop,
  audio,
  'sword-get': swordGet,
  'text-legibility': textLegibility,
};

// What `npm run playtest` runs when no scenario is named.
export const DEFAULT_SEQUENCE = ['smoke', 'explore', 'dialog', 'shop'];
