// A VIDA DO VALE, A CADA QUADRO: os vaga-lumes da noite, as borboletas e as folhas do dia, a mistura do som
// ambiente, o clima e as flores da lua.

import { CHUNK_COLUMNS, CHUNK_ROWS, MOONFLOWER_LIGHT_TILES, TREE_UPPER_FRAMES } from '@/game/constants';
import { getTimeOfDay, isNightTime } from '@/game/runtime/timeOfDay';
import { SEASON_LEAVES } from '@/game/runtime/seasons';
import { t } from '@/game/i18n/i18n';
import { FX_DOT_TEXTURE } from '@/game/render3d/World3D';
import { BUTTERFLY_TEXTURE, LEAF_TEXTURE } from '@/game/render3d/cozyTextures';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { WATERFALL_POOL } from '@/game/objects/Waterfall';
import { ControlsHint } from '@/game/runtime/ActionButtons';
import { getSoundManager } from '@/game/audio/SoundManager';
import { isBareTreeAt } from '@/game/world/biomes';
import type { GameScene } from '../GameScene';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { BUTTERFLY_ASPECT, BUTTERFLY_SIZE, BUTTERFLY_TINTS, FX_BILLBOARD } from './sceneDefs';

/** Quantos vaga-lumes derivam em volta do heroi a noite. */
const FIREFLY_COUNT = 18;
const BUTTERFLY_COUNT = 5;
/** As folhas que se soltam das arvores perto do heroi, de dia: no maximo tantas ao mesmo tempo. */
const LEAF_MAX = 6;
/** Quanto tempo a folha descansa no chao antes de sumir (e quanto leva sumindo). */
const LEAF_REST_MS = 2600;
const LEAF_FADE_MS = 900;

/** O que ValleyLife usa de GameScene. */
export type ValleyLifeHost = Pick<GameScene,
  'actions' | 'camp' | 'chunkManager' | 'cutsceneActive' | 'dialog' | 'itemManager' | 'playerWorld' | 'props'
  | 'query' | 'roastEnding' | 'save' | 'torch' | 'valley' | 'verbs' | 'world3d'
>;

export class ValleyLife {
  private leafClockMs = 0;

  public fireflyLevel = 0;
  public ambienceClockMs = 0;
  // Os vaga-lumes da noite (ver updateFireflies): pontos sem luz que derivam em volta do heroi.
  public readonly fireflies: Array<{ bb: Billboard3D; ox: number; oy: number; phase: number; speed: number }> = [];
  // O turno do dia (ver updateDaytimeLife): borboletas e folhas caindo.
  public daylifeLevel = 0;
  public readonly butterflies: Array<{
    bb: Billboard3D; x: number; y: number; tx: number; ty: number; phase: number; size: number;
  }> = [];
  public readonly leaves: Array<{
    bb: Billboard3D; x: number; y: number; elev: number; t: number; sway: number; spin: number; landedMs: number;
  }> = [];

  public constructor(private readonly host: ValleyLifeHost) {}

  /**
   * OS VAGA-LUMES: pontos de luz SEM luz (a lei mais cara da casa — nenhuma PointLight nasce em
   * runtime), aditivos, derivando em volta do heroi. Eles so existem de noite, e nas duas cenas
   * que precisam deles (a abertura e o fim) a noite e garantida pela propria cena.
   */
  public updateFireflies(delta: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const want = isNightTime() || this.host.roastEnding.roasting ? 1 : 0;
    this.fireflyLevel += (want - this.fireflyLevel) * Math.min(1, delta / 1500);
    if (this.fireflyLevel < 0.01 && this.fireflies.length === 0) return;
    const at = this.host.verbs.heroVisualTile();
    if (this.fireflies.length === 0) {
      for (let i = 0; i < FIREFLY_COUNT; i += 1) {
        const bb = w3
          .objects.addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2.4 })
          .setTint(i % 3 === 0 ? 0xfff2a0 : 0xd6ff8a)
          .setDisplaySize(0.085, 0.085);
        this.fireflies.push({
          bb,
          ox: at.x + (Math.random() - 0.5) * 9,
          oy: at.y + (Math.random() - 0.5) * 7,
          phase: Math.random() * Math.PI * 2,
          speed: 0.0006 + Math.random() * 0.0007,
        });
      }
    }
    for (const fly of this.fireflies) {
      fly.phase += delta * fly.speed;
      // Longe demais do heroi, o vaga-lume reaparece do outro lado do quadro — o enxame nunca
      // fica para tras, e nunca nasce colado na cara dele.
      if (Math.abs(fly.ox - at.x) > 5.5 || Math.abs(fly.oy - at.y) > 4.5) {
        fly.ox = at.x + (Math.random() - 0.5) * 9;
        fly.oy = at.y + (Math.random() - 0.5) * 7;
      }
      fly.ox += Math.sin(fly.phase * 0.37) * delta * 0.00018;
      fly.oy += Math.cos(fly.phase * 0.29) * delta * 0.00014;
      const blink = Math.max(0, Math.sin(fly.phase * 2.3));
      fly.bb
        .setPosition(fly.ox + Math.sin(fly.phase) * 0.45, fly.oy + Math.cos(fly.phase * 0.8) * 0.3)
        .setElevation(0.35 + 0.4 * (0.5 + 0.5 * Math.sin(fly.phase * 1.3)))
        .setAlpha(this.fireflyLevel * (0.2 + 0.8 * blink));
    }
  }

  /**
   * O TURNO DO DIA, o que os vaga-lumes sao para a noite. BORBOLETAS que vagueiam em volta do
   * heroi, de alvo em alvo, batendo asa (a largura respira: uma arte so), e FOLHAS que se soltam
   * das arvores DE VERDADE perto dele e descem balancando ate o chao, onde descansam e somem.
   * Nada disso traz luz (a lei do pool fixo), e tudo entra e sai em rampa com o nascer e o por do sol.
   */
  public updateDaytimeLife(delta: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const quiet = (this.host.valley.weather?.rain ?? 0) > 0.3 || (this.host.valley.weather?.snow ?? 0) > 0.3 || this.host.valley.weather?.season === 'winter';
    const want = !isNightTime() && !this.host.roastEnding.roasting && !this.host.cutsceneActive && !quiet ? 1 : 0;
    this.daylifeLevel += (want - this.daylifeLevel) * Math.min(1, delta / 1500);
    if (this.daylifeLevel < 0.01 && this.butterflies.length === 0 && this.leaves.length === 0) return;
    const at = this.host.verbs.heroVisualTile();
    const pickTarget = (): [number, number] => [at.x + (Math.random() - 0.5) * 8, at.y + (Math.random() - 0.5) * 6];

    if (this.butterflies.length === 0 && this.daylifeLevel > 0.01) {
      for (let i = 0; i < BUTTERFLY_COUNT; i += 1) {
        const [x, y] = pickTarget();
        const [tx, ty] = pickTarget();
        const size = BUTTERFLY_SIZE;
        const bb = w3.objects.addBillboard(BUTTERFLY_TEXTURE, 0, { centered: true, depthWrite: false })
          .setTint(BUTTERFLY_TINTS[i % BUTTERFLY_TINTS.length])
          .setDisplaySize(size, size * BUTTERFLY_ASPECT);
        this.butterflies.push({ bb, x, y, tx, ty, phase: Math.random() * 10, size });
      }
    }
    for (const b of this.butterflies) {
      b.phase += delta * 0.001;
      // Longe do quadro ela volta por outro lado; perto do alvo, escolhe outro.
      if (Math.abs(b.x - at.x) > 6 || Math.abs(b.y - at.y) > 5) [b.x, b.y] = pickTarget();
      if (Math.hypot(b.tx - b.x, b.ty - b.y) < 0.3) [b.tx, b.ty] = pickTarget();
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = delta * 0.0011;
      // O voo de borboleta nunca e reto: um zigue-zague por cima da reta ate o alvo.
      const wob = Math.sin(b.phase * 5.3) * 0.7;
      b.x += (dx / d - (dy / d) * wob) * step;
      b.y += (dy / d + (dx / d) * wob) * step;
      const flap = Math.abs(Math.sin(b.phase * 22));
      b.bb
        .setPosition(b.x, b.y)
        .setElevation(0.45 + 0.25 * Math.sin(b.phase * 1.7) + 0.06 * flap)
        .setDisplaySize(b.size * (0.25 + 0.75 * flap), b.size * BUTTERFLY_ASPECT)
        .setAlpha(this.daylifeLevel);
    }
    if (want === 0 && this.daylifeLevel < 0.02) {
      for (const b of this.butterflies) b.bb.destroy();
      this.butterflies.length = 0;
    }

    // As folhas: de tempos em tempos, uma arvore perto do heroi solta uma.
    this.leafClockMs -= delta;
    const chunks = this.host.chunkManager;
    const leafTints = SEASON_LEAVES[this.host.valley.weather?.season ?? 'summer'];
    if (chunks && leafTints.length > 0 && this.leafClockMs <= 0 && this.leaves.length < LEAF_MAX && this.daylifeLevel > 0.5) {
      this.leafClockMs = 700 + Math.random() * 1300;
      for (let tries = 0; tries < 8; tries += 1) {
        const wx = Math.round(at.x + (Math.random() - 0.5) * 9);
        const wy = Math.round(at.y + (Math.random() - 0.5) * 6);
        if (!chunks.hasChunkCoordinate(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS))) continue;
        const { upper } = chunks.getTile(wx, wy);
        if (upper === null || !TREE_UPPER_FRAMES.has(upper)) continue;
        // A árvore DESENHADA manda (world/biomes): pinheiro que o bioma veste de árvore morta não solta folha.
        if (isBareTreeAt(upper, wx, wy)) continue;
        const bb = w3.objects.addBillboard(LEAF_TEXTURE, 0, { centered: true, depthWrite: false })
          .setTint(leafTints[Math.floor(Math.random() * leafTints.length)])
          .setDisplaySize(0.17, 0.13);
        this.leaves.push({
          bb, x: wx + (Math.random() - 0.5) * 0.6, y: wy + 0.15, elev: 0.95 + Math.random() * 0.3,
          t: 0, sway: Math.random() * 6, spin: Math.random() < 0.5 ? -1 : 1, landedMs: -1,
        });
        break;
      }
    }
    for (let i = this.leaves.length - 1; i >= 0; i -= 1) {
      const leaf = this.leaves[i];
      leaf.t += delta;
      let alpha = 1;
      if (leaf.landedMs < 0) {
        // Cai como folha: devagar, balancando para os lados, e o balanco e o que a faz girar.
        leaf.elev -= delta * 0.00022;
        const sway = Math.sin(leaf.t * 0.0032 + leaf.sway);
        leaf.x += sway * delta * 0.00035;
        leaf.bb.setAngle(sway * 40 * leaf.spin);
        if (leaf.elev <= 0.02) {
          leaf.elev = 0.02;
          leaf.landedMs = 0;
        }
      } else {
        // No chao: descansa um pouco e some.
        leaf.landedMs += delta;
        alpha = 1 - Math.min(1, Math.max(0, leaf.landedMs - LEAF_REST_MS) / LEAF_FADE_MS);
        if (alpha <= 0) {
          leaf.bb.destroy();
          this.leaves.splice(i, 1);
          continue;
        }
      }
      leaf.bb.setPosition(leaf.x, leaf.y).setElevation(leaf.elev).setAlpha(alpha * this.daylifeLevel);
    }
  }

  /**
   * O SOM DO LUGAR: quanto de dia, de noite e de agua os leitos de ambiente tocam agora. A noite
   * entra e sai em rampa em volta do nascer e do por do sol (nada de corte), e o marulho cresce
   * nos ultimos seis tiles ate a beira de qualquer agua — prop de rio ou lago pintado no terreno
   * (`isOpenWaterAt`, a resposta unica para as duas). Medido de 400 em 400ms: o ganho desliza
   * sozinho no SoundManager.
   */
  public updateAmbienceMix(delta: number): void {
    this.ambienceClockMs -= delta;
    if (this.ambienceClockMs > 0) return;
    this.ambienceClockMs = 400;
    const phase = getTimeOfDay();
    const night = Math.min(1, Math.max(0, 0.5 + 1.6 * Math.cos(2 * Math.PI * phase)));
    const { worldX: hx, worldY: hy } = this.host.playerWorld;
    let nearest = Infinity;
    for (let dy = -6; dy <= 6; dy += 1) {
      for (let dx = -6; dx <= 6; dx += 1) {
        const d = Math.hypot(dx, dy);
        if (d < nearest && this.host.query.isOpenWaterAt(hx + dx, hy + dy)) nearest = d;
      }
    }
    let water = Number.isFinite(nearest) ? Math.min(1, Math.max(0, 1 - (nearest - 1) / 5)) : 0;
    // A CACHOEIRA se ouve de mais longe que a água parada: o marulho cheio a três tiles e ainda algum a doze.
    if (this.host.valley.waterfall) {
      const d = Math.hypot(WATERFALL_POOL.x - hx, WATERFALL_POOL.y - hy);
      water = Math.max(water, Math.min(1, Math.max(0, 1 - (d - 3) / 9)));
    }
    const sound = getSoundManager();
    sound.ambience.setAmbienceMix(night, water, this.host.valley.weather?.rain ?? 0);
    // A MÚSICA OUVE O LUGAR: a caixinha entra perto da água, e o violoncelo perto do fogo ou de quem senta.
    let fire = this.host.camp.rest.isResting ? 1 : 0;
    for (const cf of [...this.host.props.campfires, ...this.host.props.hearths]) {
      if (!cf.isLit) continue;
      fire = Math.max(fire, Math.min(1, Math.max(0, 1 - (Math.hypot(cf.worldX - hx, cf.worldY - hy) - 1) / 5)));
    }
    if (this.host.torch.isTorchLit) fire = Math.max(fire, 0.7);
    sound.music.setMusicLayers(water, fire);
  }

  /** O céu: a estação no quadro, a chuva em volta dele, e um aviso quando o ano vira. */
  public updateWeather(delta: number): void {
    const weather = this.host.valley.weather;
    if (!weather) return;
    weather.update(delta, this.host.verbs.heroVisualTile());
    if (weather.season === this.host.valley.shownSeason) return;
    this.host.valley.shownSeason = weather.season;
    if (this.host.cutsceneActive || this.host.dialog.dialogOpen) return;
    this.host.actions.controlsHint?.destroy();
    this.host.actions.controlsHint = new ControlsHint(t(`seasons.${weather.season}`), 3200, isTouchDevice());
    this.host.save.persistAdventure();
  }

  /**
   * Moonflowers: shut while a flame burns within MOONFLOWER_LIGHT_TILES, open (walkable) in the
   * dark. The proximity test lives here because the fires do; the flower owns look, collision
   * and juice.
   *
   * Tres chamas contam, e as tres sao a mesma coisa vista em tres lugares: a fogueira ACESA, a
   * TOCHA na mao do heroi e o graveto aceso POUSADO no chao (a tocha que ele largou, ou a que o
   * braco entregou). A do meio e a unica fonte que ANDA no jogo inteiro, e e o que muda a peca:
   * ate agora a flor so respondia ao mapa, e agora ela responde ao JOGADOR — chegar perto de
   * uma ponte de petalas com fogo na mao a fecha antes de o heroi pisar nela, e atravessar passa
   * a custar deixar a luz pra tras. A lava fica de fora de proposito (ver MOONFLOWER_LIGHT_TILES).
   *
   * A tocha e a lista de chamas no chao sao lidas FORA do laco: elas nao dependem de qual flor
   * esta sendo perguntada, e varrer os itens do mundo uma vez por flor por frame seria pagar o
   * mesmo varrimento tantas vezes quantas flores o mapa tiver.
   *
   * This runs in update() and NOT in renderProps(), which reprojectStatic() also calls: a dialog
   * pan must not advance the bloom, and the animation needs a delta that a reprojection has no
   * business having.
   */
  public updateMoonflowers(delta: number): void {
    if (this.host.props.moonflowers.length === 0) return;
    const torch = this.host.torch.isTorchLit ? this.host.playerWorld : null;
    const laid = this.host.itemManager?.litItems() ?? [];
    for (const mf of this.host.props.moonflowers) {
      const near = (x: number, y: number): boolean => Math.hypot(x - mf.worldX, y - mf.worldY)
        <= MOONFLOWER_LIGHT_TILES;
      const nearFire = this.host.props.campfires.some((cf) => cf.isLit && near(cf.worldX, cf.worldY))
        || (torch !== null && near(torch.worldX, torch.worldY))
        || laid.some((f) => near(f.x, f.y));
      mf.setNearFire(nearFire);
      // Efeito e audio so existem perto do heroi.
      const effectsVisible = Math.hypot(
        mf.worldX - this.host.playerWorld.worldX,
        mf.worldY - this.host.playerWorld.worldY,
      ) <= 10;
      mf.update(delta, effectsVisible);
    }
  }
}
