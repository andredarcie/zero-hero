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
import gpuBudget from './_gpu-budget.mjs';
import sceneGraph from './_scene-graph.mjs';
import quadCensus from './_quad-census.mjs';
import lightProbe from './_light-probe.mjs';
import pw from './_pw.mjs';

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
  '_gpu-budget': gpuBudget,
  '_scene-graph': sceneGraph,
  '_quad-census': quadCensus,
  '_light-probe': lightProbe,
  _pw: pw,
};

// What `npm run playtest` runs when no scenario is named.
export const DEFAULT_SEQUENCE = ['smoke', 'explore', 'dialog', 'shop'];
