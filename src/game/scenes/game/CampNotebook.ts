// O CADERNO DE CAMPO DO ACAMPAMENTO (pedido do autor, 2026-11-11): o Z no caderninho em cima do colchão abre a coleção
// de tudo que o herói já pegou (runtime/notebook, a lista; runtime/NotebookOverlay, a tela).

import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { FUNGUS_SPECS, isMushroomKind } from '@/game/fungi/fungi';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t, tWords } from '@/game/i18n/i18n';
import { notebookEntries } from '@/game/runtime/notebook';
import { NotebookOverlay, type NotebookPage, type NotebookView } from '@/game/runtime/NotebookOverlay';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { spriteDataUrl } from '@/game/runtime/spriteDataUrl';
import type * as Engine from '@/game/engine';
import type { GameScene } from '../GameScene';
import { ITEM_VISUAL_2D } from './sceneDefs';

/** O que CampNotebook usa de GameScene (e a cena do motor, de onde saem as artes). */
export type CampNotebookHost = Engine.Scene & Pick<GameScene, 'actions' | 'seenItems' | 'steps'>;

export class CampNotebook {
  /** O caderno aberto. Enquanto ele existe, o mundo fica parado (FrameTick) e as mãos também (ActionInput). */
  public overlay?: NotebookOverlay;

  public constructor(private readonly host: CampNotebookHost) {}

  public open(): void {
    if (this.overlay) return;
    this.host.actions.useBufferMs = 0;
    this.host.steps.stopBreathing();
    this.host.actions.actionButtons?.setVisible(false);
    // A tarja de teclas do jogo some, como na bancada: o rodapé do caderno diz o que as teclas fazem ali.
    this.host.actions.controlsHint?.destroy();
    this.host.actions.controlsHint = undefined;
    getSoundManager().ui.playPaperUnfold();
    const touch = isTouchDevice();
    this.overlay = new NotebookOverlay({
      view: this.view(touch),
      onClose: () => {
        this.overlay = undefined;
        this.host.actions.actionButtons?.setVisible(true);
      },
    }, touch);
  }

  /** As páginas, com o texto e a arte do jogo (a mesma de toda a interface: ITEM_VISUAL_2D). */
  public view(touch = false): NotebookView {
    const entries = notebookEntries(this.host.seenItems);
    const known = entries.filter((e) => e.known).length;
    return {
      title: t('notebook.title'),
      count: t('notebook.count').replace('{n}', String(known)).replace('{total}', String(entries.length)),
      pages: entries.map((e) => this.page(e.kind, t(`notebook.sections.${e.section}`), e.known)),
      foot: t(touch ? 'notebook.keysTouch' : 'notebook.keys'),
      unknownName: t('notebook.unknownName'),
      unknownText: t('notebook.unknownText'),
    };
  }

  private page(kind: HeldItemKind, section: string, known: boolean): NotebookPage {
    const visual = ITEM_VISUAL_2D[kind];
    const base = {
      kind, section, known, name: t(`items.name.${kind}`),
      icon: spriteDataUrl(this.host, visual.texture, visual.frame, 2),
      art: spriteDataUrl(this.host, visual.texture, visual.frame, 6),
    };
    if (!isMushroomKind(kind)) return { ...base, text: [t(`notebook.entry.${kind}`)] };
    // O COGUMELO: a mesma ficha da colheita (o nome científico, se se come, a curiosidade e as notas).
    const species = `fungi.species.${kind}`;
    const edibility = FUNGUS_SPECS[kind].edibility;
    return {
      ...base,
      latin: t(`${species}.latin`),
      edibility: { label: t(`fungi.edibility.${edibility}`), poison: edibility === 'poison' },
      text: [t(`${species}.curiosity`)],
      notes: tWords(`${species}.notes`),
    };
  }

  /** Fecha sem avisar ninguém: o desmonte da cena. */
  public destroy(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
  }
}
