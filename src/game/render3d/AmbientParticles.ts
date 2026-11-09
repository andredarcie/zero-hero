import type * as THREE from 'three';

import { ParticleBatch, type ParticleField } from './ParticleBatch';

// OS QUATRO CAMPOS DO AR, num draw só (ver ParticleBatch): as brasas que sobem do fogo aceso mais perto, a poeira que
// boia em volta do herói, os vaga-lumes que moram no mato, e a névoa rente ao chão (de dia, pó dourado). Nenhum deles
// é luz THREE: são quads aditivos. A contagem de luzes do mundo é selada (ver World3D).

const EMBER_COUNT = 26;
const DUST_COUNT = 140;
const FIREFLY_COUNT = 44;
const MIST_COUNT = 48;
// A caixa em que o enxame vive, em tiles a partir do alvo da câmera. Um pouco maior que a tela:
// entrar no quadro voando é a metade do efeito, e um bicho que só existe dentro do enquadramento
// aparece do nada na borda.
const FIREFLY_BOX = 10;
/** Quanto um vaga-lume se afasta da moita que escolheu, em tiles. */
const FIREFLY_ROAM = 1.9;

/**
 * Distancia no chao. `Math.hypot` daria o mesmo numero, mas aloca um array de argumentos por
 * chamada — e as particulas pedem isto centenas de vezes por quadro (era o 5º maior gerador de
 * lixo do jogo).
 */
const planarDist = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};

interface EmberParticle { life: number; maxLife: number; vx: number; vy: number; vz: number }

/**
 * Um vaga-lume. `hx/hz` é a MOITA que ele escolheu (ele orbita ali, não a caixa da câmera), e o
 * resto é o voo: velocidade própria, um relógio até a próxima arrancada, e a fase/ritmo do
 * pisca. `settle` é o tempo até tentar achar mato de novo quando não há nenhum por perto.
 */
interface FireflyParticle {
  hx: number; hz: number;
  vx: number; vz: number;
  dart: number;
  blink: number; rate: number;
  settle: number;
  homed: boolean;
}

/** O fogo aceso mais perto do quadro (as brasas saem dele; a poeira brilha e a névoa abre em volta). */
export interface ParticleFire { worldX: number; worldY: number }

/** Os botões do ar (os mesmos do World3DParams): quanto de névoa e de vaga-lume, e quanto é dia. */
export interface ParticleKnobs { mist: number; fireflies: number; daylight: number }

export class AmbientParticles {
  private readonly batch: ParticleBatch;
  private readonly embers: ParticleField;
  private readonly emberState: EmberParticle[] = [];
  private readonly dust: ParticleField;
  private readonly dustSeed: Float32Array;
  private dustSeeded = false;
  private readonly fireflies: ParticleField;
  private readonly fireflySeed: Float32Array;
  private readonly fireflyState: FireflyParticle[] = [];
  private readonly mist: ParticleField;
  private readonly mistSeed: Float32Array;
  private atmosphereSeeded = false;

  /**
   * `greenTiles` são os tiles de vegetação da janela assada (x + z empacotados), onde o enxame pousa: o terreno os
   * enche e esvazia, e estas partículas só leem.
   */
  public constructor(scene: THREE.Scene, dot: THREE.Texture, private readonly greenTiles: readonly number[]) {
    // Os quatro campos ambientes saem num draw só, como quads (ver ParticleBatch).
    this.batch = new ParticleBatch(scene, EMBER_COUNT + DUST_COUNT + FIREFLY_COUNT + MIST_COUNT, dot);
    this.embers = this.batch.field(EMBER_COUNT, 0.12);
    for (let i = 0; i < EMBER_COUNT; i++) {
      this.emberState.push({ life: Math.random(), maxLife: 0.9 + Math.random() * 0.9, vx: 0, vy: 0, vz: 0 });
    }
    this.dust = this.batch.field(DUST_COUNT, 0.06);
    this.dustSeed = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      this.dust.pos[i * 3 + 1] = 0.2 + Math.random() * 2.4;
      this.dustSeed[i] = Math.random() * Math.PI * 2;
    }
    // Fireflies: bigger, brighter motes that hover knee-to-head high over the vegetation.
    // 0,18 tile: o bicho é um PONTO de luz, não uma bola. Ele nasceu em 0,16 (invisível), passou
    // por 0,34 (uma bolha amarela maior que um cogumelo — o relato foi "muito grande") e parou
    // aqui: o que o faz enxergar não é o tamanho, é o bloom em volta de um núcleo aceso.
    this.fireflies = this.batch.field(FIREFLY_COUNT, 0.18);
    this.fireflySeed = new Float32Array(FIREFLY_COUNT);
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      this.fireflySeed[i] = Math.random() * Math.PI * 2;
      this.fireflyState.push({
        hx: 0, hz: 0, vx: 0, vz: 0,
        dart: Math.random() * 2.5,
        blink: Math.random() * Math.PI * 2,
        // Cada um pisca no SEU ritmo: com um só, trinta bichos acendem no mesmo quadro e o
        // enxame vira um estrobo. O espalhamento é o que faz parecer trinta bichos.
        rate: 1.5 + Math.random() * 1.9,
        settle: Math.random() * 0.5,
        homed: false,
      });
    }
    // Mist: many large, dim, cool wisps clinging low to the ground in the dark.
    this.mist = this.batch.field(MIST_COUNT, 1.6);
    this.mistSeed = new Float32Array(MIST_COUNT);
    for (let i = 0; i < MIST_COUNT; i++) this.mistSeed[i] = Math.random() * Math.PI * 2;
  }

  /**
   * Um quadro do ar. `t` é o relógio do mundo em segundos (o do cintilar), `target` o alvo da câmera (as caixas
   * andam com ele). Embers rise from the nearest lit fire; dust drifts in the air around the hero.
   */
  public update(dt: number, t: number, target: { x: number; z: number }, fire: ParticleFire | null, knobs: ParticleKnobs): void {
    // First frame with a real camera target: spread the dust across a box around
    // the hero (before follow() runs camTarget is the origin, which would stack
    // every mote on one edge when it wraps).
    if (!this.dustSeeded) {
      for (let i = 0; i < DUST_COUNT; i++) {
        this.dust.pos[i * 3] = target.x + (Math.random() - 0.5) * 30;
        this.dust.pos[i * 3 + 2] = target.z + (Math.random() - 0.5) * 30;
      }
      this.dustSeeded = true;
    }
    if (!this.atmosphereSeeded) {
      for (let i = 0; i < FIREFLY_COUNT; i++) {
        this.fireflies.pos[i * 3 + 1] = -10; // fora do chão até achar mato (ver rehomeFirefly)
      }
      for (let i = 0; i < MIST_COUNT; i++) {
        this.mist.pos[i * 3] = target.x + (Math.random() - 0.5) * 30;
        this.mist.pos[i * 3 + 1] = 0.05 + Math.random() * 0.3;
        this.mist.pos[i * 3 + 2] = target.z + (Math.random() - 0.5) * 30;
      }
      this.atmosphereSeeded = true;
    }

    // Embers: reborn at the lit fire, fading amber as they climb. With no lit
    // fire in view they park below the ground (invisible) rather than pop.
    for (let i = 0; i < EMBER_COUNT; i++) {
      const p = this.emberState[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.life = 0;
        p.maxLife = 0.9 + Math.random() * 0.9;
        if (fire) {
          this.embers.pos[i * 3] = fire.worldX + (Math.random() - 0.5) * 0.35;
          this.embers.pos[i * 3 + 1] = 0.5 + Math.random() * 0.2;
          this.embers.pos[i * 3 + 2] = fire.worldY + (Math.random() - 0.5) * 0.35;
        } else {
          this.embers.pos[i * 3 + 1] = -10;
        }
        p.vx = (Math.random() - 0.5) * 0.35;
        p.vy = 0.9 + Math.random() * 0.7;
        p.vz = (Math.random() - 0.5) * 0.35;
      }
      this.embers.pos[i * 3] += p.vx * dt;
      this.embers.pos[i * 3 + 1] += p.vy * dt;
      this.embers.pos[i * 3 + 2] += p.vz * dt;
      const a = fire ? 1 - p.life / p.maxLife : 0;
      this.embers.col[i * 3] = 1.6 * a;
      this.embers.col[i * 3 + 1] = 0.75 * a;
      this.embers.col[i * 3 + 2] = 0.3 * a * a;
    }
    this.embers.mark();

    // Dust: a slow twinkling haze that stays boxed around the camera target and
    // glints brighter near the fire pool.
    const cx = target.x;
    const cz = target.z;
    for (let i = 0; i < DUST_COUNT; i++) {
      const s = this.dustSeed[i];
      let x = this.dust.pos[i * 3] + Math.sin(t * 0.35 + s) * 0.0009;
      let z = this.dust.pos[i * 3 + 2] + Math.cos(t * 0.28 + s) * 0.0009;
      // Wrap the drifting motes back into a box that follows the hero.
      if (x < cx - 15) x = cx + 15; else if (x > cx + 15) x = cx - 15;
      if (z < cz - 15) z = cz + 15; else if (z > cz + 15) z = cz - 15;
      this.dust.pos[i * 3] = x;
      this.dust.pos[i * 3 + 1] += Math.cos(t * 0.22 + s * 2.0) * 0.0011;
      this.dust.pos[i * 3 + 2] = z;
      const glow = fire
        ? Math.max(0.06, 1 - planarDist(x, z, fire.worldX, fire.worldY) / 9)
        : 0.1;
      const tw = 0.55 + 0.45 * Math.sin(t * 1.7 + s * 5.0);
      this.dust.col[i * 3] = 0.5 * glow * tw;
      this.dust.col[i * 3 + 1] = 0.42 * glow * tw;
      this.dust.col[i * 3 + 2] = 0.3 * glow * tw;
    }
    this.dust.mark();

    this.updateFireflies(dt, t, fire, cx, cz, knobs.fireflies);

    // Mist: slow cool wisps hugging the ground; thins right at the fire (heat burns
    // it off) so the lit clearing stays clear while the dark stays veiled.
    //
    // De DIA a mesma névoa é POEIRA: motes dourados boiando no ar batido de sol. É o mesmo campo
    // de partículas, com a mesma deriva e a mesma abertura junto do fogo — só a cor troca, porque
    // o que se vê boiando ao meio-dia não é vapor frio, é pó pegando luz. (Um segundo campo só
    // para isto seriam 48 Points a mais desenhados sempre, para metade deles estar sempre invisível.)
    const mistAmt = Math.max(0, knobs.mist);
    const dayMix = knobs.daylight;
    const mistR = 0.32 + (0.66 - 0.32) * dayMix;
    const mistG = 0.4 + (0.56 - 0.4) * dayMix;
    const mistB = 0.6 + (0.34 - 0.6) * dayMix;
    for (let i = 0; i < MIST_COUNT; i++) {
      const s = this.mistSeed[i];
      let x = this.mist.pos[i * 3] + Math.sin(t * 0.12 + s) * 0.004;
      let z = this.mist.pos[i * 3 + 2] + Math.cos(t * 0.09 + s * 1.4) * 0.004;
      if (x < cx - 16) x = cx + 16; else if (x > cx + 16) x = cx - 16;
      if (z < cz - 16) z = cz + 16; else if (z > cz + 16) z = cz - 16;
      this.mist.pos[i * 3] = x;
      this.mist.pos[i * 3 + 2] = z;
      const clear = fire ? Math.min(1, planarDist(x, z, fire.worldX, fire.worldY) / 4) : 1;
      const tw = 0.6 + 0.4 * Math.sin(t * 0.5 + s * 3.0);
      const a = mistAmt * 0.045 * clear * tw;
      this.mist.col[i * 3] = mistR * a;
      this.mist.col[i * 3 + 1] = mistG * a;
      this.mist.col[i * 3 + 2] = mistB * a;
    }
    this.mist.mark();
  }

  /**
   * O ENXAME. Ele mudou de dono: antes o vaga-lume só acendia dentro do halo de uma fogueira
   * ACESA, e no construtor de mundo (onde toda fogueira de carta nasce apagada) isso queria dizer
   * que ele não existia — a única luz do mundo era o acampamento. Agora quem o chama é o MATO:
   * cada bicho escolhe uma moita real da janela assada (`greenTiles`) e orbita ali. É uma regra
   * que o mundo ensina sem legenda — onde pisca, é verde — e é o que faz plantar flor numa carta
   * povoá-la de vaga-lume sem tocar em código.
   *
   * A fogueira não sumiu da conta: perto dela o enxame ADENSA (o brilho sobe), que é o resquício
   * da recompensa antiga sem ela ser a condição de existir.
   *
   * Nada aqui cria luz THREE: são Points aditivos. A lei do jogo é que a CONTAGEM de luzes está
   * selada — um vaga-lume que iluminasse o chão recompilaria o mundo inteiro (~550ms) na primeira
   * vez que acendesse.
   */
  private updateFireflies(dt: number, t: number, fire: ParticleFire | null, cx: number, cz: number, amountKnob: number): void {
    const amount = Math.max(0, amountKnob);
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const p = this.fireflyState[i];
      const px = this.fireflies.pos[i * 3];
      const pz = this.fireflies.pos[i * 3 + 2];

      // Longe demais do quadro (ou ainda sem casa): procura outra moita. O relógio existe para
      // que um mundo de pedra — onde a busca sempre falha — não pague a varredura todo quadro.
      const strayed = Math.abs(p.hx - cx) > FIREFLY_BOX || Math.abs(p.hz - cz) > FIREFLY_BOX;
      p.settle -= dt;
      if ((!p.homed || strayed) && p.settle <= 0) {
        p.settle = 0.45;
        this.rehomeFirefly(i, cx, cz);
      }
      if (!p.homed) {
        this.fireflies.pos[i * 3 + 1] = -10; // sem mato por perto não há vaga-lume: some inteiro
        this.fireflies.col[i * 3] = 0;
        this.fireflies.col[i * 3 + 1] = 0;
        this.fireflies.col[i * 3 + 2] = 0;
        continue;
      }

      // O voo: uma arrancada curta de vez em quando, atrito no resto do tempo e uma mola fraca
      // puxando de volta para a moita. Um seno puro (o que havia antes) lê como partícula; o que
      // lê como bicho é a mudança BRUSCA de direção entre trechos de deriva.
      p.dart -= dt;
      if (p.dart <= 0) {
        p.dart = 0.5 + Math.random() * 1.9;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 1.3;
        p.vx += Math.cos(angle) * speed;
        p.vz += Math.sin(angle) * speed;
      }
      const drag = Math.exp(-2.6 * dt);
      p.vx = p.vx * drag + (p.hx - px) * 1.5 * dt;
      p.vz = p.vz * drag + (p.hz - pz) * 1.5 * dt;
      let x = px + p.vx * dt;
      let z = pz + p.vz * dt;
      // A coleira: nunca mais que FIREFLY_ROAM da moita, ou o enxame se dissolve na tela.
      const dx = x - p.hx; const dz = z - p.hz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > FIREFLY_ROAM) {
        x = p.hx + (dx / dist) * FIREFLY_ROAM;
        z = p.hz + (dz / dist) * FIREFLY_ROAM;
        p.vx *= -0.35; p.vz *= -0.35;
      }
      this.fireflies.pos[i * 3] = x;
      this.fireflies.pos[i * 3 + 2] = z;
      // A altura acompanha a velocidade: quem corre, sobe. Sem isso o bicho voa numa mesa de
      // vidro, e é a subida na arrancada que dá volume ao enxame.
      const climb = Math.min(1, Math.sqrt(p.vx * p.vx + p.vz * p.vz) * 0.55);
      const s = this.fireflySeed[i];
      this.fireflies.pos[i * 3 + 1] = 0.3 + 0.35 * climb
        + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.7 + s * 1.7));

      // O pisca: aceso curto, apagado longo — a assinatura do bicho. `blink` corre no ritmo dele,
      // e o expoente é o que separa "acende e apaga" de "pulsa".
      p.blink += dt * p.rate;
      const pulse = Math.max(0, Math.sin(p.blink));
      const near = fire ? Math.max(0, 1 - planarDist(x, z, fire.worldX, fire.worldY) / 8) : 0;
      // O expoente 3 apagava o enxame: com ele o bicho passa ~85% do ciclo escuro, e com 44
      // deles espalhados numa caixa maior que a tela sobravam dois pontos por quadro. Quadrado
      // (mais um resto de brasa, que é o corpo dele visto de perto) mantém o pisca e devolve o
      // enxame — foi medido em foto, não no papel.
      const a = amount * (0.5 + 0.5 * near) * (0.12 + 0.88 * pulse * pulse);
      this.fireflies.col[i * 3] = 0.75 * a;
      this.fireflies.col[i * 3 + 1] = 1.0 * a;
      this.fireflies.col[i * 3 + 2] = 0.3 * a;
    }
    this.fireflies.mark();
  }

  /**
   * Sorteia uma moita dentro do quadro para este vaga-lume. Amostragem por REJEIÇÃO sobre o índice
   * inteiro da janela (que tem milhares de tiles) em vez de um índice espacial: são 18 tentativas
   * no pior caso, para no máximo 34 bichos, e só quando um deles perdeu a casa. Falhar é uma
   * resposta legítima — quer dizer "não há verde aqui", e o bicho fica invisível.
   */
  private rehomeFirefly(index: number, cx: number, cz: number): void {
    const p = this.fireflyState[index];
    const count = this.greenTiles.length / 2;
    p.homed = false;
    if (count === 0) return;
    for (let attempt = 0; attempt < 18; attempt++) {
      const t = Math.floor(Math.random() * count) * 2;
      const gx = this.greenTiles[t];
      const gz = this.greenTiles[t + 1];
      if (Math.abs(gx - cx) > FIREFLY_BOX || Math.abs(gz - cz) > FIREFLY_BOX) continue;
      p.hx = gx + (Math.random() - 0.5) * 0.6;
      p.hz = gz + (Math.random() - 0.5) * 0.6;
      p.vx = 0; p.vz = 0;
      p.homed = true;
      this.fireflies.pos[index * 3] = p.hx;
      this.fireflies.pos[index * 3 + 2] = p.hz;
      return;
    }
  }
}
