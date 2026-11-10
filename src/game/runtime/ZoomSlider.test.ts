// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { localStore } from '@/game/platform/platform';
import { getCameraZoom, setCameraZoom, ZOOM_MAX, ZOOM_MIN } from '@/game/runtime/graphicsSettings';
import { stepZoom, zoomLabel, ZoomSlider } from '@/game/runtime/ZoomSlider';

// A RÉGUA DE ZOOM: os botões andam de 10 em 10% e param nas pontas, o arrasto põe o zoom onde o dedo está (em cima é
// perto) de 5 em 5%, o número embaixo diz o valor, ele fica guardado, cada mudança avisa quem abriu, e o OK sai.

let slider: ZoomSlider;
let changes: number[];
let done: number;
const knob = (): number => Number(slider.track.style.getPropertyValue('--f'));
const press = (type: string, clientY: number): void => {
  slider.track.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true, cancelable: true }));
};

beforeEach(() => {
  setCameraZoom(1);
  changes = [];
  done = 0;
  slider = new ZoomSlider({ onChange: (zoom) => changes.push(zoom), onDone: () => { done += 1; } });
  // O jsdom não tem layout: a régua mede 160 px de altura, a partir do topo da tela.
  slider.track.getBoundingClientRect = () => ({ top: 0, bottom: 160, left: 0, right: 32, width: 32, height: 160, x: 0, y: 0, toJSON: () => ({}) });
});

afterEach(() => {
  slider.destroy();
  setCameraZoom(1);
});

describe('a régua de zoom', () => {
  it('o número de referência diz o zoom em porcentagem, e começa em 100%', () => {
    expect(slider.readout.textContent).toBe('100%');
    expect(slider.track.getAttribute('aria-valuetext')).toBe('100%');
  });

  it('o "+" aproxima 10%, o "−" afasta 10%, o valor fica guardado e cada mudança avisa', () => {
    slider.zoomIn.click();
    expect(getCameraZoom()).toBeCloseTo(1.1, 5);
    expect(slider.readout.textContent).toBe('110%');
    expect(localStore().getItem('zh.camZoom')).toBe('1.1');
    slider.zoomOut.click();
    slider.zoomOut.click();
    expect(getCameraZoom()).toBeCloseTo(0.9, 5);
    expect(slider.readout.textContent).toBe('90%');
    expect(changes.map((z) => Math.round(z * 100))).toEqual([110, 100, 90]);
  });

  it('o passo cai no próximo número redondo, de qualquer ponto', () => {
    expect(stepZoom(1.17, 1)).toBeCloseTo(1.2, 5);
    expect(stepZoom(1.17, -1)).toBeCloseTo(1.1, 5);
    expect(stepZoom(1.2, -1)).toBeCloseTo(1.1, 5);
    expect(stepZoom(0.75, 1)).toBeCloseTo(0.8, 5);
    expect(zoomLabel(1.25)).toBe('125%');
  });

  it('para nas pontas, o botão da ponta apaga, e apertar o apagado não avisa nada', () => {
    for (let i = 0; i < 20; i += 1) slider.zoomIn.click();
    expect(getCameraZoom()).toBe(ZOOM_MAX);
    expect(slider.readout.textContent).toBe('150%');
    expect(slider.zoomIn.disabled).toBe(true);
    expect(knob()).toBe(1);
    const before = changes.length;
    slider.step(1);
    expect(changes.length).toBe(before);
    for (let i = 0; i < 20; i += 1) slider.zoomOut.click();
    expect(getCameraZoom()).toBe(ZOOM_MIN);
    expect(slider.readout.textContent).toBe('75%');
    expect(slider.zoomOut.disabled).toBe(true);
    expect(knob()).toBe(0);
  });

  it('o arrasto põe o zoom onde o dedo está, de 5 em 5%: em cima é perto, embaixo é longe', () => {
    press('pointerdown', 0);
    expect(getCameraZoom()).toBe(ZOOM_MAX);
    press('pointermove', 160);
    expect(getCameraZoom()).toBe(ZOOM_MIN);
    press('pointermove', 80);
    const middle = getCameraZoom();
    expect(middle).toBeCloseTo((ZOOM_MIN + ZOOM_MAX) / 2, 1);
    expect(Math.round(middle * 100) % 5).toBe(0);
    press('pointerup', 80);
    // Solto, o ponteiro passando por cima não arrasta mais nada.
    press('pointermove', 0);
    expect(getCameraZoom()).toBe(middle);
  });

  it('o OK chama quem abriu', () => {
    slider.ok?.click();
    expect(done).toBe(1);
  });

  it('é interface: tocar nela não vira arrasto de andar, e os botões nunca pegam foco', () => {
    expect(slider.root.closest('[data-zh-ui]')).toBe(slider.root);
    expect(slider.zoomIn.tabIndex).toBe(-1);
    expect(slider.zoomOut.tabIndex).toBe(-1);
    expect(slider.track.getAttribute('role')).toBe('slider');
  });
});
