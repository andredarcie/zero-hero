// A SERRA NO EDITOR: o planalto um nível acima, a escada (só onde ela liga um chão a outro), voltar ao chão, e o
// desenho do relevo por cima do tabuleiro.

import { SOLID_UPPER_FRAMES } from '@/game/constants';
import { RELIEF_GROUND, RELIEF_HIGH, RELIEF_PEAK, STAIR_CODES_GROUND, STAIR_CODES_HIGH, stairBase, stairUp } from '@/game/world/relief';
import type { EditorScene } from '../EditorScene';
import { WORLD_TILE } from './editorDefs';

/** O código do andar `level` (0 chão, 1 planalto, 2 cume). */
const floorCode = (level: number): number => (level === 0 ? RELIEF_GROUND : level === 1 ? RELIEF_HIGH : RELIEF_PEAK);
/** Em que andar um código fica (a escada, no andar de onde sai). */
const codeFloor = (code: number): number => (stairUp(code) ? stairBase(code) : code === RELIEF_HIGH ? 1 : code === RELIEF_PEAK ? 2 : 0);
// A ordem em que a escada procura o andar de cima ao ser posta: norte primeiro (sobe de frente para a
// camera, como as do script da serra), depois leste, sul, oeste. Clicar de novo gira nesta ordem. As do
// chão sobem ao planalto; as do planalto, ao cume.
const STAIR_CODES = [...STAIR_CODES_GROUND, ...STAIR_CODES_HIGH] as const;

/** O que EditorRelief usa de EditorScene. */
export type EditorReliefHost = Pick<EditorScene,
  'reliefGfx' | 'store' | 'ui' | 'view'
>;

export class EditorRelief {
  public constructor(private readonly host: EditorReliefHost) {}

  public reliefAt(x: number, y: number): number {
    return (this.host.store?.readCell('relief', x, y) as number | undefined) ?? RELIEF_GROUND;
  }

  /** A escada em (x, y) leva ao andar de cima e sai no de baixo? (a mesma regra de canStep em relief.ts) */
  private stairWorks(x: number, y: number, code: number): boolean {
    const up = stairUp(code);
    if (!up) return false;
    const base = stairBase(code);
    return this.reliefAt(x + up[0], y + up[1]) === floorCode(base + 1) && this.reliefAt(x - up[0], y - up[1]) === floorCode(base);
  }

  /**
   * Poe (ou GIRA) uma escada. Ela so vale encostada num planalto e com chao do outro lado, entao a
   * direcao nao se escolhe na mao: o editor acha as que funcionam e clicar de novo passa para a
   * proxima. Uma escada que nao leva a lugar nenhum nunca e criada aqui.
   */
  public placeStair(x: number, y: number): void {
    const store = this.host.store;
    if (!store || !this.host.view.isEditable(x, y)) return;
    const current = this.reliefAt(x, y);
    if (current === RELIEF_PEAK) {
      this.host.ui?.toast('A escada vai no chao (ou no planalto), encostada no andar de cima');
      return;
    }
    // O andar do tile escolhe que escada cabe: do chão ao planalto, ou do planalto ao cume.
    const floor = codeFloor(current);
    // A escada e passagem: uma peca ou arvore em cima dela a tranca.
    const upper = store.readCell('upper', x, y) as number | null;
    if (store.entities.entitiesAt(x, y).length > 0 || (upper !== null && SOLID_UPPER_FRAMES.has(upper))) {
      this.host.ui?.toast('A escada precisa de um tile livre');
      return;
    }
    const options = STAIR_CODES.filter((code) => stairBase(code) === floor && this.stairWorks(x, y, code));
    if (options.length === 0) {
      this.host.ui?.toast('A escada precisa encostar no andar de cima, com o andar de baixo do outro lado');
      return;
    }
    const at = options.indexOf(current as (typeof STAIR_CODES)[number]);
    const next = at < 0 ? options[0] : options[(at + 1) % options.length];
    if (next === current) this.host.ui?.toast('So ha um jeito desta escada subir');
    else store.setCell('relief', x, y, next);
  }

  /**
   * Volta o tile ao chao; a escada que subia para ele cai junto (ficaria levando a lugar nenhum) e vira o
   * andar de onde ela saía.
   */
  public clearRelief(x: number, y: number): void {
    const store = this.host.store;
    if (!store || !this.host.view.isEditable(x, y)) return;
    const was = this.reliefAt(x, y);
    if (was === RELIEF_GROUND) return;
    store.setCell('relief', x, y, RELIEF_GROUND);
    if (was !== RELIEF_HIGH && was !== RELIEF_PEAK) return;
    STAIR_CODES.forEach((code) => {
      if (floorCode(stairBase(code) + 1) !== was) return;
      const up = stairUp(code)!;
      const sx = x - up[0];
      const sy = y - up[1];
      if (this.reliefAt(sx, sy) === code && this.host.view.isEditable(sx, sy)) store.setCell('relief', sx, sy, floorCode(stairBase(code)));
    });
  }

  /**
   * A serra por cima do mapa: o planalto em ocre com o PAREDAO (borda escura) onde ele cai para o
   * chao, e a escada clara com degraus e uma seta para onde ela sobe. Escada que nao funciona fica
   * com borda vermelha. Redesenhada inteira a cada mudanca: sao poucos tiles.
   */
  public drawRelief(): void {
    const store = this.host.store;
    const gfx = this.host.reliefGfx;
    if (!store || !gfx) return;
    gfx.clear();
    const T = WORLD_TILE;
    // O andar nao tem paredao do lado de outro tile do mesmo andar (ou mais alto), nem onde uma escada chega nele.
    const joins = (x: number, y: number, dx: number, dy: number): boolean => {
      const mine = codeFloor(this.reliefAt(x, y));
      const n = this.reliefAt(x + dx, y + dy);
      const up = stairUp(n);
      if (up) return (up[0] === -dx && up[1] === -dy && stairBase(n) + 1 === mine) || stairBase(n) >= mine;
      return codeFloor(n) >= mine;
    };
    for (let y = 0; y < store.tilesY; y += 1) {
      for (let x = 0; x < store.tilesX; x += 1) {
        const code = this.reliefAt(x, y);
        if (code === RELIEF_GROUND) continue;
        const px = x * T;
        const py = y * T;
        if (code === RELIEF_HIGH || code === RELIEF_PEAK) {
          // O cume é o mesmo ocre, mais forte: dois níveis acima.
          gfx.fillStyle(code === RELIEF_PEAK ? 0xb5702a : 0xd9a55a, code === RELIEF_PEAK ? 0.52 : 0.34).fillRect(px, py, T, T);
          gfx.lineStyle(1.5, 0x4a2e14, 0.95);
          if (!joins(x, y, 0, -1)) gfx.lineBetween(px, py + 0.75, px + T, py + 0.75);
          if (!joins(x, y, 1, 0)) gfx.lineBetween(px + T - 0.75, py, px + T - 0.75, py + T);
          if (!joins(x, y, -1, 0)) gfx.lineBetween(px + 0.75, py, px + 0.75, py + T);
          // A face sul e a que a camera do jogo ve: um paredao mais grosso.
          if (!joins(x, y, 0, 1)) gfx.fillStyle(0x4a2e14, 0.55).fillRect(px, py + T - 3, T, 3);
          continue;
        }
        const up = stairUp(code);
        if (!up) continue;
        const [dx, dy] = up;
        const cx = px + T / 2;
        const cy = py + T / 2;
        gfx.fillStyle(0xf1e3b8, 0.62).fillRect(px + 1, py + 1, T - 2, T - 2);
        gfx.lineStyle(1, 0x6b4a26, 0.9);
        for (const s of [-4, 0, 4]) {
          const ox = cx + dx * s;
          const oy = cy + dy * s;
          gfx.lineBetween(ox - dy * 5, oy - dx * 5, ox + dy * 5, oy + dx * 5);
        }
        gfx.fillStyle(0x4a2e14, 1).fillTriangle(
          cx + dx * 6, cy + dy * 6,
          cx - dy * 3.5 + dx * 1.5, cy - dx * 3.5 + dy * 1.5,
          cx + dy * 3.5 + dx * 1.5, cy + dx * 3.5 + dy * 1.5,
        );
        if (!this.stairWorks(x, y, code)) {
          gfx.lineStyle(1.5, 0xff4455, 1).strokeRect(px + 0.75, py + 0.75, T - 1.5, T - 1.5);
        }
      }
    }
  }
}
