import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { skyNoiseTexture } from './atmosphere';
import { DAY_SKY, SKY_KEYS, SKY_TRACK, skyMomentsAt } from './skyPreset';
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

describe('a hora do dia (a trilha de momentos)', () => {
  const skyAt = (time: number): World3DParams => {
    const params = defaultWorld3DParams();
    const host = { params, moonLight: new THREE.DirectionalLight(), moonCastRotY: 0 };
    new WorldLook(host as never).applySky(time);
    return params;
  };
  /** O céu numa hora do relógio (0 a 24). */
  const at = (hour: number): World3DParams => skyAt(hour / 24);
  const blue = (css: string): number => new THREE.Color(css).b;
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

  it('com o sol rente ao horizonte a sombra é comprida e o ar acende, de manhã e de tarde', () => {
    for (const time of [0.26, 0.74]) {
      const low = skyAt(time);
      expect(low.golden).toBeGreaterThan(0.95);
      expect(low.moonShadowLength).toBeGreaterThan(2);
      expect(low.air).toBeGreaterThan(noonAir() * 1.5);
    }
  });

  it('nenhuma hora do dia acende uma auréola presa ao herói', () => {
    const power = Array.from({ length: 96 }, (_, i) => skyAt(i / 96))
      .map(({ heroLight, heroSight, heroSightGlow }) => Math.max(heroLight, heroSight, heroSightGlow));
    expect(Math.max(...power)).toBe(0);
  });

  it('o peso do ouro sobe e desce sem degrau (é dele a bruma do mar e o céu do mar)', () => {
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

  it('a manhã não é a tarde, e o amanhecer não é o entardecer', () => {
    // 9h30 e 14h30 têm o sol na MESMA altura: era o mesmo quadro. Agora a manhã é mais fria (mais azul na luz).
    const morning = at(9.5);
    const afternoon = at(14.5);
    expect(blue(morning.moonColor)).toBeGreaterThan(blue(afternoon.moonColor) + 0.1);
    expect(morning.haze).toBeLessThan(afternoon.haze);
    // O sol rente das duas pontas: o nascer é rosa, o pôr é fogo; e o lago não é o mesmo.
    const sunrise = at(6.25);
    const sunset = at(17.8);
    expect(blue(sunrise.airColor)).toBeGreaterThan(blue(sunset.airColor) + 0.1);
    expect(sunrise.waterSkyColor).not.toBe(sunset.waterSkyColor);
    // E os dois crepúsculos: a aurora e o arrebol têm cada um a sua distância.
    expect(at(5.7).skyColor).not.toBe(at(18.4).skyColor);
  });

  it('com o sol abaixo do horizonte quase não há sombra de sol: a aurora e o crepúsculo são luz do céu', () => {
    for (const hour of [5.7, 18.4]) {
      const sky = at(hour);
      expect(sky.moonShadowAlpha).toBeLessThan(0.1);
      expect(sky.ambient).toBeGreaterThan(sky.moon * 3);
    }
  });

  it('a trilha está em ordem de hora, começa e acaba na noite, e só escreve knob e cor que existem', () => {
    const knobs = factory as unknown as Record<string, number | string>;
    for (let i = 1; i < SKY_TRACK.length; i++) expect(SKY_TRACK[i].at).toBeGreaterThan(SKY_TRACK[i - 1].at);
    expect(SKY_TRACK[0].at).toBe(0);
    expect(Object.keys(SKY_TRACK[0].sky)).toHaveLength(0);
    expect(Object.keys(SKY_TRACK[SKY_TRACK.length - 1].sky)).toHaveLength(0);
    for (const moment of SKY_TRACK) {
      for (const [key, value] of Object.entries(moment.sky)) {
        expect(typeof value, `${moment.name}.${key}`).toBe(typeof knobs[key]);
        if (typeof value === 'string') expect(value, `${moment.name}.${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    // O meio-dia da trilha é a tabela do dia ela mesma; e a volta da meia-noite cai no patamar da noite.
    expect(skyMomentsAt(0.5).from.sky).toBe(DAY_SKY);
    expect(skyMomentsAt(0.99).to).toBe(SKY_TRACK[0]);
  });

  it('o quadro anda sem degrau: em um minuto de relógio nenhum knob salta', () => {
    const numeric = SKY_KEYS.filter((key) => typeof factory[key] === 'number');
    const sky = Array.from({ length: 1441 }, (_, minute) => skyAt(minute / 1440) as unknown as Record<string, number>);
    for (const key of numeric) {
      const values = sky.map((s) => s[key]);
      const range = Math.max(...values) - Math.min(...values);
      for (let i = 1; i < values.length; i++) {
        expect(Math.abs(values[i] - values[i - 1]), `${key} às ${(i / 60).toFixed(2)}h`).toBeLessThanOrEqual(range * 0.05 + 1e-9);
      }
    }
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
