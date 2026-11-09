/**
 * Os nomes de eventos e as constantes do motor — valores FIXOS, porque o jogo (e os playtests)
 * conversam com eles por nome. Parte do motor próprio (src/game/engine).
 */

export const SceneEvents = {
  ADDED_TO_SCENE: 'addedtoscene',
  BOOT: 'boot',
  CREATE: 'create',
  DESTROY: 'destroy',
  PAUSE: 'pause',
  POST_UPDATE: 'postupdate',
  PRE_RENDER: 'prerender',
  PRE_UPDATE: 'preupdate',
  READY: 'ready',
  REMOVED_FROM_SCENE: 'removedfromscene',
  RENDER: 'render',
  RESUME: 'resume',
  SHUTDOWN: 'shutdown',
  SLEEP: 'sleep',
  START: 'start',
  UPDATE: 'update',
  WAKE: 'wake',
} as const;

export const CoreEvents = {
  BLUR: 'blur',
  BOOT: 'boot',
  DESTROY: 'destroy',
  FOCUS: 'focus',
  HIDDEN: 'hidden',
  PAUSE: 'pause',
  POST_RENDER: 'postrender',
  POST_STEP: 'poststep',
  PRE_RENDER: 'prerender',
  PRE_STEP: 'prestep',
  READY: 'ready',
  RESUME: 'resume',
  STEP: 'step',
  VISIBLE: 'visible',
} as const;

export const InputEvents = {
  GAMEOBJECT_DOWN: 'gameobjectdown',
  GAMEOBJECT_OVER: 'gameobjectover',
  GAMEOBJECT_OUT: 'gameobjectout',
  GAMEOBJECT_UP: 'gameobjectup',
  GAMEOBJECT_POINTER_DOWN: 'pointerdown',
  GAMEOBJECT_POINTER_OVER: 'pointerover',
  GAMEOBJECT_POINTER_OUT: 'pointerout',
  GAMEOBJECT_POINTER_UP: 'pointerup',
  GAME_OUT: 'gameout',
  GAME_OVER: 'gameover',
  POINTER_DOWN: 'pointerdown',
  POINTER_DOWN_OUTSIDE: 'pointerdownoutside',
  POINTER_MOVE: 'pointermove',
  POINTER_OUT: 'pointerout',
  POINTER_OVER: 'pointerover',
  POINTER_UP: 'pointerup',
  POINTER_UP_OUTSIDE: 'pointerupoutside',
  POINTER_WHEEL: 'wheel',
  MANAGER_PROCESS: 'process',
} as const;

export const ScaleEvents = {
  RESIZE: 'resize',
} as const;

export const KeyboardEvents = {
  ANY_KEY_DOWN: 'keydown',
  ANY_KEY_UP: 'keyup',
  DOWN: 'down',
  KEY_DOWN: 'keydown-',
  KEY_UP: 'keyup-',
  UP: 'up',
} as const;

export const SceneStatus = {
  PENDING: 0,
  INIT: 1,
  START: 2,
  LOADING: 3,
  CREATING: 4,
  RUNNING: 5,
  PAUSED: 6,
  SLEEPING: 7,
  SHUTDOWN: 8,
  DESTROYED: 9,
} as const;

export const BlendModes = {
  SKIP_CHECK: -1,
  NORMAL: 0,
  ADD: 1,
  MULTIPLY: 2,
  SCREEN: 3,
} as const;

export const FilterMode = {
  LINEAR: 0,
  NEAREST: 1,
} as const;

/** O tipo de renderizador da config (AUTO = 0, CANVAS = 1, WEBGL = 2, HEADLESS = 3). */
export const AUTO = 0;
export const CANVAS = 1;
export const WEBGL = 2;
export const HEADLESS = 3;
