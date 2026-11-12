// O CADERNO DE DESENHO (pedido do autor, 2026-11-11; runtime/sketches): perto de um bicho do vale, o Z abre o caderno
// e o herói o desenha (runtime/SketchOverlay). Aqui: quem está à vista agora, qual deles o Z desenharia, a etiqueta
// "Desenhar [Z]" embaixo da tela enquanto ele está perto (runtime/SketchCue), e a arte de cada um (os quadros do
// próprio jogo, lidos de textures3d, e o desenho a pena feito deles).

import { NPC_VISUALS } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t } from '@/game/i18n/i18n';
import { createCanvas } from '@/game/platform/platform';
import { framePixelReader, frameSize } from '@/game/render3d/textures3d';
import { INK_ZOOM, artBox, inkStrokes, inkUrl, zoomed, type Box, type InkStroke, type Rgba } from '@/game/runtime/inkSketch';
import { noteSketch, sketchProgress, type AnimalKind } from '@/game/runtime/sketches';
import { getKeyLetter } from '@/game/runtime/accessibility';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { SketchCue } from '@/game/runtime/SketchCue';
import { SketchOverlay } from '@/game/runtime/SketchOverlay';
import type { GameScene } from '../GameScene';

/** O que AnimalSketching usa de GameScene. */
export type AnimalSketchingHost = Pick<GameScene,
  'actions' | 'camp' | 'cinema' | 'itemManager' | 'movementController' | 'save' | 'steps' | 'valley' | 'verbs'
>;

type Frame = readonly [key: string, frame: number];
/** A arte de cada bicho: o quadro que vira desenho, os que ele faz distraído e o de quando levanta a cabeça. */
const ART: Readonly<Record<AnimalKind, { draw: Frame; calm: readonly Frame[]; alert: Frame }>> = {
  squirrel: { draw: ['squirrel-sit', 0], calm: [['squirrel-gnaw', 0], ['squirrel-sit', 0]], alert: ['squirrel-stand', 0] },
  bird: { draw: ['bird-1-stand', 0], calm: [['bird-1-peck', 0], ['bird-1-stand', 0]], alert: ['bird-1-up', 0] },
  hare: { draw: ['hare-graze', 0], calm: [['hare-graze', 0], ['hare-chew', 0]], alert: ['hare-alert', 0] },
  frog: { draw: ['frog-sit', 0], calm: [['frog-sit', 0], ['frog-croak', 0]], alert: ['frog-sit', 0] },
  dragonfly: { draw: ['dragonfly-blue-a', 0], calm: [['dragonfly-blue-a', 0], ['dragonfly-blue-b', 0]], alert: ['dragonfly-blue-a', 0] },
  koi: { draw: ['koi-0-0-0', 0], calm: [['koi-0-0-0', 0], ['koi-0-0-1', 0]], alert: ['koi-0-0-0', 0] },
  cat: {
    draw: [NPC_VISUALS.blackCat.key, NPC_VISUALS.blackCat.frame ?? 0],
    calm: [[NPC_VISUALS.blackCat.key, NPC_VISUALS.blackCat.frame ?? 0]],
    alert: [NPC_VISUALS.blackCat.key, NPC_VISUALS.blackCat.frame ?? 0],
  },
};

/**
 * SÓ PERTO DO BICHO (pedido do autor): até 4 tiles. Os bichos só se espantam com o herói a 2 tiles ou menos (a lebre
 * senta alerta a 2,4), então sobra uma faixa larga para chegar e desenhar; a 6,5, de antes, a etiqueta aparecia com o
 * bicho do outro lado da clareira.
 */
const RANGE = 4;
/** Espantado, o mesmo bicho não posa de novo tão cedo (ms). */
const COOLDOWN_MS = 10_000;
/** O bicho sumiu por menos que isto (s), a etiqueta fica: um pássaro que pula para trás de uma moita não a faz piscar. */
const CUE_GRACE_S = 1.2;

type Ink = { w: number; h: number; strokes: InkStroke[] };
type Spot = { kind: AnimalKind; x: number; y: number };

export class AnimalSketching {
  public overlay?: SketchOverlay;
  private readonly startledAt = new Map<AnimalKind, number>();
  private readonly inks = new Map<AnimalKind, Ink | null>();
  private readonly urls = new Map<string, string>();
  private cue?: SketchCue;
  private cueKind: AnimalKind | null = null;
  private cueLost = 0;

  public constructor(private readonly host: AnimalSketchingHost) {}

  /**
   * A ETIQUETA, a cada quadro: um bicho que falta no caderno está perto, e embaixo da tela fica "Desenhar [Z]" até ele
   * ir embora. Com a tela tomada (conversa, cena, descanso, outra tela) ela sai.
   */
  public update(deltaMs: number): void {
    const free = this.host.actions.canAct() && !this.host.camp.rest.isResting && !this.overlay;
    const spot = free ? this.available() : null;
    if (spot) {
      this.cueLost = 0;
      this.cueKind = spot.kind;
      this.cue ??= new SketchCue(t('actions.sketch'), isTouchDevice() ? 'A' : getKeyLetter('hand'));
      this.cue.show();
      const front = this.host.verbs.facingTile();
      this.cue.busy(this.host.verbs.handVerbAt(front.x, front.y) !== null || Boolean(this.host.itemManager?.kindAt(front.x, front.y)));
      return;
    }
    if (this.cueKind === null) return;
    this.cueLost += deltaMs / 1000;
    if (this.cueLost < CUE_GRACE_S && free) return;
    this.cueKind = null;
    this.cue?.hide();
  }

  /** O texto da placa agora (a janela dos playtests), ou null. */
  public get cueText(): string | null {
    return this.cue?.showing ?? null;
  }

  /** Os bichos à vista agora, com onde estão (só os que estão parados o bastante para posar). */
  private subjects(): Array<{ kind: AnimalKind; x: number; y: number }> {
    const out: Array<{ kind: AnimalKind; x: number; y: number }> = [];
    const nature = this.host.valley.nature;
    const squirrel = nature?.squirrel.state;
    if (squirrel && (squirrel.mode === 'ground' || squirrel.mode === 'down')) out.push({ kind: 'squirrel', x: squirrel.x, y: squirrel.y });
    for (const b of this.host.valley.birdLife?.list ?? []) if (b.mode === 'ground') out.push({ kind: 'bird', x: b.x, y: b.y });
    const hare = nature?.hares.state;
    if (hare && hare.mode !== 'flee') out.push({ kind: 'hare', x: hare.x, y: hare.y });
    for (const f of nature?.frogs.list ?? []) if (f.mode === 'sit') out.push({ kind: 'frog', x: f.x, y: f.y });
    for (const d of nature?.dragonflies.list ?? []) out.push({ kind: 'dragonfly', x: d.x, y: d.y });
    for (const k of this.host.valley.koiPond?.fish ?? []) out.push({ kind: 'koi', x: k.x, y: k.y });
    const cat = this.host.camp.catCare.asleep;
    if (cat) out.push({ kind: 'cat', x: cat.x, y: cat.y });
    return out;
  }

  /**
   * O bicho que o Z desenharia agora: o mais perto, para qualquer lado, que ainda falta no caderno (null: nenhum). Para
   * qualquer lado porque a etiqueta "Desenhar [Z]" fica na tela enquanto ele está por perto: ela não pode prometer o
   * que o Z recusaria só porque o herói está de costas.
   */
  private available(): Spot | null {
    if (this.overlay) return null;
    const hero = this.host.verbs.heroVisualTile();
    const now = performance.now();
    let best: Spot | null = null;
    let bestD = RANGE;
    for (const s of this.subjects()) {
      if (sketchProgress(s.kind) >= 1 || now - (this.startledAt.get(s.kind) ?? -Infinity) < COOLDOWN_MS) continue;
      const d = Math.hypot(s.x - hero.x, s.y - hero.y);
      if (d >= bestD || d < 0.3 || !this.ink(s.kind)) continue;
      best = s;
      bestD = d;
    }
    return best;
  }

  /** O bicho que o Z desenharia agora (a janela dos playtests). */
  public target(): AnimalKind | null {
    return this.available()?.kind ?? null;
  }

  /** O Z: o herói se vira para o bicho e abre o caderno. */
  public tryOpen(): boolean {
    const spot = this.available();
    if (!spot) return false;
    const hero = this.host.verbs.heroVisualTile();
    const dx = spot.x - hero.x;
    const dy = spot.y - hero.y;
    this.host.cinema.scriptFace(Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0, Math.abs(dx) >= Math.abs(dy) ? 0 : Math.sign(dy));
    this.open(spot.kind);
    return true;
  }

  public open(kind: AnimalKind): void {
    const ink = this.ink(kind);
    const box = this.modelBox(kind);
    if (this.overlay || !ink || !box) return;
    this.cue?.hide();
    this.cueKind = null;
    this.host.actions.useBufferMs = 0;
    this.host.steps.stopBreathing();
    this.host.actions.actionButtons?.setVisible(false);
    this.host.actions.controlsHint?.destroy();
    this.host.actions.controlsHint = undefined;
    const sound = getSoundManager();
    sound.ui.playPaperUnfold();
    const name = `sketch.animals.${kind}`;
    this.overlay = new SketchOverlay({
      view: {
        kind,
        calm: ART[kind].calm.map((f) => this.frameUrl(f, box)),
        alert: this.frameUrl(ART[kind].alert, box),
        mw: box.w,
        mh: box.h,
        ...ink,
        start: sketchProgress(kind),
        name: t(`${name}.name`),
        latin: t(`${name}.latin`),
        fact: t(`${name}.fact`),
        close: t('notebook.close'),
      },
      scratch: () => sound.ui.playPenScratch(),
      startle: () => sound.ui.playStartle(),
      done: () => sound.ui.playCozyChime(),
      onClose: (progress, startled) => {
        this.overlay = undefined;
        noteSketch(kind, progress);
        if (startled) this.startledAt.set(kind, performance.now());
        this.host.actions.actionButtons?.setVisible(true);
        this.host.save.persistAdventure();
      },
    });
  }

  /** O desenho a pena do bicho em `progress` (0..1), como data URL (o caderno de campo mostra a página com ele). */
  public inkUrl(kind: AnimalKind, progress: number): string {
    const ink = this.ink(kind);
    return ink ? inkUrl(ink.w, ink.h, ink.strokes, progress) : '';
  }

  /** O bicho como o jogo o desenha (o caderno faz dele o vulto, enquanto não há desenho). */
  public modelUrl(kind: AnimalKind): string {
    const [key, frame] = ART[kind].draw;
    const size = frameSize(key);
    const read = size ? framePixelReader(key, frame) : null;
    const box = size && read ? artBox(size.w, size.h, read) : null;
    return box ? this.frameUrl(ART[kind].draw, box) : '';
  }

  /** Os quadros de um quadro e de uma folha: o leitor de pixels e o tamanho, ou null enquanto a arte não existe. */
  private reader([key, frame]: Frame): { read: Rgba; w: number; h: number } | null {
    const size = frameSize(key);
    const read = size ? framePixelReader(key, frame) : null;
    return size && read ? { read, ...size } : null;
  }

  /** O retângulo que cabe todos os quadros do bicho posando (para ele não pular de lugar quando o quadro troca). */
  private modelBox(kind: AnimalKind): Box | null {
    const boxes = [...ART[kind].calm, ART[kind].alert].map((f) => {
      const r = this.reader(f);
      return r ? artBox(r.w, r.h, r.read) : null;
    });
    if (boxes.some((b) => !b)) return null;
    const all = boxes as Box[];
    const x = Math.min(...all.map((b) => b.x));
    const y = Math.min(...all.map((b) => b.y));
    return { x, y, w: Math.max(...all.map((b) => b.x + b.w)) - x, h: Math.max(...all.map((b) => b.y + b.h)) - y };
  }

  /** Os traços do desenho, lidos uma vez da arte do bicho: recortada e com a pena 3× mais fina (runtime/inkSketch). */
  private ink(kind: AnimalKind): Ink | null {
    const hit = this.inks.get(kind);
    if (hit) return hit;
    const r = this.reader(ART[kind].draw);
    const box = r ? artBox(r.w, r.h, r.read) : null;
    if (!r || !box) return null;
    const w = box.w * INK_ZOOM;
    const h = box.h * INK_ZOOM;
    const ink = { w, h, strokes: inkStrokes(w, h, zoomed(r.read, box, INK_ZOOM)) };
    this.inks.set(kind, ink);
    return ink;
  }

  /** Um quadro da arte do jogo, recortado em `box`, como data URL (pixel por pixel, como a sombra o lê). */
  private frameUrl(frame: Frame, box: Box): string {
    const id = `${frame[0]}#${frame[1]}#${box.x},${box.y},${box.w},${box.h}`;
    const hit = this.urls.get(id);
    if (hit !== undefined) return hit;
    const r = this.reader(frame);
    const c = createCanvas();
    c.width = box.w;
    c.height = box.h;
    const ctx = c.getContext('2d');
    if (!r || !ctx) return '';
    const img = ctx.createImageData(box.w, box.h);
    for (let y = 0; y < box.h; y += 1) {
      for (let x = 0; x < box.w; x += 1) {
        const inside = box.x + x < r.w && box.y + y < r.h;
        if (inside) img.data.set(r.read(box.x + x, box.y + y), (y * box.w + x) * 4);
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL();
    this.urls.set(id, url);
    return url;
  }

  public destroy(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.cue?.destroy();
    this.cue = undefined;
    this.cueKind = null;
  }
}
