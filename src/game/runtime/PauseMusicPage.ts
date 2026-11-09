// A PÁGINA DE MÚSICA DA PAUSA: a lista das faixas do vale, a que está tocando, e o volume. Montada uma vez; o que a
// escolha toca é do SoundManager.

import { formatTime, getJukebox, JUKEBOX_TRACKS } from '@/game/audio/Jukebox';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t } from '@/game/i18n/i18n';
import type { OptionDef, OptionRow } from './PauseRows';
import type { PauseMenu } from './PauseMenu';

export const onOff = (read: () => boolean, write: (v: boolean) => void): Extract<OptionDef, { kind: 'choice' }>['values'] => [
  { text: () => t('pause.on'), apply: () => write(true), active: read },
  { text: () => t('pause.off'), apply: () => write(false), active: () => !read() },
];

/** O que PauseMusicPage usa de PauseMenu. */
export type PauseMusicPageHost = Pick<PauseMenu,
  'musicList' | 'musicRows' | 'rowKit' | 'select'
>;

export class PauseMusicPage {
  public constructor(private readonly host: PauseMusicPageHost) {}

  /** Uma linha nova numa página com lista: entra na seleção (mouse e dedo) e na seção. */
  private addRow(rows: OptionRow[], row: OptionRow, box: HTMLElement): void {
    const index = rows.length;
    rows.push(row);
    row.el.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') this.host.select(index); });
    row.el.addEventListener('pointerdown', () => this.host.select(index));
    row.refresh();
    box.appendChild(row.el);
  }

  private section(list: HTMLElement, title: string): HTMLElement {
    const box = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = t(title);
    box.appendChild(heading);
    list.appendChild(box);
    return box;
  }

  public buildMusicPage(): void {
    const jb = getJukebox();
    const sound = getSoundManager();
    const player = this.section(this.host.musicList, 'pause.musicControls');

    // anterior · tocar/pausar · próxima — o nome da faixa que toca fica à esquerda
    {
      const el = this.host.rowKit.rowEl('pause.musicPick');
      const name = el.firstChild as HTMLSpanElement;
      const value = document.createElement('span');
      value.className = 'zh-pause-value';
      const button = (glyph: string, label: string, onClick: () => void): HTMLButtonElement => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'zh-music-btn';
        btn.textContent = glyph;
        btn.setAttribute('aria-label', t(label));
        btn.addEventListener('click', (event) => { event.stopPropagation(); onClick(); });
        return btn;
      };
      const play = button('>', 'pause.musicPlay', () => jb.toggle());
      play.classList.add('zh-big');
      value.append(button('|<', 'pause.musicPrev', () => jb.prev()), play, button('>|', 'pause.musicNext', () => jb.next()));
      el.appendChild(value);
      this.addRow(this.host.musicRows, {
        el,
        step: (direction) => (direction < 0 ? jb.prev() : jb.next()),
        activate: () => jb.toggle(),
        refresh: () => {
          name.textContent = jb.track ? t(jb.track.title) : t('pause.musicPick');
          play.textContent = jb.playing ? '||' : '>';
          play.setAttribute('aria-label', t(jb.playing ? 'pause.musicPause' : 'pause.musicPlay'));
        },
      }, player);
    }

    // a posição: arrasta na barra, ou setas de 10 em 10 segundos
    {
      const el = this.host.rowKit.rowEl('pause.musicPosition');
      const seek = document.createElement('span');
      seek.className = 'zh-music-seek';
      const bar = document.createElement('div');
      bar.className = 'zh-music-bar';
      bar.setAttribute('role', 'slider');
      bar.setAttribute('aria-label', t('pause.musicPosition'));
      const fill = bar.appendChild(document.createElement('i'));
      const time = document.createElement('b');
      time.className = 'zh-music-time';
      seek.append(bar, time);
      el.appendChild(seek);
      const fromPointer = (event: PointerEvent): void => {
        const rect = bar.getBoundingClientRect();
        jb.seek(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * jb.duration);
      };
      bar.addEventListener('pointerdown', (event) => {
        if (!jb.duration) return;
        bar.setPointerCapture(event.pointerId);
        fromPointer(event);
      });
      bar.addEventListener('pointermove', (event) => { if (bar.hasPointerCapture(event.pointerId)) fromPointer(event); });
      this.addRow(this.host.musicRows, {
        el,
        step: (direction) => jb.seek(jb.time + direction * 10),
        activate: () => jb.toggle(),
        refresh: () => {
          const total = jb.duration || jb.track?.seconds || 0;
          fill.style.width = `${total ? Math.min(100, (jb.time / total) * 100) : 0}%`;
          time.textContent = `${formatTime(jb.time)} / ${formatTime(total)}`;
          bar.setAttribute('aria-valuenow', String(Math.round(jb.time)));
        },
      }, player);
    }

    this.addRow(this.host.musicRows, this.host.rowKit.choiceRow({
      kind: 'choice',
      label: 'pause.musicRepeat',
      values: (['all', 'one', 'off'] as const).map((mode) => ({
        text: () => t({ all: 'pause.repeatAll', one: 'pause.repeatOne', off: 'pause.repeatOff' }[mode]),
        apply: () => jb.setRepeat(mode),
        active: () => jb.repeat === mode,
      })),
    }), player);
    this.addRow(this.host.musicRows, this.host.rowKit.choiceRow({
      kind: 'choice', label: 'pause.musicShuffle', values: onOff(() => jb.shuffle, (v) => jb.setShuffle(v)),
    }), player);
    // o mesmo volume de música das Opções: ajustar aqui é ajustar o do jogo
    this.addRow(this.host.musicRows, this.host.rowKit.levelRow({
      kind: 'level',
      label: 'pause.musicVolume',
      read: () => sound.getMusicVolume(),
      write: (v) => { sound.setMusicVolume(v); jb.refreshVolume(); },
    }), player);

    const list = this.section(this.host.musicList, 'pause.musicPage');
    JUKEBOX_TRACKS.forEach((track, i) => {
      const el = document.createElement('div');
      el.className = 'zh-pause-row zh-music-track';
      const left = document.createElement('span');
      const mark = document.createElement('span');
      mark.className = 'zh-music-mark';
      const title = document.createElement('span');
      title.textContent = t(track.title);
      left.append(mark, title);
      const right = document.createElement('span');
      right.className = 'zh-pause-value';
      const when = document.createElement('span');
      when.className = 'zh-music-when';
      when.textContent = t(track.when);
      const length = document.createElement('span');
      length.textContent = formatTime(track.seconds);
      right.append(when, length);
      el.append(left, right);
      const choose = (): void => { if (jb.index === i) jb.toggle(); else jb.play(i); };
      el.addEventListener('click', choose);
      this.addRow(this.host.musicRows, {
        el,
        step: () => { /* a faixa não tem anterior nem próxima: são as setas para cima e para baixo */ },
        activate: choose,
        refresh: () => {
          const current = jb.index === i;
          el.classList.toggle('is-current', current);
          mark.textContent = current ? (jb.playing ? '>' : '=') : '';
          if (current && jb.duration) length.textContent = formatTime(jb.duration);
        },
      }, list);
    });
  }
}
