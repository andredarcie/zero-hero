// OS ANÉIS NA ÁGUA (pedido do autor, 2026-11-11: "faça o herói interagir... um efeito relaxante e satisfatório", a
// mesma receita do capim que abre). Quem anda na beira de um rio ou de um lago, ou atravessa o vau, deixa um anel na
// água a cada passo: ele nasce perto dos pés e se abre devagar até sumir, em pixel de arte inteiro.
//
// Como: cada passo grava um slot (x, z, a hora no relógio da água, força) num uniform, como a esteira do capim
// (decorSway.ts); o shader da água (pixelArtLight, `worldFx: 'seaFlow'`) desenha os anéis por cima da cor. Nada de
// malha nova, nada de luz, nenhum programa novo além do da água.

import * as THREE from 'three';

/** Quantos anéis vivem ao mesmo tempo (o mais velho cede o lugar). */
export const WATER_RIPPLE_SLOTS = 8;
/** Quanto um anel vive, e quão depressa ele se abre (tiles por segundo). */
const RIPPLE_LIFE = 1.9;
const RIPPLE_SPEED = 0.7;
/** Um passo a cada tanto de chão andado; um salto maior (teleporte, cena) não deixa anel. */
const STEP_TILES = 0.45;
const JUMP_TILES = 3;
/** A beira: o corpo a até esta distância da água (em tiles, da borda do tile de água) larga anel nela. */
const SHORE_REACH = 0.7;

export const waterRipplesUniform: THREE.IUniform<THREE.Vector4[]> = {
  value: Array.from({ length: WATER_RIPPLE_SLOTS }, () => new THREE.Vector4(0, 0, -100, 0)),
};

/**
 * Por cima da cor final da água (depois da luz, como o brilho): dois anéis por passo, o segundo um pouco atrás, numa
 * faixa de um pixel e meio que clareia a água para a cor da espuma e some com a idade. Em degraus de pixel (o ponto é
 * a célula de 1/16 de tile) e em três tons, como a espuma do mar.
 */
export const WATER_RIPPLE_GLSL = /* glsl */ `
  {
    vec2 zhRp = (floor(vWorldFxPos.xz * 16.0) + 0.5) / 16.0;
    float zhRing = 0.0;
    for (int zhI = 0; zhI < ${WATER_RIPPLE_SLOTS}; zhI++) {
      vec4 zhR = uWaterRipples[zhI];
      if (zhR.w <= 0.0) continue;
      float zhAge = uFlowTime - zhR.z;
      if (zhAge < 0.0 || zhAge > ${RIPPLE_LIFE.toFixed(2)}) continue;
      float zhD = length(zhRp - zhR.xy);
      float zhFade = 1.0 - zhAge / ${RIPPLE_LIFE.toFixed(2)};
      zhFade *= zhFade;
      float zhA = 1.0 - smoothstep(0.04, 0.1, abs(zhD - (0.1 + zhAge * ${RIPPLE_SPEED.toFixed(2)})));
      float zhB = 1.0 - smoothstep(0.035, 0.09, abs(zhD - max(0.0, zhAge - 0.35) * ${RIPPLE_SPEED.toFixed(2)}));
      zhRing = max(zhRing, max(zhA, zhB * 0.6) * zhFade * zhR.w);
    }
    zhRing = floor(zhRing * 3.0 + 0.35) / 3.0;
    // a água aqui ainda está na faixa alta (antes do tone mapping): clarear na proporção dela é o que aparece de dia e
    // de noite — uma cor fixa de espuma ficava abaixo da água acesa pelo sol e sumia
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 2.0 + vec3(0.03, 0.06, 0.06), zhRing);
  }
`;

/** O que os anéis usam do mundo: os corpos, onde há água e o relógio da água. */
export interface WaterRipplesHost {
  actors(): Iterable<THREE.Object3D>;
  isWater(x: number, z: number): boolean;
  /** O relógio da água (`flowTimeUniform`), em segundos. */
  now(): number;
}

/**
 * O ponto da água onde o passo cai: debaixo do corpo, se ele está NA água (o vau), ou o ponto da água mais perto dele
 * na beira, se ela está a menos de SHORE_REACH; senão, nenhum. Pura, para o teste.
 */
export const rippleSpot = (x: number, z: number, isWater: (tx: number, tz: number) => boolean): { x: number; z: number } | null => {
  const tx = Math.round(x);
  const tz = Math.round(z);
  if (isWater(tx, tz)) return { x, z };
  let best: { x: number; z: number } | null = null;
  let bestD = SHORE_REACH;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx === 0 && dz === 0) || !isWater(tx + dx, tz + dz)) continue;
      // o ponto do tile de água mais perto do corpo, um pouco para dentro (o anel não nasce em cima do barranco)
      const px = Math.min(tx + dx + 0.4, Math.max(tx + dx - 0.4, x));
      const pz = Math.min(tz + dz + 0.4, Math.max(tz + dz - 0.4, z));
      const d = Math.hypot(px - x, pz - z);
      if (d < bestD) { bestD = d; best = { x: px, z: pz }; }
    }
  }
  return best;
};

export class WaterRipples {
  private readonly lastStep = new WeakMap<THREE.Object3D, { x: number; z: number }>();
  private next = 0;

  public constructor(private readonly host: WaterRipplesHost) {}

  /** A cada quadro: cada corpo que andou um passo perto da água larga um anel. */
  public update(): void {
    for (const o of this.host.actors()) {
      if (!o.visible || !o.parent) continue;
      const { x, z } = o.position;
      const last = this.lastStep.get(o);
      if (!last) { this.lastStep.set(o, { x, z }); continue; }
      const moved = Math.hypot(x - last.x, z - last.z);
      if (moved < STEP_TILES) continue;
      last.x = x;
      last.z = z;
      if (moved > JUMP_TILES) continue;
      const spot = rippleSpot(x, z, (tx, tz) => this.host.isWater(tx, tz));
      if (!spot) continue;
      waterRipplesUniform.value[this.next].set(spot.x, spot.z, this.host.now(), 1);
      this.next = (this.next + 1) % WATER_RIPPLE_SLOTS;
    }
  }
}
