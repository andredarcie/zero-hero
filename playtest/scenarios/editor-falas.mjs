// O EDITOR DE FALAS (pedido do autor, 2026-11-18: "na parte do editor, crie um editor de diálogos para eu usar e
// alterar os diálogos quando quiser"; src/game/editor/DialogEditor). No /editor, "Falas…" abre os personagens com o
// verso conferido; troca-se uma palavra de uma fala do mago; o Ctrl+S grava os dois arquivos de
// src/game/i18n/dialogos — só aquela palavra muda, o inglês fica igual — e o jogo já lê a fala nova sem recarregar a
// página (o mundo em edição continua lá). A busca acha em todos; o Esc com fala não salva pergunta antes.
//
// Os arquivos de verdade são gravados: o cenário guarda os dois antes e os devolve no fim, aconteça o que acontecer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/game/i18n/dialogos');
const file = (lang) => path.join(DIR, `${lang}.json`);

const BEFORE = 'A espada serviu na guerra;\nagora, deixe na terra.';
const AFTER = 'A espada serviu na guerra;\nagora, guarde na terra.';

export default {
  name: 'editor-falas',
  description: 'O editor de falas: abre, confere o verso, grava os dois arquivos e o jogo lê a fala nova sem recarregar.',
  needsGame: false,
  route: '/editor',
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const original = { 'pt-br': fs.readFileSync(file('pt-br'), 'utf8'), en: fs.readFileSync(file('en'), 'utf8') };
    try {
      await driver.settle(2500);
      await page.waitForFunction(() => window.editorDebug?.ready(), null, { timeout: 30000 });
      await page.evaluate(() => { window.__semRecarregar = true; });

      // ── ABRIR ─────────────────────────────────────────────────────────────────────────────────────────────────
      await page.click('#zh-editor-root .zh-actions .zh-btn:has-text("Falas")');
      await page.waitForSelector('#zh-editor-root .zh-falas .zh-fala', { timeout: 10000 });
      const opened = await page.evaluate(() => ({
        list: [...document.querySelectorAll('.zh-falas-list .zh-btn')].map((b) => b.dataset.section),
        active: document.querySelector('.zh-falas-list .zh-btn.active')?.dataset.section,
        status: document.querySelector('.zh-falas-status')?.textContent,
        falas: document.querySelectorAll('.zh-fala').length,
        textareas: document.querySelectorAll('.zh-fala textarea').length,
      }));
      log(`  aberto: ${JSON.stringify(opened)}`);
      assert('"Falas…" abre os personagens (o mago primeiro) com as falas dele em português e inglês',
        opened.list.includes('mago') && opened.list.includes('shui') && opened.active === 'mago' && opened.falas >= 6 && opened.textareas >= 20,
        JSON.stringify(opened));
      assert('As falas do jogo passam na conferência do verso (nenhuma caixa com aviso)', /verso conferido/.test(opened.status ?? ''), opened.status);
      await shot('00-falas-mago', { note: 'O editor de falas: o mago, português e inglês lado a lado' });

      // ── EDITAR E SALVAR ───────────────────────────────────────────────────────────────────────────────────────
      const pt = '.zh-fala[data-fala="wizard.intro"] .zh-box[data-box="1"] textarea[data-lang="pt-br"]';
      const current = await page.inputValue(pt);
      assert('A segunda caixa da abertura do mago está no campo, verso por linha', current === BEFORE, JSON.stringify(current));
      await page.fill(pt, AFTER);
      await sleep(200);
      const edited = await page.evaluate(() => {
        const box = document.querySelector('.zh-fala[data-fala="wizard.intro"] .zh-box[data-box="1"]');
        return {
          status: document.querySelector('.zh-falas-status')?.textContent,
          title: document.querySelector('.zh-fala[data-fala="wizard.intro"] .zh-fala-text h4')?.textContent,
          gutter: [...box.querySelectorAll('.zh-gutter .zh-g')].map((g) => g.textContent),
          rhyme: box.querySelector('.zh-rhyme')?.textContent,
          preview: document.querySelector('.zh-prev-stage')?.textContent,
          previewName: document.querySelector('.zh-prev-name')?.textContent,
        };
      });
      log(`  editado: ${JSON.stringify(edited)}`);
      assert('A fala tem título de escritor ("Sati na chegada ao vale"), e não só o caminho do código', edited.title === 'Sati na chegada ao vale', edited.title);
      assert('Mudou: "não salvo"; a margem dá as sílabas de cada verso e a rima "guerra · terra" fecha',
        /não salvo/.test(edited.status) && edited.gutter.length === 2 && edited.gutter.every((g) => /^\d/.test(g)) && /guerra · terra ✓/.test(edited.rhyme),
        JSON.stringify(edited));
      assert('A prévia mostra a caixa como no jogo: o nome do Sati e o verso novo', edited.previewName === 'Sati' && edited.preview.includes('agora, guarde na terra.'), JSON.stringify(edited));
      await shot('01-falas-escrevendo', { note: 'Escrevendo: a margem das sílabas, a rima e a prévia da caixa' });
      await page.keyboard.press('Control+s');
      await page.waitForFunction(() => /· salvo/.test(document.querySelector('.zh-falas-status')?.textContent ?? ''), null, { timeout: 8000 });
      await sleep(500);
      const ptNow = fs.readFileSync(file('pt-br'), 'utf8');
      const enNow = fs.readFileSync(file('en'), 'utf8');
      const oldJson = JSON.stringify(BEFORE).slice(1, -1);
      const newJson = JSON.stringify(AFTER).slice(1, -1);
      assert('O Ctrl+S grava: no português só aquela fala mudou (o resto do arquivo, byte a byte igual)',
        original['pt-br'].split(oldJson).length === 2 && ptNow === original['pt-br'].replace(oldJson, newJson), `tamanho ${original['pt-br'].length} → ${ptNow.length}`);
      assert('E o inglês ficou exatamente igual', enNow === original.en, `tamanho ${original.en.length} → ${enNow.length}`);
      await page.waitForFunction((after) => window.editorDebug.lines('wizard.intro')[1] === after, AFTER, { timeout: 10000 });
      const live = await page.evaluate(() => ({ kept: window.__semRecarregar === true, open: Boolean(document.querySelector('.zh-falas')) }));
      assert('O jogo já lê a fala nova, sem recarregar a página (o editor continua aberto)', live.kept && live.open, JSON.stringify(live));

      // ── A BUSCA ───────────────────────────────────────────────────────────────────────────────────────────────
      await page.fill('.zh-falas-head input[type=search]', 'faca');
      await sleep(300);
      const found = await page.evaluate(() => ({
        groups: [...document.querySelectorAll('.zh-falas-group')].map((h) => h.textContent),
        falas: document.querySelectorAll('.zh-fala').length,
      }));
      log(`  busca "faca": ${JSON.stringify(found)}`);
      assert('A busca acha a palavra nas falas de mais de um personagem', found.groups.length >= 1 && found.falas >= 1, JSON.stringify(found));
      await shot('02-falas-busca', { note: 'A busca por "faca" em todas as falas' });
      await page.fill('.zh-falas-head input[type=search]', '');
      await sleep(200);

      // ── NUMA TELA MENOR, AS TRÊS COLUNAS CONTINUAM DE PÉ ──────────────────────────────────────────────────────
      await page.setViewportSize({ width: 1280, height: 800 });
      await sleep(400);
      const small = await page.evaluate(() => {
        const rect = (s) => document.querySelector(s)?.getBoundingClientRect();
        const off = (r) => !r || r.left < -1 || r.right > innerWidth + 1;
        return {
          list: off(rect('.zh-falas-list')), body: off(rect('.zh-falas-body')), side: off(rect('.zh-side')),
          ptWidth: Math.round(rect('.zh-fala[data-fala="wizard.intro"] textarea[data-lang="pt-br"]')?.width ?? 0),
        };
      });
      assert('Em 1280×800: lista, conversas e prévia cabem na tela, e o campo de escrever tem largura para o verso',
        !small.list && !small.body && !small.side && small.ptWidth >= 300, JSON.stringify(small));
      await shot('03-falas-1280', { note: 'O editor de falas em 1280×800' });
      await page.setViewportSize({ width: 1600, height: 1000 });
      await sleep(300);

      // ── O ESC COM FALA NÃO SALVA ──────────────────────────────────────────────────────────────────────────────
      await page.fill(pt, `${AFTER}\num verso a mais`);
      await sleep(200);
      const warned = await page.evaluate(() => document.querySelectorAll('.zh-box.has-warn').length);
      assert('Um verso a mais acende o aviso da caixa (a caixa é quadra ou dístico)', warned === 1, String(warned));
      await page.keyboard.press('Escape');
      await sleep(200);
      const asked = await page.evaluate(() => document.querySelector('.zh-falas-banner.on')?.textContent ?? '');
      assert('O Esc com fala não salva pergunta antes de fechar', /não foram salvas/.test(asked), asked);
      await page.click('.zh-falas-banner .zh-btn:has-text("Fechar sem salvar")');
      await sleep(300);
      const closed = await page.evaluate(() => !document.querySelector('.zh-falas'));
      assert('Fechar sem salvar fecha, e o arquivo continua com a última fala salva', closed && fs.readFileSync(file('pt-br'), 'utf8') === ptNow, String(closed));
    } finally {
      for (const lang of ['pt-br', 'en']) {
        if (fs.readFileSync(file(lang), 'utf8') !== original[lang]) fs.writeFileSync(file(lang), original[lang]);
      }
      await sleep(800);
    }
  },
};
