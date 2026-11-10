// AS FOTOS DE REFERÊNCIA (`visual-ref`, `aa-truth`): o mundo parado numa pose canônica e andado à mão, para que o
// mesmo código duas vezes dê os mesmos pixels — o controle que faz um diff depois significar alguma coisa.
//
// Semear o Math.random (o cenário faz isso antes do jogo carregar, e deixa `window.__reseed`) não basta: o jogo roda
// solto um instante no boot, e cada quadro disso gasta o gerador e adianta os acumuladores do fogo. Então aqui se
// rebobina TUDO — o relógio, o passeio aleatório de cada chama, as brasas, os campos semeados, a vida do vale — e só
// então se ressemeia e anda.

import { BigTrees } from '@/game/objects/BigTrees';
import { BirdLife } from '@/game/objects/BirdLife';
import { CrashSite } from '@/game/objects/CrashSite';
import { KoiPond } from '@/game/objects/KoiPond';
import { NatureLife } from '@/game/objects/nature/NatureLife';
import { Waterfall } from '@/game/objects/Waterfall';
import { getTimeOfDay, setTimeOfDay } from '@/game/runtime/timeOfDay';
import type { GameScene } from '@/game/scenes/GameScene';
import type { World3D } from '@/game/render3d/World3D';

const reseed = (): void => (window as unknown as { __reseed?: () => void }).__reseed?.();
const HIDDEN_LAYER = 31;
const STEP_MS = 16.6667;

export const referenceProbe = (s: GameScene) => {
  const w3 = (): World3D => {
    if (!s.world3d) throw new Error('sem o mundo 3D');
    return s.world3d;
  };

  /** Fora da foto (a câmera não vê a camada 31). */
  const hide = (o: { layers: { set: (n: number) => void } }): void => o.layers.set(HIDDEN_LAYER);
  /**
   * A HORA DA RODADA. O relógio do dia anda por quadro, e o boot dura um tanto diferente a cada rodada: a primeira pose
   * pegava a hora alguns minutos de jogo adiante ou atrás, e a luz da forja e da cratera mudava de leve na foto
   * inteira. A hora fica presa na hora cheia mais perto da primeira pose, para todas as fotos da rodada.
   */
  let hour: number | null = null;

  return {
    /**
     * A POSE: o laço da engine parado, o herói em (x, y) sem respirar, o relógio do mundo zerado, cada chama com a
     * semente pela POSIÇÃO (a ordem da lista varia entre rodadas) e as fogueiras na chama inteira, sem animar.
     * `overrides` fixa knobs do hd3d só para a foto.
     */
    pose: (x: number, y: number, overrides?: Record<string, number>): void => {
      const world = w3();
      s.game.loop.stop();
      hour ??= Math.round(getTimeOfDay() * 24) / 24;
      setTimeOfDay(hour);
      if (overrides) Object.assign(world.params, overrides);
      s.playerWorld.worldX = x;
      s.playerWorld.worldY = y;
      s.movementController?.syncPlayerToWorld(x, y, s.tileSize);
      world.elapsed = 0;
      world.cam.shakeMs = 0;
      world.lights.fires.sort((a, b) => a.worldX - b.worldX || a.worldY - b.worldY);
      for (const f of world.lights.fires) {
        f.seed = (f.worldX * 7.31 + f.worldY * 1.7) % 50;
        f.noise = 0; f.flare = 0; f.flareTarget = 0; f.flareTimer = 0.9; f.flicker = 0; f.level = 1;
      }
      // A respiração do herói é um tween cuja FASE vem do instante do boot: sem ela, escala 1, sempre.
      s.steps.stopBreathing();
      s.steps.startBreathing = () => {};
      s.hero.scaleX = 1;
      s.hero.scaleY = 1;
      s.frame['lastStepTime'] = 0;
      for (const cf of s.props.campfires) {
        cf['animTimer']?.remove(false);
        cf['animTimer'] = undefined;
        if (cf['kindleTween']) {
          cf['kindleTween'].remove();
          cf['kindleTween'] = undefined;
          cf['setFlame'](1);
        }
      }
    },

    /**
     * O AR E A VIDA: brasas, poeira e névoa voltam ao começo (e as partículas saem da foto: o estado delas vem do
     * gerador do boot), os sistemas do vale nascem de novo cada um da sua semente, e as borboletas e vaga-lumes
     * somem. Termina ressemeando, para que a sequência que os passos consomem seja idêntica.
     */
    pinAmbient: (): void => {
      const world = w3();
      const air = world.particles;
      for (const p of air['emberState']) { p.life = 0; p.maxLife = 1.2; p.vx = 0; p.vy = 0; p.vz = 0; }
      air['embers'].pos.fill(0);
      air['dustSeeded'] = false;
      air['atmosphereSeeded'] = false;
      const seeds = air['dustSeed'];
      for (let i = 0; i < seeds.length; i++) {
        seeds[i] = (i * 0.37) % 6.2831853;
        air['dust'].pos[i * 3 + 1] = 0.2 + ((i * 0.137) % 1) * 2.4;
      }
      world.scene.traverse((o) => { if ((o as { isPoints?: boolean }).isPoints) hide(o); });
      hide(air['batch'].mesh);
      for (const id of ['zh-fps', 'zh-controls-hint']) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      }
      const v = s.valley;
      const heroAt = () => ({ x: s.playerWorld.worldX, y: s.playerWorld.worldY });
      if (v.bigTrees) { v.bigTrees.destroy(); reseed(); v.bigTrees = new BigTrees(s); }
      if (v.koiPond) { v.koiPond.destroy(); reseed(); v.koiPond = new KoiPond(s, heroAt); }
      if (v.waterfall) { v.waterfall.destroy(); reseed(); v.waterfall = new Waterfall(s); }
      if (v.crashSite) { v.crashSite.destroy(); reseed(); v.crashSite = new CrashSite(s); }
      if (v.birdLife) { const host = v.birdLife['host']; v.birdLife.destroy(); reseed(); v.birdLife = new BirdLife(s, host); }
      if (v.nature) { const world2 = v.nature['world']; v.nature.destroy(); reseed(); v.nature = new NatureLife(s, world2); }
      if (v.gardenMist) v.gardenMist['clock'] = 0;
      for (const list of [s.life.fireflies, s.life.butterflies, s.life.leaves]) {
        for (const it of list) it.bb.destroy();
        list.length = 0;
      }
      s.life.fireflyLevel = 0;
      s.life.daylifeLevel = 0;
      reseed();
    },

    /**
     * SÓ UMA CAMADA NA FOTO, sem a cadeia de pós (o bloom espalha uma diferença local por meia tela):
     * 'shadows' deixa o chão e as sombras projetadas; 'tiles' deixa só as malhas de tile (BufferGeometry com material
     * Lambert com textura) — o que o `aa-truth` mede.
     */
    isolate: (what: 'shadows' | 'tiles'): void => {
      const world = w3();
      const keep = new Set<unknown>([world.tiles.solidCastField?.mesh, world.tiles.moonCastField?.mesh].filter(Boolean));
      world.scene.traverse((o) => {
        const m = o as { isMesh?: boolean; isPoints?: boolean; isInstancedMesh?: boolean; geometry?: { type: string }; material?: { type: string; map?: unknown } };
        if (!m.isMesh && !m.isPoints) return;
        const lambert = m.geometry?.type === 'BufferGeometry' && m.material?.type === 'MeshLambertMaterial';
        const stays = what === 'shadows' ? keep.has(o) || lambert : Boolean(m.isMesh && !m.isInstancedMesh && lambert && m.material?.map);
        if (!stays) hide(o);
      });
      const passes = world.screen.composer.passes;
      passes.splice(1);
      passes[0].renderToScreen = true;
    },

    /** Anda `steps` quadros de 60 Hz à mão (um por requestAnimationFrame, para o navegador desenhar). */
    step: async (steps: number): Promise<void> => {
      const loop = s.game.loop;
      loop.delta = STEP_MS;
      loop.rawDelta = STEP_MS;
      let t = 0;
      for (let i = 0; i < steps; i++) {
        t += STEP_MS;
        s.game.step(t, STEP_MS);
        await new Promise((r) => requestAnimationFrame(r));
      }
    },

    /** O que tem de dar igual em duas rodadas do MESMO código: qualquer diferença aqui é vazamento de determinismo. */
    state: () => {
      const world = w3();
      const hb = s.heroBillboard;
      const stats = world.stats();
      return {
        elapsed: world.elapsed,
        draws: world.rendererInfo.render.calls,
        state: [
          hb?.x.toFixed(6), hb?.y.toFixed(6), hb?.elevation.toFixed(6),
          s.hero.scaleX.toFixed(6), s.hero.scaleY.toFixed(6), String(s.hero.frame),
          s.camera?.camX.toFixed(6), s.camera?.camY.toFixed(6), s.tileSize.toFixed(6),
          world.camera.position.x.toFixed(6), world.camera.position.y.toFixed(6), world.camera.position.z.toFixed(6),
          stats.litFires, stats.fireLightsUsed, stats.castPool,
        ].join(' '),
      };
    },

    /** O tamanho do quadro que o jogo desenha (px do framebuffer). */
    frameSize: () => ({ w: world3dCanvas(w3()).width, h: world3dCanvas(w3()).height }),
    /**
     * Desenha o MESMO quadro (sem andar o relógio) num framebuffer de w×h e devolve os pixels (de baixo para cima, como
     * o readPixels). Lido na mesma tarefa do desenho: o framebuffer ainda guarda o quadro.
     */
    readFrame: (w: number, h: number): Uint8Array => {
      const world = w3();
      world.renderer.setSize(w, h, false);
      world.screen.composer.render();
      const gl = world.renderer.getContext();
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    },
    /** Volta o framebuffer ao tamanho do jogo. */
    restoreSize: (w: number, h: number): void => w3().renderer.setSize(w, h, false),
    /**
     * O maior fator de supersample, até `ss`, que o navegador de fato entrega para um quadro w×h. Acima do teto dele o
     * WebGL encolhe o framebuffer em silêncio, e o readPixels leria só um canto da foto "verdade".
     */
    fitSupersample: (w: number, h: number, ss: number): number => {
      const world = w3();
      const gl = world.renderer.getContext();
      let fit = 1;
      for (let k = ss; k > 1; k -= 1) {
        world.renderer.setSize(w * k, h * k, false);
        if (gl.drawingBufferWidth === w * k && gl.drawingBufferHeight === h * k) { fit = k; break; }
      }
      world.renderer.setSize(w, h, false);
      return fit;
    },
  };
};

const world3dCanvas = (w: World3D): HTMLCanvasElement => w.renderer.domElement;
