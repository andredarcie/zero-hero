// O DESPACHO DOS PONTEIROS de uma cena: apertar, soltar, mover, a roda, e o entrar/sair de cima de cada objeto
// interativo, na ordem e com os eventos de sempre. Licenças em LICENSES.md.

import { InputEvents } from './constants';
import type { GameObject } from './gameobjects/GameObject';
import { Pointer } from './pointer';
import type { InputPlugin } from './input';

/** O que PointerDispatch usa de InputPlugin. */
export type PointerDispatchHost = Pick<InputPlugin,
  '_drag' | '_eventContainer' | '_eventData' | '_over' | '_temp' | 'emit' | 'isActive' | 'manager'
  | 'sortGameObjects' | 'topOnly'
>;

export class PointerDispatch {
  public constructor(private readonly host: PointerDispatchHost) {}

  public processDownEvents(pointer: Pointer): number {
    let total = 0;
    const currentlyOver = this.host._temp;
    const _eventData = this.host._eventData;
    const _eventContainer = this.host._eventContainer;
    _eventData.cancelled = false;
    for (const gameObject of currentlyOver) {
      if (!gameObject.input || !gameObject.input.enabled) continue;
      total++;
      gameObject.emit(InputEvents.GAMEOBJECT_POINTER_DOWN, pointer, gameObject.input.localX, gameObject.input.localY, _eventContainer);
      if (_eventData.cancelled || !this.host.isActive()) break;
      if (gameObject.input && gameObject.input.enabled) {
        this.host.emit(InputEvents.GAMEOBJECT_DOWN, pointer, gameObject, _eventContainer);
        if (_eventData.cancelled || !this.host.isActive()) break;
      }
    }
    if (!_eventData.cancelled && this.host.isActive()) {
      if (pointer.downElement === this.host.manager.eventTarget) this.host.emit(InputEvents.POINTER_DOWN, pointer, currentlyOver);
      else this.host.emit(InputEvents.POINTER_DOWN_OUTSIDE, pointer);
    }
    return total;
  }

  public processUpEvents(pointer: Pointer): number {
    const currentlyOver = this.host._temp;
    const _eventData = this.host._eventData;
    const _eventContainer = this.host._eventContainer;
    _eventData.cancelled = false;
    for (const gameObject of currentlyOver) {
      if (!gameObject.input || !gameObject.input.enabled) continue;
      gameObject.emit(InputEvents.GAMEOBJECT_POINTER_UP, pointer, gameObject.input.localX, gameObject.input.localY, _eventContainer);
      if (_eventData.cancelled || !this.host.isActive()) break;
      if (gameObject.input && gameObject.input.enabled) {
        this.host.emit(InputEvents.GAMEOBJECT_UP, pointer, gameObject, _eventContainer);
        if (_eventData.cancelled || !this.host.isActive()) break;
      }
    }
    if (!_eventData.cancelled && this.host.isActive()) {
      if (pointer.upElement === this.host.manager.eventTarget) this.host.emit(InputEvents.POINTER_UP, pointer, currentlyOver);
      else this.host.emit(InputEvents.POINTER_UP_OUTSIDE, pointer);
    }
    return currentlyOver.length;
  }

  public processMoveEvents(pointer: Pointer): number {
    let total = 0;
    const currentlyOver = this.host._temp;
    const _eventData = this.host._eventData;
    const _eventContainer = this.host._eventContainer;
    _eventData.cancelled = false;
    for (const gameObject of currentlyOver) {
      if (!gameObject.input || !gameObject.input.enabled) continue;
      total++;
      gameObject.emit('pointermove', pointer, gameObject.input.localX, gameObject.input.localY, _eventContainer);
      if (_eventData.cancelled || !this.host.isActive()) break;
      if (gameObject.input && gameObject.input.enabled) {
        this.host.emit('gameobjectmove', pointer, gameObject, _eventContainer);
        if (_eventData.cancelled || !this.host.isActive()) break;
        if (this.host.topOnly) break;
      }
    }
    if (!_eventData.cancelled && this.host.isActive()) this.host.emit(InputEvents.POINTER_MOVE, pointer, currentlyOver);
    return total;
  }

  public processWheelEvent(pointer: Pointer): number {
    let total = 0;
    const currentlyOver = this.host._temp;
    const _eventData = this.host._eventData;
    const _eventContainer = this.host._eventContainer;
    _eventData.cancelled = false;
    const dx = pointer.deltaX;
    const dy = pointer.deltaY;
    const dz = pointer.deltaZ;
    for (const gameObject of currentlyOver) {
      if (!gameObject.input || !gameObject.input.enabled) continue;
      total++;
      gameObject.emit('wheel', pointer, dx, dy, dz, _eventContainer);
      if (_eventData.cancelled || !this.host.isActive()) break;
      if (gameObject.input && gameObject.input.enabled) {
        this.host.emit('gameobjectwheel', pointer, gameObject, dx, dy, dz, _eventContainer);
        if (_eventData.cancelled || !this.host.isActive()) break;
      }
    }
    if (!_eventData.cancelled && this.host.isActive()) this.host.emit(InputEvents.POINTER_WHEEL, pointer, currentlyOver, dx, dy, dz);
    return total;
  }

  public processOverEvents(pointer: Pointer): number {
    const currentlyOver = this.host._temp;
    let totalInteracted = 0;
    const justOver: GameObject[] = [];
    if (currentlyOver.length > 0) {
      const _eventData = this.host._eventData;
      const _eventContainer = this.host._eventContainer;
      _eventData.cancelled = false;
      for (const gameObject of currentlyOver) {
        if (!gameObject.input || !gameObject.input.enabled) continue;
        justOver.push(gameObject);
        this.host.manager.setCursor(gameObject.input);
        gameObject.emit(InputEvents.GAMEOBJECT_POINTER_OVER, pointer, gameObject.input.localX, gameObject.input.localY, _eventContainer);
        totalInteracted++;
        if (_eventData.cancelled || !this.host.isActive()) break;
        if (gameObject.input && gameObject.input.enabled) {
          this.host.emit(InputEvents.GAMEOBJECT_OVER, pointer, gameObject, _eventContainer);
          if (_eventData.cancelled || !this.host.isActive()) break;
        }
      }
      if (!_eventData.cancelled && this.host.isActive()) this.host.emit(InputEvents.POINTER_OVER, pointer, justOver);
    }
    this.host._over[pointer.id] = justOver;
    return totalInteracted;
  }

  public processOutEvents(pointer: Pointer): number {
    const previouslyOver = this.host._over[pointer.id];
    let totalInteracted = 0;
    if (previouslyOver.length > 0) {
      const _eventData = this.host._eventData;
      const _eventContainer = this.host._eventContainer;
      _eventData.cancelled = false;
      this.host.sortGameObjects(previouslyOver, pointer);
      for (const gameObject of previouslyOver) {
        if (!gameObject.input || !gameObject.input.enabled) continue;
        this.host.manager.resetCursor(gameObject.input);
        gameObject.emit(InputEvents.GAMEOBJECT_POINTER_OUT, pointer, _eventContainer);
        totalInteracted++;
        if (_eventData.cancelled || !this.host.isActive()) break;
        if (gameObject.input && gameObject.input.enabled) {
          this.host.emit(InputEvents.GAMEOBJECT_OUT, pointer, gameObject, _eventContainer);
          if (_eventData.cancelled || !this.host.isActive()) break;
        }
      }
      if (!_eventData.cancelled && this.host.isActive()) this.host.emit(InputEvents.POINTER_OUT, pointer, previouslyOver);
      this.host._over[pointer.id] = [];
    }
    return totalInteracted;
  }

  public processOverOutEvents(pointer: Pointer): number {
    const currentlyOver = this.host._temp;
    const justOut: GameObject[] = [];
    const justOver: GameObject[] = [];
    const stillOver: GameObject[] = [];
    const previouslyOver = this.host._over[pointer.id];
    const currentlyDragging = this.host._drag[pointer.id];
    for (const gameObject of previouslyOver) {
      if (currentlyOver.indexOf(gameObject) === -1 && currentlyDragging.indexOf(gameObject) === -1) justOut.push(gameObject);
      else stillOver.push(gameObject);
    }
    for (const gameObject of currentlyOver) {
      if (previouslyOver.indexOf(gameObject) === -1) justOver.push(gameObject);
    }
    let totalInteracted = 0;
    const _eventData = this.host._eventData;
    const _eventContainer = this.host._eventContainer;
    _eventData.cancelled = false;
    if (justOut.length > 0) {
      this.host.sortGameObjects(justOut, pointer);
      for (const gameObject of justOut) {
        if (!gameObject.input || !gameObject.input.enabled) continue;
        this.host.manager.resetCursor(gameObject.input);
        gameObject.emit(InputEvents.GAMEOBJECT_POINTER_OUT, pointer, _eventContainer);
        totalInteracted++;
        if (_eventData.cancelled || !this.host.isActive()) break;
        if (gameObject.input && gameObject.input.enabled) {
          this.host.emit(InputEvents.GAMEOBJECT_OUT, pointer, gameObject, _eventContainer);
          if (_eventData.cancelled || !this.host.isActive()) break;
        }
      }
      // (sic) o teste é com `||` aqui
      if (!_eventData.cancelled || this.host.isActive()) this.host.emit(InputEvents.POINTER_OUT, pointer, justOut);
    }
    _eventData.cancelled = false;
    if (justOver.length > 0) {
      this.host.sortGameObjects(justOver, pointer);
      for (const gameObject of justOver) {
        if (!gameObject.input || !gameObject.input.enabled) continue;
        this.host.manager.setCursor(gameObject.input);
        gameObject.emit(InputEvents.GAMEOBJECT_POINTER_OVER, pointer, gameObject.input.localX, gameObject.input.localY, _eventContainer);
        totalInteracted++;
        if (_eventData.cancelled || !this.host.isActive()) break;
        if (gameObject.input && gameObject.input.enabled) {
          this.host.emit(InputEvents.GAMEOBJECT_OVER, pointer, gameObject, _eventContainer);
          if (_eventData.cancelled || !this.host.isActive()) break;
        }
      }
      if (!_eventData.cancelled && this.host.isActive()) this.host.emit(InputEvents.POINTER_OVER, pointer, justOver);
    }
    this.host._over[pointer.id] = this.host.sortGameObjects(stillOver.concat(justOver), pointer);
    return totalInteracted;
  }
}
