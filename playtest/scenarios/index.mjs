import smoke from './smoke.mjs';
import explore from './explore.mjs';
import dialog from './dialog.mjs';
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
import agua from './agua.mjs';
import cemetery from './cemetery.mjs';
import espada from './espada.mjs';
import menuFlow from './menu-flow.mjs';
import braco from './braco.mjs';
import caixaFerramentas from './caixa-ferramentas.mjs';
import machado from './machado.mjs';
import pedra from './pedra.mjs';
import ferro from './ferro.mjs';
import portalTravessia from './portal-travessia.mjs';
import portaoDeBater from './portao-de-bater.mjs';
import florDaLua from './flor-da-lua.mjs';
import sombras from './sombras.mjs';
import caixaPlaca from './caixa-placa.mjs';
import placaUndead from './placa-undead.mjs';
import rodaAgua from './roda-agua.mjs';
import bateria from './bateria.mjs';
import caldeira from './caldeira.mjs';
import fios from './fios.mjs';
import portaoEletronico from './portao-eletronico.mjs';
import itens from './itens.mjs';
import levelManagerPortal from './level-manager-portal.mjs';
import levelIntro from './level-intro.mjs';
import explorador from './explorador.mjs';
import combate from './combate.mjs';
import bolsa from './bolsa.mjs';
import pa from './pa.mjs';
import carnivora from './carnivora.mjs';
import esgrima from './esgrima.mjs';
import inimigos from './inimigos.mjs';
import fauna from './fauna.mjs';
import projeteis from './projeteis.mjs';
import zora from './zora.mjs';
import montanha from './montanha.mjs';
import salvamento from './salvamento.mjs';
import tochaViva from './tocha-viva.mjs';
import brasa from './brasa.mjs';
import altar from './altar.mjs';
import gelo from './gelo.mjs';
import labDungeon from './lab-dungeon.mjs';
import dungeonGerada from './dungeon-gerada.mjs';
import worldBuilder from './world-builder.mjs';
import fabrica from './fabrica.mjs';
import encomenda from './encomenda.mjs';
import forja from './forja.mjs';
import jardim from './jardim.mjs';
import vento from './vento.mjs';
import prologo from './prologo.mjs';

export const scenarios = {
  smoke,
  explore,
  explorador,
  dialog,
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
  agua,
  cemetery,
  espada,
  'menu-flow': menuFlow,
  braco,
  'caixa-ferramentas': caixaFerramentas,
  machado,
  pedra,
  ferro,
  'portal-travessia': portalTravessia,
  'portao-de-bater': portaoDeBater,
  'flor-da-lua': florDaLua,
  sombras,
  'caixa-placa': caixaPlaca,
  'placa-undead': placaUndead,
  'roda-agua': rodaAgua,
  bateria,
  caldeira,
  fios,
  'portao-eletronico': portaoEletronico,
  itens,
  'level-manager-portal': levelManagerPortal,
  'level-intro': levelIntro,
  combate,
  bolsa,
  pa,
  carnivora,
  esgrima,
  inimigos,
  fauna,
  projeteis,
  zora,
  montanha,
  salvamento,
  'tocha-viva': tochaViva,
  brasa,
  altar,
  gelo,
  'lab-dungeon': labDungeon,
  'dungeon-gerada': dungeonGerada,
  'world-builder': worldBuilder,
  fabrica,
  encomenda,
  forja,
  jardim,
  vento,
  prologo,
};

// What `npm run playtest` runs when no scenario is named.
export const DEFAULT_SEQUENCE = ['smoke', 'explore', 'dialog'];
