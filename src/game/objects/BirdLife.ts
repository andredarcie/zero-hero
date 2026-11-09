import { profiler } from '@/game/debug/Profiler';
import * as Engine from '@/game/engine';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { getTimeOfDay } from '@/game/runtime/timeOfDay';
import { isLifeHome } from '@/game/world/biomeLife';
import { TILESET as P, flushTextures, sprite } from '@/game/objects/nature/kit';

/**
 * OS PÁSSAROS (pedido do autor: a floresta precisa de pássaros de dia; o canto já está no leito de ambiente do dia,
 * faltava VÊ-LOS). Como passarinhos de verdade:
 *   · CISCAM no chão em bandinhos de 3 ou 4: bicam, dão pulinhos, viram de lado, cada um no seu tempo.
 *   · ESPANTAM: quando o herói chega perto, o bando inteiro levanta junto, para longe dele, e só pousa de novo
 *     longe, um tempo depois.
 *   · CHEGAM voando e descem em arco antes de pousar, em vez de aparecer no chão.
 *   · BANDOS cruzam o céu de vez em quando, no voo ONDULADO dos passarinhos: batem as asas, fecham, planam caindo
 *     um pouco, e batem de novo.
 *   · Só de DIA e sem chuva forte (passarinho se esconde da chuva); de noite, nenhum.
 * Três espécies: o pardal (marrom), o pisco (peito laranja) e o chapim (azul e amarelo).
 */

/**
 * O DESENHO (refeito: a primeira versão tinha cabeça de 2 px, o olho por cima dela e a asa apagando o dorso — o
 * pardal virava uma bandeirinha). Agora, 10×8, virado para a direita, no traço do tileset:
 *   · cabeça redonda de 3×3 com o OLHO DENTRO dela e o bico separado, na frente;
 *   · a CARA de cada espécie (bochecha cinza do pardal, cara laranja do pisco, bochecha branca do chapim);
 *   · o dorso na cor da espécie e a ASA POR CIMA, com uma barra clara — sem apagar o dorso;
 *   · barriga clara redonda e a cauda que se destaca do corpo;
 *   · bicando, o CORPO TODO inclina para a frente (a cabeça não se solta dele).
 * Letras: H boné, F cara, K olho, Y bico, B dorso, W asa, w barra da asa, C peito, b barriga, T cauda, L perna.
 */
const W = 10;
const H = 8;
type Frame = 'stand' | 'peck' | 'up' | 'down' | 'glide';
const FRAMES: Record<Frame, readonly string[]> = {
  stand: [
    '......HHH.',
    '.....HFKHY',
    'TT..BBFFF.',
    '.TTBBWwCC.',
    '..TBWWWbC.',
    '...bbbbb..',
    '.....L.L..',
    '....LL.LL.',
  ],
  peck: [
    '..........',
    'TT........',
    '.TTBBB....',
    '..TBWWBHH.',
    '...WWwbHKH',
    '...bbbbFFY',
    '....L.L...',
    '...LL.LL..',
  ],
  up: [
    '...WW.....',
    '..WwWW.HH.',
    '...WWBHKHY',
    'TTBBBBFFF.',
    '.TTbbbCC..',
    '...bbbb...',
    '..........',
    '..........',
  ],
  down: [
    '..........',
    '.......HH.',
    '....BBHKHY',
    'TTBBBBFFF.',
    '.TTbWWCC..',
    '...WwWW...',
    '....WW....',
    '..........',
  ],
  glide: [
    '..........',
    '.......HH.',
    '....BBHKHY',
    'TTBBWwWFF.',
    '.TTbbbCC..',
    '...bbbb...',
    '..........',
    '..........',
  ],
};
const FRAME_NAMES = Object.keys(FRAMES) as Frame[];
/**
 * As cores vêm do tileset (forest_tile_set.png), como as árvores do bosque: nada de paleta própria, senão o
 * passarinho destoa do mundo em volta dele.
 */
const COMMON = { K: P.ink, Y: '#252422', L: '#363432' };
const SPECIES: ReadonlyArray<Readonly<Record<string, string>>> = [
  // Pardal: boné cinza, bochecha clara, dorso castanho, asa escura com a barra branca.
  { ...COMMON, H: P.greyDk, F: P.pale, B: P.bark, W: P.barkDk, w: P.bone, C: P.boneDk, b: P.bone, T: P.barkDk },
  // Pisco: pardo em cima, a cara e o peito laranja.
  { ...COMMON, H: P.fur, F: P.orange, B: P.fur, W: P.furDk, w: P.sand, C: P.orange, b: P.bone, T: P.furDk },
  // Chapim: boné azul, bochecha branca, dorso de musgo, asa azul, peito amarelo.
  { ...COMMON, H: P.sky, F: P.bone, B: P.moss, W: P.sky, w: P.ice, C: P.yellow, b: P.yellowHi, T: P.sky },
];

const key = (s: number, f: Frame): string => `bird-${s}-${f}`;
let registered = false;
const register = (): void => {
  if (registered) return;
  SPECIES.forEach((legend, s) => {
    for (const f of FRAME_NAMES) sprite(key(s, f), FRAMES[f], legend);
  });
  flushTextures();
  registered = true;
};

type Mode = 'arriving' | 'ground' | 'fleeing' | 'crossing';
interface Bird {
  bb: Billboard3D;
  species: number;
  mode: Mode;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  tx: number; ty: number;
  timer: number;
  frame: Frame;
  flap: number;
}

/** O herói a menos disto espanta o bando. */
const FLUSH_DIST = 2.4;
const GROUND_BIRDS = 4;
const FLOCK_SIZE = 6;
/** Tamanho de um passarinho na tela (tiles). */
const BIRD_W = W / 16;
const BIRD_H = H / 16;
const TINT = 0xbcb8b0;

export interface BirdHost {
  heroAt: () => { x: number; y: number };
  /** O passarinho pode pousar aqui: chão livre, sem água, sem parede. */
  canLand: (x: number, y: number) => boolean;
  /** Quanta chuva está caindo (0..1). */
  rain: () => number;
}

export class BirdLife {
  private readonly birds: Bird[] = [];
  private clock = 0;
  /** Quando o próximo bandinho desce para ciscar (ms do relógio interno). */
  private nextLanding = 2500;
  /** Quando o próximo bando cruza o céu. */
  private nextFlock = 9000;
  private seed = 11;
  /** Quantas vezes um bando foi espantado (a janela do playtest). */
  public flushes = 0;

  public constructor(private readonly scene: Engine.Scene, private readonly host: BirdHost) {
    register();
    scene.events.on(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
  }

  /** Os pássaros agora (a janela do playtest). */
  public get list(): ReadonlyArray<{ mode: Mode; x: number; y: number; z: number }> {
    return this.birds.map((b) => ({ mode: b.mode, x: b.x, y: b.y, z: b.z }));
  }

  private rand(): number {
    this.seed += 1;
    const s = Math.sin(this.seed * 127.1 + this.clock * 0.001) * 43758.5453;
    return s - Math.floor(s);
  }

  /** De dia (das 6h às 18h) e sem chuva forte. */
  private awake(): boolean {
    const t = getTimeOfDay();
    return t > 0.26 && t < 0.74 && this.host.rain() < 0.35;
  }

  private make(species: number, mode: Mode, x: number, y: number, z: number): Bird {
    const bb = world3d().addBillboard(key(species, 'stand'), 0, { groundShadow: { rx: 0.14, rz: 0.06, alpha: 0.35 } })
      .setDisplaySize(BIRD_W, BIRD_H)
      .setTint(TINT);
    const b: Bird = { bb, species, mode, x, y, z, vx: 0, vy: 0, vz: 0, tx: x, ty: y, timer: 0, frame: 'stand', flap: this.rand() * 10 };
    this.birds.push(b);
    return b;
  }

  /** Um bandinho desce para ciscar num chão livre perto do herói (na tela), vindo voando de longe. */
  private land(): void {
    const hero = this.host.heroAt();
    for (let tries = 0; tries < 30; tries += 1) {
      const ang = this.rand() * Math.PI * 2;
      const d = 3.5 + this.rand() * 3.5;
      const cx = Math.round(hero.x + Math.cos(ang) * d);
      const cy = Math.round(hero.y + Math.sin(ang) * d * 0.6);
      if (!this.host.canLand(cx, cy)) continue;
      const species = Math.floor(this.rand() * SPECIES.length);
      const n = 3 + Math.floor(this.rand() * 2);
      // Chegam pelo lado de LÁ do pouso, longe do herói: vindo pelo lado dele, a rota passava perto e o bando se
      // espantava antes de pousar.
      const from = cx >= hero.x ? 1 : -1;
      for (let i = 0; i < Math.min(n, GROUND_BIRDS); i += 1) {
        const b = this.make(species, 'arriving', cx + from * (7 + this.rand() * 2), cy - 1 - this.rand(), 3 + this.rand());
        b.tx = cx + (this.rand() - 0.5) * 0.8;
        b.ty = cy + (this.rand() - 0.5) * 0.6;
      }
      return;
    }
  }

  /** Um bando cruza o céu, de um lado ao outro do quadro, em formação solta. */
  private flock(): void {
    const hero = this.host.heroAt();
    // Os bandos cruzam só o céu da mata (world/biomeLife), como os que descem para ciscar.
    if (!isLifeHome('birds', hero.x, hero.y)) return;
    const dir = this.rand() < 0.5 ? -1 : 1;
    const species = Math.floor(this.rand() * SPECIES.length);
    const y = hero.y - 1 - this.rand() * 3;
    for (let i = 0; i < FLOCK_SIZE; i += 1) {
      const b = this.make(species, 'crossing', hero.x - dir * (11 + i * 0.6 + this.rand()), y + (this.rand() - 0.5) * 1.5, 1.2 + this.rand() * 0.4);
      b.vx = dir * (0.0042 + this.rand() * 0.0006);
      b.flap = i * 1.7;
    }
  }

  /** O quadro, medido (debug/Profiler: seção `life.birds`; desligado, não custa nada). */
  private onFrame(): void {
    profiler.begin('life.birds');
    this.frameTick();
    profiler.end('life.birds');
  }

  private frameTick(): void {
    const delta = Math.min(50, this.scene.game.loop.delta);
    this.clock += delta;
    const awake = this.awake();
    const hero = this.host.heroAt();
    const grounded = this.birds.filter((b) => b.mode === 'ground' || b.mode === 'arriving');
    if (awake && grounded.length === 0 && this.clock > this.nextLanding) this.land();
    if (awake && this.clock > this.nextFlock && !this.birds.some((b) => b.mode === 'crossing')) {
      this.flock();
      this.nextFlock = this.clock + 25000 + this.rand() * 35000;
    }
    // O espanto: o herói chegou perto de um do bando (ou anoiteceu, ou a chuva apertou) — todos levantam juntos.
    const scared = grounded.some((b) => Math.hypot(b.x - hero.x, b.y - hero.y) < FLUSH_DIST) || (!awake && grounded.length > 0);
    if (scared) {
      this.flushes += 1;
      for (const b of grounded) {
        const away = Math.atan2(b.y - hero.y, b.x - hero.x) + (this.rand() - 0.5) * 0.8;
        b.mode = 'fleeing';
        b.vx = Math.cos(away) * 0.004;
        b.vy = Math.sin(away) * 0.0025;
        b.vz = 0.0035 + this.rand() * 0.001;
      }
      this.nextLanding = this.clock + 9000 + this.rand() * 9000;
    }
    for (const b of this.birds) this.step(b, delta);
    // Quem foi embora some.
    for (let i = this.birds.length - 1; i >= 0; i -= 1) {
      const b = this.birds[i];
      const far = Math.abs(b.x - hero.x) > 14 || Math.abs(b.y - hero.y) > 10;
      if ((b.mode === 'fleeing' || b.mode === 'crossing') && far) {
        b.bb.destroy();
        this.birds.splice(i, 1);
      }
    }
  }

  private step(b: Bird, delta: number): void {
    b.flap += delta / 1000;
    switch (b.mode) {
      case 'arriving': {
        // Desce em arco até o ponto de pouso, batendo asa.
        const dx = b.tx - b.x;
        const dy = b.ty - b.y;
        const d = Math.hypot(dx, dy);
        const speed = 0.0045 * delta;
        if (d < speed + 0.02 && b.z < 0.15) {
          b.x = b.tx; b.y = b.ty; b.z = 0;
          b.mode = 'ground';
          b.timer = 300 + this.rand() * 800;
          b.frame = 'stand';
          break;
        }
        if (d > 0.01) { b.x += (dx / d) * Math.min(d, speed); b.y += (dy / d) * Math.min(d, speed); }
        b.z = Math.max(0, Math.min(b.z, d * 0.5));
        b.bb.setFlipX(dx < 0);
        b.frame = Math.floor(b.flap * 14) % 2 ? 'up' : 'down';
        break;
      }
      case 'ground': {
        // Bica, pula, vira: cada passarinho no seu tempo.
        b.timer -= delta;
        if (b.z > 0) {
          b.z = Math.max(0, b.z + b.vz * delta);
          b.vz -= 0.00002 * delta;
          b.x += b.vx * delta;
          b.y += b.vy * delta;
        }
        if (b.timer <= 0) {
          const r = this.rand();
          if (r < 0.5) { b.frame = 'peck'; b.timer = 180 + this.rand() * 250; }
          else if (r < 0.8) {
            // O pulinho: um saltinho para o lado, se o chão ali é livre.
            const dir = this.rand() < 0.5 ? -1 : 1;
            const nx = b.x + dir * (0.12 + this.rand() * 0.12);
            if (this.host.canLand(Math.round(nx), Math.round(b.y))) {
              b.vx = (nx - b.x) / 200; b.vy = (this.rand() - 0.5) * 0.0004; b.vz = 0.002; b.z = 0.001;
              b.bb.setFlipX(dir < 0);
            }
            b.frame = 'stand'; b.timer = 220 + this.rand() * 300;
          } else { b.frame = 'stand'; b.bb.setFlipX(this.rand() < 0.5); b.timer = 400 + this.rand() * 900; }
        } else if (b.frame === 'peck' && b.timer < 90) b.frame = 'stand';
        break;
      }
      case 'fleeing': {
        // Sobe batendo asa rápido, para longe do herói.
        b.x += b.vx * delta;
        b.y += b.vy * delta;
        b.z += b.vz * delta;
        b.vz = Math.max(0.0008, b.vz - 0.000004 * delta);
        // Não sobem além de ~1,6 tile: mais alto, perto da câmera, viravam borrões enormes.
        b.z = Math.min(b.z, 1.6);
        b.bb.setFlipX(b.vx < 0);
        b.frame = Math.floor(b.flap * 18) % 2 ? 'up' : 'down';
        break;
      }
      case 'crossing': {
        // O voo ondulado: ~0,45 s batendo asa (sobe um pouco), ~0,35 s de asa fechada (cai um pouco).
        const cycle = b.flap % 0.8;
        const flapping = cycle < 0.45;
        b.x += b.vx * delta;
        b.z = Math.min(1.7, Math.max(1.1, b.z + (flapping ? 0.0006 : -0.0008) * delta));
        b.bb.setFlipX(b.vx < 0);
        b.frame = flapping ? (Math.floor(b.flap * 16) % 2 ? 'up' : 'down') : 'glide';
        break;
      }
      default:
        break;
    }
    b.bb.setTexture(key(b.species, b.frame)).setPosition(b.x, b.y).setElevation(b.z);
  }

  /** Playtest: todos vão embora agora (o próximo bandinho desce onde o herói estiver). */
  public clear(): void {
    for (const b of this.birds) b.bb.destroy();
    this.birds.length = 0;
    this.nextLanding = 0;
  }

  public destroy(): void {
    this.scene.events.off(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
    for (const b of this.birds) b.bb.destroy();
    this.birds.length = 0;
  }
}
