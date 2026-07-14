import smoke from './smoke.mjs';
import explore from './explore.mjs';
import dialog from './dialog.mjs';
import shop from './shop.mjs';
import audio from './audio.mjs';
import swordGet from './sword-get.mjs';
import textLegibility from './text-legibility.mjs';
import hd2dFx from './hd2d-fx.mjs';
import heroView from './hero-view.mjs';
import movementFeel from './movement-feel.mjs';
import perfBurn from './perf-burn.mjs';
import perfProfile from './perf-profile.mjs';
import visualRef from './visual-ref.mjs';
import aaTruth from './aa-truth.mjs';
import tour from './tour.mjs';
import uiTour from './ui-tour.mjs';
import survivorsTour from './survivors-tour.mjs';
import cemetery from './cemetery.mjs';
import labPuzzles from './lab-puzzles.mjs';
import labStone from './lab-stone.mjs';

export const scenarios = {
  smoke,
  explore,
  dialog,
  shop,
  audio,
  'sword-get': swordGet,
  'text-legibility': textLegibility,
  'hd2d-fx': hd2dFx,
  'hero-view': heroView,
  'movement-feel': movementFeel,
  'perf-burn': perfBurn,
  'perf-profile': perfProfile,
  'visual-ref': visualRef,
  'aa-truth': aaTruth,
  tour,
  'ui-tour': uiTour,
  'survivors-tour': survivorsTour,
  cemetery,
  'lab-puzzles': labPuzzles,
  'lab-stone': labStone,
};

// What `npm run playtest` runs when no scenario is named.
export const DEFAULT_SEQUENCE = ['smoke', 'explore', 'dialog', 'shop'];
