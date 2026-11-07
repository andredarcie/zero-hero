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
import telescopio from './telescopio.mjs';
import ajustes from './ajustes.mjs';
import jardimAlto from './jardim-alto.mjs';
import chaoSemRisco from './chao-sem-risco.mjs';
import dicas from './dicas.mjs';
import frenteDoNpc from './frente-do-npc.mjs';
import falasLidas from './falas-lidas.mjs';
import legendas from './legendas.mjs';
import acampamento from './acampamento.mjs';
import barraca from './barraca.mjs';
import abertura from './abertura.mjs';
import semParede from './sem-parede.mjs';
import itemGet from './item-get.mjs';
import marcas from './marcas.mjs';
import descanso from './descanso.mjs';
import dia from './dia.mjs';
import fogueiraDormir from './fogueira-dormir.mjs';
import irisDormir from './iris-dormir.mjs';
import morteTresNoites from './morte-tres-noites.mjs';
import gatoCinico from './gato-cinico.mjs';
import gatoBarril from './gato-barril.mjs';
import cachoeira from './cachoeira.mjs';
import chuva from './chuva.mjs';
import biomas from './biomas.mjs';

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
  telescopio,
  abertura,
  'sem-parede': semParede,
  'item-get': itemGet,
  ajustes,
  'jardim-alto': jardimAlto,
  'chao-sem-risco': chaoSemRisco,
  dicas,
  'frente-do-npc': frenteDoNpc,
  'falas-lidas': falasLidas,
  legendas,
  acampamento,
  barraca,
  marcas,
  descanso,
  dia,
  'fogueira-dormir': fogueiraDormir,
  'iris-dormir': irisDormir,
  'morte-tres-noites': morteTresNoites,
  'gato-cinico': gatoCinico,
  'gato-barril': gatoBarril,
  cachoeira,
  chuva,
  biomas,
};

// What `npm run playtest` runs when no scenario is named.
export const DEFAULT_SEQUENCE = ['smoke', 'explore', 'dialog'];
