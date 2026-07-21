import type Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

/**
 * O PORTAO DE BATER — a mesma grade da porta trancada, sem fechadura e sem chave. Ele abre
 * sozinho quando o heroi esbarra nele... se tiver ESPACO PARA ABRIR.
 *
 * A regra e fisica, nao um cadeado: um portao de bater gira para o lado de la, entao qualquer
 * coisa parada no tile de tras trava a folha. Encoste com o mato crescido do outro lado e ele
 * empurra, range e volta. Isso e o oposto de tudo o mais que fecha caminho neste jogo — as
 * outras travas tem UMA chave (CLAUDE.md: "todo obstaculo e uma fechadura com exatamente uma
 * chave"). Aqui nao ha item nenhum a procurar: o que resolve e mudar o MUNDO do outro lado, e o
 * unico jeito de mudar um lado onde voce nao pode entrar e mandar alguma coisa la — o fogo, o
 * braco robotico.
 *
 * A recusa NAO pode ser o tremor da porta trancada. Aquele tremor e o vocabulario de "isto e
 * solido, esqueca" — e este portao nao esta recusando, esta TENTANDO. Entao ele comeca a abrir
 * de verdade (a folha afina alguns por cento, como no comeco do giro), bate no que esta atras e
 * volta, duas vezes. O jogador tem de ver a folha se mexer para entender que o problema esta do
 * outro lado e nao na mao dele.
 */
export class SwingGateObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private open = false;
  /** Quantas vezes ele ja tentou e nao conseguiu — so para o debug/playtest ler. */
  private refusals = 0;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = world3d()
      .addBillboard('swing-gate-object', 0, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.98, 0.98)
      // O mesmo tint da porta trancada, pelo mesmo motivo: metal quase branco estoura em bloom
      // debaixo do ambiente noturno e a grade vira neon.
      .setTint(0xcfcfcf);
  }

  /** O tile e intransponivel enquanto o portao estiver fechado. */
  public get blocking(): boolean {
    return !this.open;
  }

  public get isOpen(): boolean {
    return this.open;
  }

  public get refusalCount(): number {
    return this.refusals;
  }

  /**
   * Abre de vez. Quem chama ja checou o tile de tras — a decisao e da GameScene, que e quem
   * sabe o que conta como "objeto" (ver isTileOccupied); o portao so sabe se abrir.
   */
  public swingOpen(): boolean {
    if (this.open) return false;
    this.open = true;
    // Mesma abertura da porta trancada: a folha afina e apaga ate virar so o batente. Os dois
    // portoes tem de abrir igual — a diferenca entre eles esta em QUANDO, nunca em como.
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 0.2,
      alpha: 0.25,
      duration: 260,
      ease: 'Back.easeIn',
    });
    return true;
  }

  /**
   * Tentou abrir e bateu em alguma coisa. A folha sai do batente, trava e volta — duas vezes,
   * cada uma mais curta, como uma coisa que insiste e desiste.
   */
  public refuse(): void {
    if (this.open) return;
    this.refusals += 1;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setDisplaySize(0.98, 0.98).setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      // 12% de giro: o suficiente para a folha SE MEXER e nao o bastante para abrir vao nenhum.
      scaleX: 0.98 * 0.88,
      duration: 90,
      ease: 'Quad.easeOut',
      yoyo: true,
      repeat: 1,
      onComplete: () => { this.sprite.setDisplaySize(0.98, 0.98); },
    });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
