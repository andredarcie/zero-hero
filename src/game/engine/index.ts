/**
 * O MOTOR 2D DO JOGO — com a forma de uso que o jogo inteiro conhece (`Engine.Scene`, `this.tweens`,
 * `this.time`, `this.add.*`, `Engine.Math.Between`…) e só o que o jogo usa: o laço de quadros,
 * as cenas e a ordem dos eventos, as animações, os temporizadores, o teclado/mouse/toque, as texturas e o desenho
 * 2D em WebGL por cima do mundo 3D (three.js). Licenças em LICENSES.md.
 */
export { Scene } from './scene';
export { Game } from './game';
export { EventEmitter } from './events';
export { BlendModes, AUTO, CANVAS, WEBGL, HEADLESS } from './constants';
export * as Math from './ns/Math';
export * as Scenes from './ns/Scenes';
export * as Core from './ns/Core';
export * as Time from './ns/Time';
export * as Tweens from './ns/Tweens';
export * as GameObjects from './ns/GameObjects';
export * as Input from './ns/Input';
export * as Textures from './ns/Textures';
export * as Scale from './ns/Scale';
export * as Display from './ns/Display';
export * as Tilemaps from './ns/Tilemaps';
export * as Cameras from './ns/Cameras';
export * as Utils from './ns/Utils';
export * as Structs from './ns/Structs';
export * as Types from './ns/Types';
