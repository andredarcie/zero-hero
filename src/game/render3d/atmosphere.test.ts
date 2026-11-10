import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { skyNoiseTexture } from './atmosphere';
import { GOLDEN_SKY, DAY_SKY } from './skyPreset';
import { defaultWorld3DParams } from './worldParams';
import { WorldLook, type World3DParams } from './world/WorldLook';
import { WaterIndex } from './waterIndex';

describe('o ruído do céu', () => {
  const tex = skyNoiseTexture();
  const data = tex.image.data as Uint8Array;
  const size = tex.image.width;
  const at = (x: number, y: number, c: number): number => data[(((y % size) + size) % size * size + (((x % size) + size) % size)) * 4 + c];

  it('é o mesmo a cada leitura (o mundo é determinístico) e se repete sem emenda', () => {
    expect(skyNoiseTexture()).toBe(tex);
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    // A borda direita continua na esquerda: o salto ali não é maior que o salto entre dois vizinhos quaisquer.
    let inner = 0;
    let seam = 0;
    for (let y = 0; y < size; y++) {
      inner = Math.max(inner, Math.abs(at(40, y, 0) - at(41, y, 0)));
      seam = Math.max(seam, Math.abs(at(size - 1, y, 0) - at(0, y, 0)), Math.abs(at(y, size - 1, 0) - at(y, 0, 0)));
    }
    expect(seam).toBeLessThanOrEqual(inner + 12);
  });

  it('tem céu limpo e nuvem (usa a faixa de valores, não fica num cinza só)', () => {
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < size * size; i++) {
      lo = Math.min(lo, data[i * 4]);
      hi = Math.max(hi, data[i * 4]);
    }
    expect(hi - lo).toBeGreaterThan(110);
  });
});

describe('a hora do dia (noite, dia e hora dourada)', () => {
  const skyAt = (time: number): World3DParams => {
    const params = defaultWorld3DParams();
    const host = { params, moonLight: new THREE.DirectionalLight(), moonCastRotY: 0 };
    new WorldLook(host as never).applySky(time);
    return params;
  };
  const factory = defaultWorld3DParams();

  it('a meia-noite é a tabela de fábrica, sem dia e sem ouro', () => {
    const night = skyAt(0);
    expect(night.daylight).toBe(0);
    expect(night.golden).toBe(0);
    expect(night.lift).toBe(factory.lift);
    expect(night.shadowTint).toBe(factory.shadowTint);
    expect(night.stars).toBe(1);
  });

  it('o meio-dia é o DAY_SKY inteiro, sem ouro', () => {
    const noon = skyAt(0.5);
    expect(noon.daylight).toBe(1);
    expect(noon.golden).toBe(0);
    for (const key of Object.keys(DAY_SKY) as Array<keyof World3DParams>) expect(noon[key]).toBe(DAY_SKY[key]);
    expect(noon.stars).toBe(0);
  });

  it('com o sol rente ao horizonte a hora dourada manda, de manhã e de tarde', () => {
    for (const time of [0.26, 0.74]) {
      const gold = skyAt(time);
      expect(gold.golden).toBeGreaterThan(0.95);
      expect(gold.moonShadowLength).toBeCloseTo(GOLDEN_SKY.moonShadowLength as number, 1);
      expect(gold.air).toBeGreaterThan(noonAir() * 2);
      // A vista do herói é um desenho do escuro: com o sol no céu ela não existe.
      expect(gold.heroSight).toBeLessThan(0.02);
    }
  });

  it('o ouro sobe e desce sem degrau: a manhã inteira carrega um resto dele', () => {
    let prev = skyAt(0.27).golden;
    for (let t = 0.28; t <= 0.5; t += 0.01) {
      const g = skyAt(t).golden;
      expect(g).toBeLessThanOrEqual(prev + 1e-9);
      expect(prev - g).toBeLessThan(0.2);
      prev = g;
    }
    expect(skyAt(0.33).golden).toBeGreaterThan(0.05);
    expect(skyAt(0.42).golden).toBe(0);
  });

  const noonAir = (): number => skyAt(0.5).air;
});

describe('o índice de água do espelho', () => {
  const water = new WaterIndex();
  water.add(10, 20);
  water.add(11, 20);

  it('uma coisa em pé reflete quando há água logo ao sul (até três tiles), e só então', () => {
    expect(water.southOf(10, 19)).toBe(true);
    expect(water.southOf(10, 17)).toBe(true);
    expect(water.southOf(12, 18)).toBe(true); // um tile para o lado ainda pega a margem
    expect(water.southOf(10, 16)).toBe(false);
    expect(water.southOf(10, 21)).toBe(false); // a água ao NORTE dela não a reflete para a câmera
    expect(water.southOf(14, 19)).toBe(false);
  });

  it('só há água "na tela" com um tile de água dentro da área vista (descontada a folga)', () => {
    const view = (minX: number, maxX: number, minZ: number, maxZ: number) => ({ minX, maxX, minZ, maxZ });
    expect(water.inView(view(5, 15, 15, 25))).toBe(true);
    expect(water.inView(view(30, 40, 15, 25))).toBe(false);
    // No mesmo balde de 8×8, mas fora da área: o balde sozinho diria que sim.
    expect(water.inView(view(12.5, 15.5, 16, 24))).toBe(false);
    expect(new WaterIndex().inView(view(0, 50, 0, 50))).toBe(false);
  });
});
