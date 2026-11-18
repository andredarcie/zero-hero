// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HOME_NAME_MAX } from './homeState';
import { NameCard } from './NameCard';

// A PLACA ABERTA: uma linha para escrever o nome do lugar. Enter escreve (limpo), Esc deixa como estava, e o que se
// digita não chega ao jogo.

const typeKey = (target: EventTarget, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe('NameCard', () => {
  const opened: NameCard[] = [];
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
  });
  afterEach(() => {
    for (const card of opened.splice(0)) card.destroy();
    vi.useRealTimers();
  });

  const open = (current = '') => {
    const onWrite = vi.fn();
    const onClose = vi.fn();
    const card = new NameCard(current, 'Acampamento do Zero', { onWrite, onClose });
    opened.push(card);
    const input = card.element.querySelector('input')!;
    return { card, input, onWrite, onClose };
  };

  it('começa com o nome de agora e mostra o de sempre como dica, no tamanho da placa', () => {
    const { input } = open('Recanto');
    expect(input.value).toBe('Recanto');
    expect(input.placeholder).toBe('Acampamento do Zero');
    expect(input.maxLength).toBe(HOME_NAME_MAX);
  });

  it('o Enter escreve o nome limpo e fecha', () => {
    const { card, input, onWrite, onClose } = open();
    input.value = '  Recanto   da Lua ';
    typeKey(input, 'Enter');
    expect(onWrite).toHaveBeenCalledWith('Recanto da Lua');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.body.contains(card.element)).toBe(false);
  });

  it('o Esc deixa a placa como estava', () => {
    const { input, onWrite, onClose } = open('Antigo');
    input.value = 'Novo';
    typeKey(input, 'Escape');
    expect(onWrite).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o que se digita não chega ao jogo, nem com o foco fora da linha', () => {
    const { input, onClose } = open();
    const game = vi.fn();
    window.addEventListener('keydown', game);
    typeKey(input, 'z');
    typeKey(input, 'ArrowLeft');
    typeKey(document.body, 'x');
    expect(game).not.toHaveBeenCalled();
    typeKey(document.body, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', game);
  });

  it('os botões de pena escrevem e deixam, no toque', () => {
    const { card, input, onWrite } = open();
    input.value = 'Casa';
    const [write] = card.element.querySelectorAll('button');
    write.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(onWrite).toHaveBeenCalledWith('Casa');
  });
});
