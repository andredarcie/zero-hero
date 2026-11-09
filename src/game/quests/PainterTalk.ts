// AS CONVERSAS COM A SISI: o que ela diz em cada etapa do pedido, e o que cada conversa entrega ou pede de volta. O
// estado da etapa e os presentes são da PainterQuest.

import { getSoundManager } from '@/game/audio/SoundManager';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import { t, tLines, type I18nLine } from '@/game/i18n/i18n';
import { isLastQuest } from '@/game/runtime/QuestLog';
import { PLOT_COUNT } from '@/game/quests/dyePlants';
import type { PainterQuest } from './PainterQuest';

/** O que PainterTalk usa de PainterQuest. */
export type PainterTalkHost = Pick<PainterQuest,
  'garden' | 'give' | 'host' | 'isDone' | 'resupply' | 'save' | 'shovelTile' | 'studio' | 'table'
>;

export class PainterTalk {
  public constructor(private readonly host: PainterTalkHost) {}

  /** Falar com ela. Devolve false quando a quest acabou: daí em diante é a conversa de sempre. */
  public talk(base: DialogScript, at: { worldX: number; worldY: number }): boolean {
    if (this.host.isDone) return false;
    const say = (lines: I18nLine[], onClosed?: () => void, onLine?: (index: number) => void): void => {
      this.host.host.say({ ...base, lines, onLine }, at, () => {
        onClosed?.();
        this.host.host.markHeard();
      });
    };
    const step = (key: string): I18nLine[] => tLines(`npc.painterStep.${key}`);
    const remaining = (key: string, n: number): I18nLine[] => step(key)
      .map((line) => ({ ...line, text: line.text.replace('{n}', String(n)) }));

    switch (this.host.save.stage) {
      case 'start':
        say(base.lines, () => {
          this.host.save.stage = 'dig';
          this.host.give('shovel', 1, at);
        });
        return true;
      case 'dig': {
        const left = PLOT_COUNT - this.host.host.dugHoles();
        if (left > 0) { say(remaining('dig', left), () => this.host.resupply('shovel', at)); return true; }
        this.returnShovel(at);
        say(step('seeds'), () => {
          this.host.save.stage = 'sow';
          this.host.give('dyeSeeds', PLOT_COUNT, at);
        });
        return true;
      }
      case 'sow': {
        const left = PLOT_COUNT - this.host.save.plots.length;
        if (left > 0) { say(remaining('sow', left), () => this.host.resupply('dyeSeeds', at, left)); return true; }
        say(step('bucket'), () => {
          this.host.save.stage = 'water';
          this.host.give('bucket', 1, at);
        });
        return true;
      }
      case 'water': {
        const left = this.host.save.plots.filter((plot) => !plot.watered).length;
        say(remaining('water', left), () => {
          if (this.host.host.held() !== 'bucket' && this.host.host.held() !== 'bucketFull' && !this.host.host.onGround('bucket') && !this.host.host.onGround('bucketFull')) this.host.give('bucket', 1, at);
        });
        return true;
      }
      case 'grow':
        say(step('wait'));
        return true;
      case 'harvest':
        // Sem mesa (nenhum tile livre em volta dela no boot), as mãos dela servem.
        if (!this.host.table && this.host.garden.flowersReady()) { this.host.studio.makePaint(base, at); return true; }
        say(step(this.host.save.plots.every((plot) => plot.cut) ? 'bring' : 'harvest'));
        return true;
      case 'paint':
        say(step('easel'), () => this.host.resupply('brush', at));
        return true;
      case 'review':
        // Se este é o último pedido do vale, a fala dela termina com a chave do jardim alto.
        say([...this.reviewLines(), ...(isLastQuest('painter') ? tLines('garden.key') : [])], () => this.finish(at));
        return true;
      default:
        return false;
    }
  }

  /** A pá volta e fica ao lado dela, para quem quiser pegar de novo. */
  private returnShovel(at: { worldX: number; worldY: number }): void {
    const tile = this.host.shovelTile ?? { x: at.worldX, y: at.worldY + 1 };
    const hero = this.host.host.hero();
    const inHand = this.host.host.held() === 'shovel';
    if (inHand) this.host.host.removeFromHand('shovel', 1);
    else if (!this.host.host.takeFromGround('shovel')) return;
    if (inHand) this.host.host.fling('shovel', hero.x, hero.y, tile.x, tile.y);
    this.host.host.dropAt('shovel', tile.x, tile.y);
    getSoundManager().ui.playItemStash();
    this.host.host.persist();
  }

  /** A última conversa: ela pega o pincel de volta, e a quest fecha. */
  private finish(at: { worldX: number; worldY: number }): void {
    const hero = this.host.host.hero();
    if (this.host.host.held() === 'brush') {
      this.host.host.removeFromHand('brush', 1);
      this.host.host.fling('brush', hero.x, hero.y, at.worldX, at.worldY);
    } else {
      this.host.host.takeFromGround('brush');
    }
    getSoundManager().ui.playItemStash();
    this.host.host.hop(at.worldX, at.worldY, 0.34);
    this.host.host.hearts(at.worldX, at.worldY);
    this.host.save.stage = 'done';
    this.host.host.persist();
    this.host.host.closeQuest();
  }

  private reviewLines(): I18nLine[] {
    const { form, color } = this.host.save.review ?? { form: 'middle', color: 'all' };
    return [
      { speaker: 'npc', text: t(`npc.painterReview.form.${form}`) },
      { speaker: 'npc', text: t(`npc.painterReview.color.${color}`) },
      ...tLines('npc.painterReview.thanks'),
    ];
  }
}
