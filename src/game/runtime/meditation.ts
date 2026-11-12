/**
 * A MEDITAÇÃO NA PEDRA DA COLINA (pedido do autor, 2026-11-12: "pesquisa profunda sobre meditação, seus benefícios
 * e como funciona; um minijogo de meditação que possa ser jogado quando o jogador quiser"). Aqui mora só a regra, sem
 * tela nenhuma (scenes/game/Meditation monta o resto), para ela poder ser provada nos testes.
 *
 * O QUE A PESQUISA DIZ, E COMO VIROU JOGO:
 *
 *   · A ÂNCORA É O FÔLEGO (meditação de atenção focada: Lutz et al. 2008, Trends in Cognitive Sciences). Um anel de
 *     luz em volta do herói mostra o ritmo, e o jogador segura para inspirar e solta para expirar. O ritmo é o da
 *     respiração lenta, SEIS POR MINUTO (4 s inspirando, 6 s expirando): perto de 0,1 Hz a variação do batimento com
 *     o fôlego é máxima (Lehrer; revisão de Zaccaro et al. 2018, Frontiers in Human Neuroscience). A expiração mais
 *     longa é a prática comum; a vantagem dela sobre a igual é incerta na literatura, e o jogo não a promete.
 *   · A MENTE DIVAGA SOZINHA: quase metade do tempo acordado (46,9%, Killingsworth & Gilbert 2010, Science, 2.250
 *     pessoas). Pensamentos chegam flutuando, com coisas da vida do herói dentro; quando um alcança o herói, o anel
 *     apaga: ele perdeu o fôlego de vista. Não é erro do jogador, é como a mente funciona.
 *   · A VOLTA É O EXERCÍCIO: divagar, PERCEBER, voltar, ficar (o ciclo de Hasenkamp et al. 2012, NeuroImage). O X
 *     (ou o botão "Notar") percebe o pensamento: ele ganha um NOME ("lembrando", "planejando", "se preocupando", "querendo")
 *     e se desfaz, e o fôlego volta. Dar nome ao que se sente acalma o alarme do cérebro (Lieberman et al. 2007,
 *     Psychological Science). Cada volta CONTA A FAVOR, nunca contra.
 *   · QUANTO MAIS FUNDO, MAIS QUIETO: com fôlegos em sintonia e voltas, a profundidade sobe, os pensamentos chegam
 *     mais espaçados (em quem medita há anos, a rede que puxa a mente para longe fica mais quieta: Brewer et al.
 *     2011, PNAS), e no fundo vem a QUIETUDE: o sino toca e por um tempo nenhum pensamento chega.
 *   · SEM DERROTA E SEM PRESSA: a sessão não acaba sozinha e não tem nota; levanta-se quando quiser. Os efeitos de
 *     verdade são modestos e vêm da constância (Goyal et al. 2014, JAMA Internal Medicine; Basso et al. 2019), e o
 *     jogo diz isso nas notas do caderno, uma por sessão (`meditation.facts` e `meditation.sources` nos locales).
 */

/** Segundos inspirando e expirando: seis fôlegos por minuto. */
export const INHALE_S = 4;
export const EXHALE_S = 6;
export const CYCLE_S = INHALE_S + EXHALE_S;

/** O fôlego do jogador e o guia se encontram dentro desta distância (0..1) para contar como sintonia plena. */
const SYNC_SLACK = 0.35;
/** De onde os pensamentos chegam e quando alcançam o herói (tiles), e a velocidade deles (tiles/s). */
export const THOUGHT_FROM = 4.4;
export const THOUGHT_CATCH = 1.15;
const THOUGHT_SPEED = 0.55;
/** Um pensamento que alcançou o herói e não foi percebido some sozinho depois disto (s): um lapso. */
const LAPSE_S = 7;
/** Os dois primeiros fôlegos são só fôlego: o primeiro pensamento espera. */
const FIRST_THOUGHT_S = CYCLE_S * 2;
/** O intervalo entre pensamentos (s), raso e fundo: quanto mais fundo, mais espaçados. */
const GAP_SHALLOW = 10;
const GAP_DEEP = 22;
/** A quietude: no fundo, por este tempo (s) nenhum pensamento chega. */
export const QUIET_S = 25;

/** O que um fôlego bem feito, uma volta e um lapso fazem com a profundidade (0..1). */
const DEPTH_GOOD = 0.07;
const DEPTH_FAIR = 0.03;
const DEPTH_RETURN = 0.04;
const DEPTH_LAPSE = 0.05;

export type ThoughtKind = 'memory' | 'plan' | 'worry' | 'want';
export const THOUGHT_KINDS: readonly ThoughtKind[] = ['memory', 'plan', 'worry', 'want'];

export type ThoughtState = 'drifting' | 'caught' | 'noticed' | 'lapsed';

export interface Thought {
  id: number;
  kind: ThoughtKind;
  /** Qual coisa da vida do herói vai dentro (índice da lista de cada tipo, escolhido por quem desenha). */
  pick: number;
  /** De que lado ele vem (radianos, 0 = direita, pela tela: os de baixo nunca, para não cobrir o herói). */
  angle: number;
  /** A distância até o herói (tiles). */
  dist: number;
  state: ThoughtState;
  /** Há quanto tempo está no estado atual (s). */
  age: number;
}

export type MeditationEvent =
  | { type: 'inhale' }
  | { type: 'exhale' }
  | { type: 'breath'; quality: number; counted: boolean }
  | { type: 'thought'; thought: Thought }
  | { type: 'caught'; thought: Thought }
  | { type: 'noticed'; thought: Thought }
  | { type: 'lapse'; thought: Thought }
  | { type: 'quiet' };

/** O guia (0 vazio, 1 cheio): sobe em linha reta por INHALE_S e desce por EXHALE_S. */
export const guideAt = (t: number): { level: number; inhaling: boolean } => {
  const c = ((t % CYCLE_S) + CYCLE_S) % CYCLE_S;
  if (c < INHALE_S) return { level: c / INHALE_S, inhaling: true };
  return { level: 1 - (c - INHALE_S) / EXHALE_S, inhaling: false };
};

/** Quão junto o fôlego do jogador está do guia (0..1). */
export const syncOf = (breath: number, guide: number): number => 1 - Math.min(1, Math.abs(breath - guide) / SYNC_SLACK);

/** A sessão: o relógio, o fôlego, a profundidade e os pensamentos. `rand` injeta a sorte (os testes a fixam). */
export class MeditationSession {
  public time = 0;
  /** O fôlego do jogador (0 vazio, 1 cheio). */
  public breath = 0;
  public depth = 0;
  /** Fôlegos completos em sintonia (os que contam), voltas (pensamentos percebidos) e lapsos. */
  public breaths = 0;
  public returns = 0;
  public lapses = 0;
  public readonly thoughts: Thought[] = [];
  private nextThought = FIRST_THOUGHT_S;
  private quietUntil = -1;
  private reachedQuiet = false;
  private cycle = 0;
  private cycleSync = 0;
  private cycleSamples = 0;
  private wasInhaling = true;
  private ids = 0;

  public constructor(private readonly rand: () => number = Math.random) {}

  /** O guia agora. */
  public get guide(): { level: number; inhaling: boolean } {
    return guideAt(this.time);
  }

  /** A atenção está no fôlego (nenhum pensamento alcançou o herói). */
  public get focused(): boolean {
    return !this.thoughts.some((t) => t.state === 'caught');
  }

  /** Quão junto do guia o fôlego está agora (0 com a mente longe). */
  public get sync(): number {
    return this.focused ? syncOf(this.breath, this.guide.level) : 0;
  }

  /** Na quietude (o fundo, por um tempo sem pensamento). */
  public get quiet(): boolean {
    return this.time < this.quietUntil;
  }

  /** Um passo de `dt` segundos, com o jogador segurando (inspirando) ou não. */
  public step(dt: number, holding: boolean): MeditationEvent[] {
    const events: MeditationEvent[] = [];
    this.time += dt;
    this.breath = Math.min(1, Math.max(0, this.breath + (holding ? dt / INHALE_S : -dt / EXHALE_S)));
    const guide = this.guide;
    if (guide.inhaling !== this.wasInhaling) events.push({ type: guide.inhaling ? 'inhale' : 'exhale' });
    this.wasInhaling = guide.inhaling;
    this.cycleSync += this.sync * dt;
    this.cycleSamples += dt;
    const cycle = Math.floor(this.time / CYCLE_S);
    if (cycle > this.cycle) {
      this.cycle = cycle;
      events.push(this.closeBreath());
      // A quietude só vem com a atenção no fôlego: com um pensamento colado no herói, ela espera a volta.
      if (this.depth >= 1 && !this.reachedQuiet && this.focused) {
        this.reachedQuiet = true;
        this.quietUntil = this.time + QUIET_S;
        this.thoughts.forEach((t) => { if (t.state === 'drifting') t.state = 'noticed'; });
        events.push({ type: 'quiet' });
      }
    }
    this.moveThoughts(dt, events);
    this.spawnThought(events);
    return events;
  }

  /** Um fôlego inteiro fechou: a qualidade é a sintonia média dele, e ela aprofunda (ou não). */
  private closeBreath(): MeditationEvent {
    const quality = this.cycleSamples > 0 ? this.cycleSync / this.cycleSamples : 0;
    this.cycleSync = 0;
    this.cycleSamples = 0;
    const counted = quality >= 0.5;
    if (counted) this.breaths += 1;
    this.deepen(quality >= 0.75 ? DEPTH_GOOD : counted ? DEPTH_FAIR : 0);
    return { type: 'breath', quality, counted };
  }

  private deepen(by: number): void {
    this.depth = Math.min(1, Math.max(0, this.depth + by));
  }

  private moveThoughts(dt: number, events: MeditationEvent[]): void {
    for (let i = this.thoughts.length - 1; i >= 0; i -= 1) {
      const t = this.thoughts[i];
      t.age += dt;
      if (t.state === 'drifting') {
        t.dist = Math.max(THOUGHT_CATCH, t.dist - THOUGHT_SPEED * dt);
        if (t.dist <= THOUGHT_CATCH) { t.state = 'caught'; t.age = 0; events.push({ type: 'caught', thought: t }); }
      } else if (t.state === 'caught' && t.age > LAPSE_S) {
        t.state = 'lapsed';
        t.age = 0;
        this.lapses += 1;
        this.deepen(-DEPTH_LAPSE);
        events.push({ type: 'lapse', thought: t });
      } else if ((t.state === 'noticed' || t.state === 'lapsed') && t.age > 1.2) {
        this.thoughts.splice(i, 1);
      }
    }
  }

  private spawnThought(events: MeditationEvent[]): void {
    if (this.time < this.nextThought || this.quiet) return;
    const gap = GAP_SHALLOW + (GAP_DEEP - GAP_SHALLOW) * this.depth;
    this.nextThought = this.time + gap + this.rand() * 5;
    if (this.thoughts.filter((t) => t.state === 'drifting' || t.state === 'caught').length >= 2) return;
    // De cima e dos lados (de -200° a 20°, pela tela): nunca de baixo, onde estaria em cima do herói.
    const angle = (-200 + this.rand() * 220) * (Math.PI / 180);
    const thought: Thought = {
      id: (this.ids += 1),
      kind: THOUGHT_KINDS[Math.floor(this.rand() * THOUGHT_KINDS.length)],
      pick: Math.floor(this.rand() * 1000),
      angle,
      dist: THOUGHT_FROM,
      state: 'drifting',
      age: 0,
    };
    this.thoughts.push(thought);
    events.push({ type: 'thought', thought });
  }

  /**
   * PERCEBER: o pensamento que pegou o herói (ou, se nenhum pegou, o que está mais perto) ganha um nome e se desfaz.
   * Devolve o percebido, ou null se não havia nenhum (perceber o nada não faz nada).
   */
  public notice(): Thought | null {
    const live = this.thoughts.filter((t) => t.state === 'drifting' || t.state === 'caught');
    const target = live.find((t) => t.state === 'caught') ?? live.sort((a, b) => a.dist - b.dist)[0];
    if (!target) return null;
    target.state = 'noticed';
    target.age = 0;
    this.returns += 1;
    this.deepen(DEPTH_RETURN);
    return target;
  }
}
