import { ASSET_KEYS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  LEVEL_PORTAL_PARTICLE_KEY,
  LEVEL_PORTAL_SIGIL_KEY,
} from '@/game/render3d/levelPortalTexture';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

const FRAME_MS = 135;
const FRAME_COUNT = 4;
const PARTICLE_COUNT = 8;
const TAU = Math.PI * 2;

type PortalParticle = {
  sprite: Billboard3D;
  cycleOffsetMs: number;
  lifeMs: number;
  side: -1 | 1;
  radius: number;
  swayPhase: number;
};

/**
 * Portal medieval 100% pixel-art. O arco e o vortice sao um unico Billboard3D animado por
 * frames inteiros; o glifo e os motes usam quads pixelados, nunca geometria volumetrica.
 * O tile continua caminhavel — entrar nele pertence a GameScene, nao a colisao.
 */
export class LevelPortalObject implements WorldProp {
  public readonly blocking = false;

  private readonly sprite: Billboard3D;
  private readonly sigil: Billboard3D;
  private readonly particles: PortalParticle[];
  private phaseMs = 0;
  private activated = false;
  private currentFrame = 0;
  /**
   * 0 = portal em repouso; 1 = engolindo com tudo. Enquanto sobe, as particulas DESCEM em
   * espiral para dentro em vez de subirem, o vortice acelera e o glifo abre.
   *
   * Inverter as particulas e o detalhe que faz a leitura: no repouso elas sobem, e o portal
   * parece exalar; invertidas, ele INSPIRA. E a mesma gramatica do resto do jogo (a brasa que
   * respira, o fantasma da bomba que pulsa) — um convite e uma coisa viva —, so que aqui a
   * coisa viva esta comendo.
   */
  private swallow = 0;

  public constructor(
    public readonly worldX: number,
    public readonly worldY: number,
  ) {
    const w3 = world3d();
    this.sigil = w3
      .addBillboard(LEVEL_PORTAL_SIGIL_KEY, 0, {
        flat: true,
        flatY: 0.045,
        additive: true,
        alphaTest: 0.01,
        fog: false,
        depthWrite: false,
        emissiveBoost: 1.35,
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(1.18, 0.62)
      .setAlpha(0.28);

    this.sprite = w3
      .addBillboard(ASSET_KEYS.levelPortal, 0, {
        groundShadow: { rx: 0.48, rz: 0.38, alpha: 0.38 },
        // O heroi pode ocupar o mesmo tile; a camada ground fixa o arco atras do corpo.
        depthLayer: 'ground',
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(1.08, 1.08);

    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, index): PortalParticle => {
      const side = index % 2 === 0 ? -1 : 1;
      const particle: PortalParticle = {
        sprite: w3.addBillboard(LEVEL_PORTAL_PARTICLE_KEY, 0, {
          additive: true,
          centered: true,
          alphaTest: 0.01,
          fog: false,
          depthWrite: false,
          emissiveBoost: 1.7,
        }),
        cycleOffsetMs: index * 173,
        lifeMs: 980 + (index % 3) * 170,
        side,
        radius: 0.39 + (index % 3) * 0.055,
        swayPhase: index * 1.73,
      };
      particle.sprite.setPosition(worldX, worldY).setVisible(false);
      return particle;
    });
  }

  public get isActivated(): boolean { return this.activated; }
  public get frame(): number { return this.currentFrame; }
  public get visibleParticleCount(): number {
    return this.particles.reduce((total, particle) => total + Number(particle.sprite.visible), 0);
  }

  public update(deltaMs: number): void {
    // Engolindo, o vortice chega a 4x: a aceleracao e o aviso de que aquilo deixou de ser
    // cenario e virou um evento.
    this.phaseMs += deltaMs * (this.activated ? 1.8 + this.swallow * 2.2 : 1);
    this.currentFrame = Math.floor(this.phaseMs / FRAME_MS) % FRAME_COUNT;
    this.sprite.setTexture(ASSET_KEYS.levelPortal, this.currentFrame).setAlpha(this.activated ? 1 : 0.96);

    // Pulso em quatro degraus: nenhum scale/tween subpixel borra a moldura de pedra.
    const pulseStep = Math.floor(this.phaseMs / 150) % 4;
    const pulseAlpha = [0.25, 0.38, 0.52, 0.36][pulseStep];
    this.sigil
      .setAlpha(this.activated ? 0.78 + this.swallow * 0.22 : pulseAlpha)
      .setDisplaySize(1.18 + this.swallow * 0.5, 0.62 + this.swallow * 0.26);

    for (const particle of this.particles) {
      const cycleMs = (this.phaseMs + particle.cycleOffsetMs) % particle.lifeMs;
      const progress = cycleMs / particle.lifeMs;
      const fadeIn = Math.min(1, progress / 0.14);
      const fadeOut = Math.min(1, (1 - progress) / 0.24);
      const visibility = Math.min(fadeIn, fadeOut);
      const sway = Math.sin(progress * TAU * 1.35 + particle.swayPhase) * 0.075;
      // Engolindo, o raio FECHA com o progresso (a particula cai para o centro) e a altura
      // desce em vez de subir. Os dois caminhos sao o mesmo ciclo lido ao contrario, entao a
      // troca nao tem costura: nenhuma particula salta de posicao quando o portal desperta.
      const inward = 1 - this.swallow;
      const radius = particle.radius * (inward + this.swallow * (1 - progress) * 1.35);
      const x = this.worldX + particle.side * radius + sway * inward;
      const z = this.worldY + Math.cos(progress * TAU + particle.swayPhase) * 0.035;
      const rising = 0.12 + progress * 1.02;
      const falling = 1.24 - progress * 1.06;
      const height = rising * inward + falling * this.swallow;
      const size = (0.075 + (particle.lifeMs % 3) * 0.006) * (0.72 + visibility * 0.28)
        * (1 + this.swallow * 0.5);
      particle.sprite
        .setVisible(visibility > 0.04)
        .setPosition(x, z)
        .setElevation(height)
        .setDisplaySize(size, size)
        .setAlpha(visibility * (this.activated ? 1 : 0.82));
    }
  }

  /** 0..1 — o quanto o portal esta engolindo. A GameScene tweena isto durante a succao. */
  public setSwallow(amount: number): void {
    this.swallow = Math.min(1, Math.max(0, amount));
  }

  public get swallowAmount(): number { return this.swallow; }

  public activate(): void {
    this.activated = true;
    this.sprite.setTint(0xffffff).setAlpha(1);
    this.sigil.setAlpha(0.78);
  }

  public deactivate(): void {
    this.activated = false;
    this.sprite.clearTint().setAlpha(0.96);
  }

  public destroy(): void {
    this.sprite.destroy();
    this.sigil.destroy();
    for (const particle of this.particles) particle.sprite.destroy();
  }
}
