// O LEIAUTE DO TEXTO: a quebra de linha (a simples e a avançada, por largura) e a medida de cada linha e do bloco,
// com o contexto 2D do próprio Text. Licenças em LICENSES.md.

import type { Text } from './Text';

export interface TextMetrics { ascent: number; descent: number; fontSize: number }

export class TextLayout {
  public constructor(private readonly host: Text) {}

  public runWordWrap(text: string): string {
    const style = this.host.style;
    if (style.wordWrapCallback) {
      const wrapped = style.wordWrapCallback.call(style.wordWrapCallbackScope, text, this.host);
      return Array.isArray(wrapped) ? wrapped.join('\n') : wrapped;
    }
    if (style.wordWrapWidth) {
      return style.wordWrapUseAdvanced
        ? this.advancedWordWrap(text, this.host.context, style.wordWrapWidth)
        : this.basicWordWrap(text, this.host.context, style.wordWrapWidth);
    }
    return text;
  }

  private advancedWordWrap(text: string, context: CanvasRenderingContext2D, wordWrapWidth: number): string {
    let output = '';
    const lines = text.replace(/ +/gi, ' ').split(this.host.splitRegExp);
    let linesCount = lines.length;
    for (let i = 0; i < linesCount; i++) {
      let line = lines[i];
      let out = '';
      line = line.replace(/^ *|\s*$/gi, '');
      const lineLetterSpacingWidth = line.length * this.host.letterSpacing;
      const lineWidth = context.measureText(line).width + lineLetterSpacingWidth;
      if (lineWidth < wordWrapWidth) {
        output += `${line}\n`;
        continue;
      }
      let currentLineWidth = wordWrapWidth;
      const words = line.split(' ');
      for (let j = 0; j < words.length; j++) {
        const word = words[j];
        const wordWithSpace = `${word} `;
        const letterSpacingWidth = wordWithSpace.length * this.host.letterSpacing;
        let wordWidth = context.measureText(wordWithSpace).width + letterSpacingWidth;
        if (wordWidth > currentLineWidth) {
          if (j === 0) {
            let newWord = wordWithSpace;
            while (newWord.length) {
              newWord = newWord.slice(0, -1);
              const newLetterSpacingWidth = newWord.length * this.host.letterSpacing;
              wordWidth = context.measureText(newWord).width + newLetterSpacingWidth;
              if (wordWidth <= currentLineWidth) break;
            }
            if (!newWord.length) throw new Error('wordWrapWidth < a single character');
            words[j] = word.substr(newWord.length);
            out += newWord;
          }
          const offset = words[j].length ? j : j + 1;
          const remainder = words.slice(offset).join(' ').replace(/[ \n]*$/gi, '');
          lines.splice(i + 1, 0, remainder);
          linesCount = lines.length;
          break;
        } else {
          out += wordWithSpace;
          currentLineWidth -= wordWidth;
        }
      }
      output += `${out.replace(/[ \n]*$/gi, '')}\n`;
    }
    return output.replace(/[\s|\n]*$/gi, '');
  }

  private basicWordWrap(text: string, context: CanvasRenderingContext2D, wordWrapWidth: number): string {
    let result = '';
    const lines = text.split(this.host.splitRegExp);
    const lastLineIndex = lines.length - 1;
    const whiteSpaceWidth = context.measureText(' ').width;
    for (let i = 0; i <= lastLineIndex; i++) {
      let spaceLeft = wordWrapWidth;
      const words = lines[i].split(' ');
      const lastWordIndex = words.length - 1;
      for (let j = 0; j <= lastWordIndex; j++) {
        const word = words[j];
        const letterSpacingWidth = word.length * this.host.letterSpacing;
        const wordWidth = context.measureText(word).width + letterSpacingWidth;
        let wordWidthWithSpace = wordWidth;
        if (j < lastWordIndex) wordWidthWithSpace += whiteSpaceWidth;
        if (wordWidthWithSpace > spaceLeft) {
          if (j > 0) {
            result += '\n';
            spaceLeft = wordWrapWidth;
          }
        }
        result += word;
        if (j < lastWordIndex) {
          result += ' ';
          spaceLeft -= wordWidthWithSpace;
        } else {
          spaceLeft -= wordWidth;
        }
      }
      if (i < lastLineIndex) result += '\n';
    }
    return result;
  }

  public getTextSize(size: TextMetrics, lines: string[]): { width: number; height: number; lines: number; lineWidths: number[]; lineSpacing: number; lineHeight: number } {
    const context = this.host.context;
    const style = this.host.style;
    const lineWidths: number[] = [];
    let maxLineWidth = 0;
    let drawnLines = lines.length;
    if (style.maxLines > 0 && style.maxLines < lines.length) drawnLines = style.maxLines;
    style.syncFont(this.host.canvas, context);
    const letterSpacing = this.host.letterSpacing;
    for (let i = 0; i < drawnLines; i++) {
      let lineWidth = style.strokeThickness;
      if (letterSpacing === 0) {
        lineWidth += context.measureText(lines[i]).width;
      } else {
        const line = lines[i];
        for (let j = 0; j < line.length; j++) lineWidth += context.measureText(line[j]).width;
        if (line.length > 1) lineWidth += letterSpacing * (line.length - 1);
      }
      if (style.wordWrap) lineWidth -= context.measureText(' ').width;
      lineWidths[i] = Math.ceil(lineWidth);
      maxLineWidth = Math.max(maxLineWidth, lineWidths[i]);
    }
    const lineHeight = size.fontSize + style.strokeThickness;
    let height = lineHeight * drawnLines;
    const lineSpacing = this.host.lineSpacing;
    if (drawnLines > 1) height += lineSpacing * (drawnLines - 1);
    return { width: maxLineWidth, height, lines: drawnLines, lineWidths, lineSpacing, lineHeight };
  }
}
