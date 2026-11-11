import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { setWorldData } from '@/game/world/WorldData';
import { STAND_RUSTLE_SLOTS, STAND_WAKE_SLOTS, standRustleUniform, standWakeUniform } from '../decorSway';
import { StandingDecor, type StandingDecorHost } from './StandingDecor';

// A luz do chão em que cada peça pisa (groundShadeAt) lê o bioma e o relevo do mapa de verdade.
beforeAll(() => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  setWorldData(JSON.parse(fs.readFileSync(path.resolve(here, '../../../../public/world.json'), 'utf8')));
});

// O PISÃO PELO SHADER: com a grama em fios, um tile vira dezenas de quads espalhados pela malha, e o pisão deixou de
// ser um atributo reescrito a cada quadro. Quem diz ao shader que tile sacode é um slot de uniform (decorSway.ts).

const makeDecor = (over: Partial<StandingDecorHost> = {}): StandingDecor => new StandingDecor({
  addMesh: () => undefined, actors: () => [], focus: () => ({ x: 0, z: 0 }), stand: () => 1, now: () => 0, ...over,
});
const slots = (): THREE.Vector4[] => standRustleUniform.value;

describe('o pisão da decoração em pé', () => {
  it('pisar um tile de planta liga um slot com o centro do tile, e o slot apaga quando o farfalhar acaba', () => {
    const d = makeDecor();
    d.bake([{ x: 5, z: 6, frame: 7 }, { x: 8, z: 6, frame: 13 }], new Set(), new THREE.MeshBasicMaterial());
    d.rustle(5, 6);
    d.update(0.05);
    expect([slots()[0].x, slots()[0].y, slots()[0].w]).toEqual([5, 6, 1]);
    expect(slots()[0].z).toBeGreaterThan(0);
    for (let i = 1; i < STAND_RUSTLE_SLOTS; i++) expect(slots()[i].w).toBe(0);
    d.update(10);
    expect(slots().every((s) => s.w === 0)).toBe(true);
  });

  it('o que é rígido não farfalha, e o tile sem decoração também não', () => {
    const d = makeDecor();
    d.bake([{ x: 8, z: 6, frame: 13 }], new Set(), new THREE.MeshBasicMaterial());
    d.rustle(8, 6);
    d.rustle(20, 20);
    d.update(0.05);
    expect(slots().every((s) => s.w === 0)).toBe(true);
  });

  it('com mais tiles pisados que slots, ficam os mais novos', () => {
    const d = makeDecor();
    const tiles = Array.from({ length: STAND_RUSTLE_SLOTS + 2 }, (_, i) => ({ x: i * 2, z: 3, frame: 7 }));
    d.bake(tiles, new Set(), new THREE.MeshBasicMaterial());
    for (const t of tiles) {
      d.rustle(t.x, t.z);
      d.update(0.02);
    }
    const lit = slots().filter((s) => s.w > 0).map((s) => s.x).sort((a, c) => a - c);
    expect(lit).toEqual(tiles.slice(-STAND_RUSTLE_SLOTS).map((t) => t.x));
  });

  it('a cova cavada apaga a decoração do tile e o pisão dele', () => {
    const d = makeDecor();
    d.bake([{ x: 5, z: 6, frame: 7 }], new Set(), new THREE.MeshBasicMaterial());
    d.rustle(5, 6);
    d.clearTile(5, 6);
    d.update(0.05);
    expect(slots().every((s) => s.w === 0)).toBe(true);
  });
});

describe('a esteira de quem anda pela grama', () => {
  /** Um corpo na cena, que o teste anda, e o relógio da água. */
  const setup = (): { body: THREE.Object3D; clock: { t: number }; decor: StandingDecor; wake: () => THREE.Vector4[] } => {
    const scene = new THREE.Scene();
    const body = new THREE.Object3D();
    scene.add(body);
    const clock = { t: 10 };
    for (const s of standWakeUniform.value) s.set(0, 0, -100, 0);
    const decor = makeDecor({ actors: () => [body], now: () => clock.t });
    return { body, clock, decor, wake: () => standWakeUniform.value.filter((s) => s.w > 0) };
  };

  it('cada meio tile andado larga um passo, com a hora dele no relógio da água', () => {
    const { body, clock, decor, wake } = setup();
    decor.update(0.016); // o primeiro quadro só conhece o corpo
    expect(wake()).toHaveLength(0);
    body.position.set(0.3, 0, 0);
    decor.update(0.016);
    expect(wake()).toHaveLength(0); // ainda não andou meio tile
    clock.t = 11;
    body.position.set(0.6, 0, 0);
    decor.update(0.016);
    expect(wake().map((s) => [s.x, s.y, s.z])).toEqual([[0.6, 0, 11]]);
  });

  it('o salto de um teleporte não abre anel', () => {
    const { body, decor, wake } = setup();
    decor.update(0.016);
    body.position.set(20, 0, 20);
    decor.update(0.016);
    expect(wake()).toHaveLength(0);
  });

  it('a esteira é um anel de slots: o passo novo toma o lugar do mais velho', () => {
    const { body, clock, decor, wake } = setup();
    decor.update(0.016);
    for (let i = 1; i <= STAND_WAKE_SLOTS + 2; i++) {
      clock.t = i;
      body.position.set(i * 0.6, 0, 0);
      decor.update(0.016);
    }
    const times = wake().map((s) => s.z).sort((a, c) => a - c);
    expect(times).toHaveLength(STAND_WAKE_SLOTS);
    expect(times[0]).toBe(3); // os dois primeiros passos já cederam o lugar
  });

  it('a passada da frente divide os buffers da malha, e é desenhada depois dos personagens', () => {
    const meshes: THREE.Mesh[] = [];
    const decor = makeDecor({ addMesh: (m) => { meshes.push(m); } });
    decor.bake([{ x: 5, z: 6, frame: 7 }], new Set(), new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial());
    expect(meshes.map((m) => m.name)).toEqual(['terrain-decor', 'terrain-decor-front']);
    const [main, front] = meshes;
    expect(front.geometry.getAttribute('position')).toBe(main.geometry.getAttribute('position'));
    expect(front.geometry.getIndex()).toBe(main.geometry.getIndex());
    expect(front.renderOrder).toBeGreaterThan(0);
    expect(main.renderOrder).toBeLessThan(0);
  });

  it('a passada da frente só desenha a fatia da malha logo à frente dos pés de quem está no foco', () => {
    const meshes: THREE.Mesh[] = [];
    const scene = new THREE.Scene();
    const hero = new THREE.Object3D();
    scene.add(hero);
    // três tiles de capim em fila, de norte a sul; o herói no do meio
    const decor = makeDecor({ addMesh: (m) => { meshes.push(m); }, actors: () => [hero] });
    const tiles = [5, 6, 7].map((z) => ({ x: 5, z, frame: 7 }));
    decor.bake(tiles, new Set(), new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial());
    const [main, front] = meshes;
    expect(front.geometry.drawRange.count).toBe(0); // ninguém no foco ainda
    hero.position.set(5, 0, 6);
    decor.update(0.016);
    const { start, count } = front.geometry.drawRange;
    const index = main.geometry.getIndex() as THREE.BufferAttribute;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(index.count / 2);
    // cada fio da fatia tem o pé entre os pés do herói e 0,75 tile à frente deles
    const stand = main.geometry.getAttribute('aStand');
    const blade = main.geometry.getAttribute('aBlade');
    for (let k = start; k < start + count; k += 6) {
      const v = index.getX(k);
      if (blade.getX(v) === 0) continue; // a sombra de contato mede da borda norte dela
      expect(stand.getY(v)).toBeGreaterThan(6);
      expect(stand.getY(v)).toBeLessThanOrEqual(6.75);
    }
  });
});
