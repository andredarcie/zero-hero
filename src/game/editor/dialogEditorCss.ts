// O ESTILO DO EDITOR DE FALAS (editor/DialogEditor): três colunas (os personagens, as conversas, a coluna de quem
// escreve), letra de leitura nos campos (a de livro do jogo, grande), a margem dos versos alinhada linha a linha com
// o campo (LINE_PX), e a prévia na tábua da caixa de fala do jogo.

import { BOOK_FONT, WOOD_PANEL } from '@/game/runtime/uiStyle';
import { LINE_PX } from './DialogEditorBox';

const STYLE_ID = 'zh-falas-style';
const R = '#zh-editor-root';

const CSS = `
${R} .zh-falas { pointer-events: auto; width: calc(100vw - 24px); max-width: 1720px; height: calc(100vh - 24px); display: grid; grid-template-rows: auto auto minmax(0, 1fr); background: #0e1a20; border: 1px solid #2b4551; border-radius: 6px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); font-size: 14px; }
${R} .zh-falas-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #1a2c34; flex-wrap: wrap; }
${R} .zh-falas-head h2 { margin: 0; font-family: 'Press Start 2P', monospace; font-size: 13px; color: #f4a261; }
${R} .zh-falas-head input[type=search] { flex: 1 1 240px; max-width: 420px; font-size: 14px; padding: 7px 10px; }
${R} .zh-falas-head .zh-btn { font-size: 13px; padding: 7px 12px; }
${R} .zh-falas-toggle { display: flex; align-items: center; gap: 5px; color: #a9c6cc; cursor: pointer; font-size: 13px; }
${R} .zh-falas-status { flex: 1 1 auto; font-size: 13px; color: #9dbcc3; text-align: right; }
${R} .zh-falas-status .on { color: #ffb057; }
${R} .zh-falas-banner { display: none; align-items: center; gap: 10px; padding: 9px 14px; font-size: 13px; flex-wrap: wrap; }
${R} .zh-falas-banner.on { display: flex; }
${R} .zh-falas-banner.warn { background: #3a2412; color: #ffd8b0; }
${R} .zh-falas-banner.info { background: #12303a; color: #cfe9f1; }
${R} .zh-falas-main { display: grid; grid-template-columns: 220px minmax(0, 1fr) 360px; min-height: 0; }
${R} .zh-falas-list { overflow-y: auto; border-right: 1px solid #1a2c34; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
${R} .zh-falas-list .zh-btn { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 8px; text-align: left; padding: 7px 8px; font-size: 14px; }
${R} .zh-falas-list img { width: 28px; height: 28px; image-rendering: pixelated; }
${R} .zh-falas-list .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${R} .zh-falas-list .who small { display: block; color: #6d949d; font-size: 11px; }
${R} .zh-falas-list .zh-btn.active .who small { color: #3c2a12; }
${R} .zh-falas-list button.zh-btn.active, ${R} .zh-falas-list button.zh-btn.active:hover:not(:disabled) { background: #f4a261; border-color: #ffd59e; color: #10202a; font-weight: 700; }
${R} .zh-falas-list .badge { font-size: 11px; color: #10202a; background: #ffb057; border-radius: 9px; padding: 1px 7px; }
${R} .zh-falas-list .zh-btn.off { opacity: 0.45; }
${R} .zh-falas-body { overflow-y: auto; padding: 14px 18px 60px; }
${R} .zh-falas-group { margin: 20px 0 8px; color: #f4a261; font-size: 15px; }
${R} .zh-falas-empty { color: #8fb2ba; margin: 40px auto; text-align: center; font-size: 15px; }
${R} .zh-fala { margin: 0 0 16px; padding: 10px 12px 12px; border: 1px solid #1f3540; border-radius: 5px; background: #0c1519; }
${R} .zh-fala-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
${R} .zh-fala-text h4 { margin: 0; color: #f1e7cf; font-size: 16px; font-weight: 600; }
${R} .zh-fala-when { margin: 2px 0 0; color: #8fb2ba; font-size: 13px; }
${R} .zh-fala-unused { margin-left: 10px; padding: 1px 7px; border-radius: 9px; background: #2a3a40; color: #9db0b6; font-size: 11px; font-weight: 400; vertical-align: middle; }
${R} .zh-fala.is-unused { opacity: 0.72; }
${R} .zh-fala-code { color: #4f7480; font-size: 11px; white-space: nowrap; margin-top: 3px; }
${R} .zh-fala-add { margin-top: 8px; }
${R} .zh-name-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
${R} .zh-name-col { display: flex; flex-direction: column; gap: 3px; }
${R} .zh-name-col input { font-size: 15px; }
${R} .zh-box { padding: 10px 0 10px; border-top: 1px dashed #1a2c34; }
${R} .zh-box:first-of-type { border-top: 0; }
${R} .zh-box-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
${R} .zh-box-n { width: 22px; height: 22px; border-radius: 50%; background: #16272e; color: #8fb2ba; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
${R} .zh-speaker { display: inline-flex; border: 1px solid #2b4551; border-radius: 4px; overflow: hidden; }
${R} .zh-speaker-btn { display: inline-flex; align-items: center; gap: 6px; background: #101d23; color: #8fb2ba; border: 0; padding: 4px 10px; font: inherit; font-size: 13px; cursor: pointer; }
${R} .zh-speaker-btn + .zh-speaker-btn { border-left: 1px solid #2b4551; }
${R} .zh-speaker-btn img { width: 18px; height: 18px; image-rendering: pixelated; }
${R} .zh-speaker-btn.is-on { background: #f4a261; color: #10202a; font-weight: 700; }
${R} .zh-box-actions { margin-left: auto; display: flex; gap: 4px; opacity: 0.55; transition: opacity 120ms; }
${R} .zh-box:hover .zh-box-actions, ${R} .zh-box:focus-within .zh-box-actions { opacity: 1; }
${R} .zh-btn.zh-icon { width: 28px; padding: 3px 0; font-size: 13px; }
${R} .zh-box-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
${R} .zh-box-cols.zh-one { grid-template-columns: minmax(0, 760px); }
${R} .zh-box-col { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
${R} .zh-box-lang { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #6d949d; }
${R} .zh-ta { display: grid; grid-template-columns: minmax(0, 1fr) 54px; align-items: start; }
${R} .zh-ta textarea { resize: none; overflow-y: hidden; overflow-x: auto; white-space: pre; font-family: ${BOOK_FONT}; font-size: 17px; line-height: ${LINE_PX}px; padding: 9px 12px; border-radius: 4px 0 0 4px; background: #13222a; color: #f3ecdc; }
${R} .zh-ta textarea:focus { outline: 2px solid #f4a261; outline-offset: -1px; }
${R} .zh-en .zh-ta { grid-template-columns: minmax(0, 1fr); }
${R} .zh-en .zh-ta textarea { border-radius: 4px; color: #d6dee2; }
${R} .zh-box.is-narr textarea { font-style: italic; color: #c9d2e3; }
${R} .zh-gutter { padding-top: 10px; border: 1px solid #2b4551; border-left: 0; border-radius: 0 4px 4px 0; min-height: 100%; background: #0f1c22; }
${R} .zh-en .zh-gutter { display: none; }
${R} .zh-g { height: ${LINE_PX}px; line-height: ${LINE_PX}px; font-size: 12px; color: #9fe0a8; text-align: center; white-space: nowrap; }
${R} .zh-g.bad { color: #ffb057; font-weight: 700; }
${R} .zh-g .rh { font-style: normal; margin-left: 4px; font-size: 10px; }
${R} .zh-g .rh.ok { color: #9fe0a8; }
${R} .zh-g .rh.bad { color: #ffb057; }
${R} .zh-rhyme { min-height: 18px; font-size: 12px; color: #6d949d; }
${R} .zh-rhyme .ok { color: #9fe0a8; }
${R} .zh-rhyme .bad { color: #ffb057; }
${R} .zh-box-warn { margin: 6px 0 0; padding: 6px 10px 6px 26px; color: #ffcf9a; background: rgba(255, 176, 87, 0.08); border-left: 3px solid #ffb057; border-radius: 3px; font-size: 13px; line-height: 1.5; }
${R} .zh-box-warn:empty { display: none; }
${R} .zh-side { overflow-y: auto; border-left: 1px solid #1a2c34; padding: 12px 14px 30px; display: flex; flex-direction: column; gap: 16px; }
${R} .zh-side h4 { margin: 0 0 8px; color: #f4a261; font-size: 13px; letter-spacing: 0.5px; }
${R} .zh-prev-stage { background: radial-gradient(ellipse at 50% 30%, #2c4a35, #142219 70%); border-radius: 5px; padding: 26px 10px 12px; min-height: 140px; display: flex; align-items: flex-end; }
${R} .zh-prev-box { position: relative; width: 100%; display: flex; gap: 10px; padding: 10px 26px 12px 12px; ${WOOD_PANEL} font-size: 16px; }
${R} .zh-prev-box.zh-narr { color: #c9d2e3; font-style: italic; }
${R} .zh-prev-portrait { width: 48px; height: 48px; flex: none; image-rendering: pixelated; border: 2px solid #fff; background: #0b0906; }
${R} .zh-prev-col { min-width: 0; }
${R} .zh-prev-name { font-variant: small-caps; letter-spacing: 0.05em; margin-bottom: 4px; }
${R} .zh-prev-verse { line-height: 1.42; white-space: nowrap; }
${R} .zh-prev-verse.zh-rhyme { padding-left: 1.6em; }
${R} .zh-prev-em { color: #ffd36b; font-weight: 700; }
${R} .zh-prev-next { position: absolute; right: 9px; bottom: 6px; color: #d4c8a4; font-size: 13px; }
${R} .zh-prev-empty { color: #b9c7b4; font-size: 13px; text-align: center; width: 100%; margin: 0; }
${R} .zh-prev-nav { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px; margin-top: 8px; }
${R} .zh-prev-pos { font-size: 12px; color: #8fb2ba; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${R} .zh-read { grid-column: 1 / -1; }
${R} .zh-ficha dl { margin: 0; font-size: 13px; line-height: 1.5; }
${R} .zh-ficha dt { color: #6d949d; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-top: 6px; }
${R} .zh-ficha dd { margin: 0; color: #d6e6ea; }
${R} .zh-guia summary { cursor: pointer; color: #f4a261; font-size: 13px; }
${R} .zh-guia ul { margin: 8px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.55; color: #cfe3e8; }
${R} .zh-guia-src { font-size: 11px; color: #6d949d; margin: 8px 0 0; }
@media (max-width: 1280px) {
  ${R} .zh-falas-main { grid-template-columns: 190px minmax(0, 1fr) 300px; }
  ${R} .zh-box-cols { grid-template-columns: 1fr; }
}
`;

export const ensureDialogEditorStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};
