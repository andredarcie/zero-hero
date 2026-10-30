import type { Billboard3D } from '@/game/render3d/Billboard3D';
import type { VoicePersona } from '@/game/dialogs/voicePersonas';

// O CORPO DE QUEM FALA: cada sílaba dá um empurrão numa mola, e a mola faz o resto — estica, encolhe,
// passa do ponto e volta. É a mola que deixa fluido: o corpo nunca salta para uma pose, ele chega lá.
// O sprite é a mesma peça no mundo e o retrato lê a mesma pose, então os dois falam juntos.
//
// A conversa para o `update` do mundo (e com ele o `NpcEntity.render`), por isso aqui ninguém disputa
// o tamanho do sprite; ao fechar, ele volta exatamente como estava.

const STIFFNESS = 520;
const DAMPING = 17;
/** Quanto de velocidade um `bounce` de 1 vira num empurrão. */
const KICK = 30;
const MAX_STEP_MS = 1000 / 30;
const BREATH_MS = 900;
const LEAN_EASE = 11;
const ENERGY_FADE = 3.5;
/** Quanto a largura cede quando a altura estica: o volume se conserva, é o que parece carne. */
const SQUASH = 0.6;
/** Quanto o corpo sai do chão, em tiles, por unidade de esticada. */
const LIFT = 0.55;
/** O corpo no mundo é pequeno na tela: o balanço dele é maior que o do retrato. */
const WORLD_LEAN = 2.5;

export class TalkingBody {
  /** A esticada atual: acima de zero é mais alto, abaixo é achatado. */
  public stretch = 0;
  /** A inclinação atual, de -1 a 1 vezes o `lean` da voz. */
  public lean = 0;

  private velocity = 0;
  private leanTarget = 0;
  private side = 1;
  private energy = 0;
  private clockMs = 0;
  private shiver = 0;

  private readonly baseX: number;
  private readonly baseY: number;
  private readonly baseW: number;
  private readonly baseH: number;
  private readonly baseElevation: number;

  public constructor(private readonly sprite?: Billboard3D) {
    this.baseX = sprite?.x ?? 0;
    this.baseY = sprite?.y ?? 0;
    this.baseW = sprite?.displayWidth ?? 1;
    this.baseH = sprite?.scaleY ?? 1;
    this.baseElevation = sprite?.elevation ?? 0;
  }

  /** Uma sílaba saiu. `accent` é maior no começo de palavra: é onde a fala tem peso. */
  public kick(persona: VoicePersona, accent: number): void {
    this.velocity += persona.bounce * accent * KICK;
    this.side = -this.side;
    this.leanTarget = this.side * persona.lean * accent;
    this.shiver = persona.shiver;
    this.energy = 1;
  }

  public update(deltaMs: number): void {
    const dt = Math.min(deltaMs, MAX_STEP_MS) / 1000;
    this.clockMs += deltaMs;
    // Euler semi-implícito: a mola continua estável com o frame longo de um celular fraco.
    this.velocity += (-STIFFNESS * this.stretch - DAMPING * this.velocity) * dt;
    this.stretch += this.velocity * dt;
    this.energy = Math.max(0, this.energy - ENERGY_FADE * dt);
    // Sem fala, o corpo volta a prumo devagar em vez de ficar torto na última sílaba.
    const lean = this.energy > 0 ? this.leanTarget : 0;
    this.lean += (lean - this.lean) * Math.min(1, LEAN_EASE * dt);
    if (!this.sprite) return;

    const breath = Math.sin(this.clockMs / BREATH_MS) * 0.012;
    const tremble = Math.sin(this.clockMs * 0.075) * this.shiver * this.energy;
    this.sprite
      .setDisplaySize(
        this.baseW * (1 - this.stretch * SQUASH - breath * 0.4),
        this.baseH * (1 + this.stretch + breath),
      )
      .setPosition(this.baseX + this.lean * WORLD_LEAN + tremble, this.baseY)
      .setElevation(this.baseElevation + Math.max(0, this.stretch) * LIFT);
  }

  public restore(): void {
    this.sprite
      ?.setDisplaySize(this.baseW, this.baseH)
      .setPosition(this.baseX, this.baseY)
      .setElevation(this.baseElevation);
  }
}
