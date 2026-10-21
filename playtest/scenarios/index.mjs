import smoke from './smoke.mjs';
import explore from './explore.mjs';
import dialog from './dialog.mjs';
import audio from './audio.mjs';
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
import menuFlow from './menu-flow.mjs';
import machado from './machado.mjs';
import pedra from './pedra.mjs';
import ferro from './ferro.mjs';
import florDaLua from './flor-da-lua.mjs';
import sombras from './sombras.mjs';
import bolsa from './bolsa.mjs';
import pa from './pa.mjs';
import montanha from './montanha.mjs';
import altar from './altar.mjs';
import vento from './vento.mjs';
import prologo from './prologo.mjs';
import semFabrica from './sem-fabrica.mjs';
import zerar from './zerar.mjs';
import abertura from './abertura.mjs';
import semParede from './sem-parede.mjs';
import itemGet from './item-get.mjs';
import marcas from './marcas.mjs';
import descanso from './descanso.mjs';

export const scenarios = {
  smoke,
  explore,
  dialog,
  audio,
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
  'menu-flow': menuFlow,
  machado,
  pedra,
  ferro,
  'flor-da-lua': florDaLua,
  sombras,
  bolsa,
  pa,
  montanha,
  altar,
  vento,
  prologo,
  'sem-fabrica': semFabrica,
  zerar,
  abertura,
  'sem-parede': semParede,
  'item-get': itemGet,
  marcas,
  descanso,
};

// What `npm run playtest` runs when no scenario is named.
export const DEFAULT_SEQUENCE = ['smoke', 'explore', 'dialog'];
