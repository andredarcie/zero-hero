import { adventureState } from '@/game/runtime/adventureState';

import type { TallGrassObject } from './TallGrassObject';

/**
 * O MATO DA TRILHA DA PRAIA (pedido do autor, 2026-11-19: "uma trilha subindo que precisa de foice pra cortar o mato e
 * abrir a trilha"). A trilha sai do lado da fogueira da Thea (x = 42), sobe a serra pelas escadas e desce na duna; o
 * mato tomou conta dela, e são oito cortes obrigatórios até a areia (scripts/praia-do-norte.mjs).
 *
 * DUAS REGRAS, e as duas são o que faz dele uma porta:
 *   · SÓ A FOICE o abre. Ele é o mato VERDE (objects/TallGrassObject): não pega fogo nem conduz fogo — uma tocha não
 *     pode fazer o serviço da foice.
 *   · O CORTE FICA. O mato do vale volta quando a partida recomeça (é recurso, como a rocha), e o do acampamento volta
 *     com o tempo (é chão que se usa ou não). Este é PASSAGEM: se voltasse, quem recarregasse o jogo na areia sem a
 *     foice ficaria preso do outro lado da serra. O save guarda cada tile aberto (`trailCut`).
 */

/** Os três tiles de mato ao norte da fogueira da Thea: a cabeça da trilha, ainda dentro do vale de sempre. */
const TRAILHEAD_X = 42;
const TRAILHEAD_Y: readonly [number, number] = [1, 3];

/** Este tile é da trilha da praia: tudo ao norte da linha 0, e a cabeça dela no vale. */
export const inBeachTrail = (x: number, y: number): boolean =>
  y < 0 || (x === TRAILHEAD_X && y >= TRAILHEAD_Y[0] && y <= TRAILHEAD_Y[1]);

/**
 * Liga o mato da trilha ao save: o que já foi aberto numa sessão de antes nasce aberto (o chão limpo), e cada corte
 * novo entra no save na hora. `persist` grava a partida.
 */
export const bindTrailGrass = (grasses: readonly TallGrassObject[], persist: () => void): void => {
  const cut = adventureState().trailCut;
  for (const g of grasses) {
    if (!inBeachTrail(g.worldX, g.worldY)) continue;
    const key = `${g.worldX},${g.worldY}`;
    if (cut.has(key)) g.settle();
    g.onCut = () => {
      adventureState().trailCut.add(key);
      persist();
    };
  }
};
