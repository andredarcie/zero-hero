// ZERAR — joga a aventura inteira, do título aos créditos, numa partida só, com o teclado (e o mouse nos
// mini-games), do jeito que um jogador joga. Só LÊ o jogo para achar caminho. Ver playtest/lib/player.mjs.
//
//   abertura → Sisi → Marco → Thea → o colchão do acampamento (a Morte e a foice) → Shui
//   → a chave do jardim → o portão → a fogueira do fim → a frase das pequenas coisas e os créditos
//   → a manhã no acampamento (o jogo não volta ao título)
//
// ZERAR_FROM=<fase> recomeça de um save gravado no fim da fase anterior (playtest/results/zerar-saves/),
// para depurar uma fase sem jogar tudo de novo. A prova de verdade é a partida inteira, sem ZERAR_FROM.
// ZERAR_TO=<fase> para depois dessa fase (com o save gravado): a partida em blocos, cada um em primeiro plano.
//
// O CRONÔMETRO: cada fase grava em playtest/results/zerar-tempos.json quanto levou em tempo real (o do robô, que
// não hesita nem se perde) e no relógio do jogo (dias e minutos de jogo, que é o que as esperas de verdade custam).
import fs from 'node:fs';
import path from 'node:path';
import { makePlayer, sleep } from '../lib/player.mjs';
import { playThea } from './telescopio.mjs';

const SAVES = path.resolve('playtest/results/zerar-saves');
const TIMES = path.resolve('playtest/results/zerar-tempos.json');
const PHASES = ['abertura', 'recon', 'sisi', 'marco', 'thea', 'noite', 'shui', 'fim'];

export default {
  name: 'zerar',
  description: 'Joga do título ao fim numa partida só: abertura, os pedidos, a primeira noite, o portão, a fogueira, os créditos e a manhã seguinte.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    const T0 = Date.now();
    const say = (m) => console.log(`[zerar ${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
    const P = makePlayer({ page, log: say });
    const from = process.env.ZERAR_FROM ?? PHASES[0];
    const fromIndex = PHASES.indexOf(from);
    if (fromIndex < 0) throw new Error(`ZERAR_FROM desconhecida: ${from}`);

    const checkpoint = async (name) => {
      fs.mkdirSync(SAVES, { recursive: true });
      const save = await page.evaluate(() => localStorage.getItem('zh.cozy.v1'));
      fs.writeFileSync(path.join(SAVES, `${name}.json`), save ?? 'null');
      say(`checkpoint: ${name}`);
    };
    const resume = async (phase) => {
      const prev = PHASES[PHASES.indexOf(phase) - 1];
      const save = fs.readFileSync(path.join(SAVES, `${prev}.json`), 'utf8');
      await page.addInitScript((s) => { if (!sessionStorage.getItem('zerar.loaded')) { localStorage.setItem('zh.cozy.v1', s); sessionStorage.setItem('zerar.loaded', '1'); } }, save);
      await driver.open('/');
      await sleep(2600);
      await P.press('Enter', 80, 600);
      await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
      await sleep(1500);
      await P.drain('retomar');
      await P.loadRelief();
    };

    const phases = {
      async abertura() {
        await page.evaluate(() => localStorage.removeItem('zh.cozy.v1'));
        // Em localhost a abertura é pulada (RunBoot.SKIP_INTRO_LOCALLY); `?intro` a toca como no site, e o tempo dela conta.
        await driver.open(process.env.ZERAR_SEM_ABERTURA ? '/' : '/?intro');
        await sleep(2600);
        await shot('00-titulo', { note: 'O título' });
        await P.press('Enter', 80, 600);
        await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
        await P.waitFor((s) => s.dialogOpen || (s.introDone && !s.cutsceneActive), 'a abertura', 120000);
        await shot('01-abertura', { note: 'A abertura' });
        await P.drain('abertura');
        const st = await P.free();
        assert('A abertura terminou e o herói está livre', st.introDone, JSON.stringify({ introDone: st.introDone, at: st.player }));
        await P.loadRelief();
      },
      async recon() {
        const info = await page.evaluate(() => {
          const g = window.gameDebug;
          g.world.stream();
          return {
            npcs: g.npcs.list().map((n) => [n.kind, n.worldX, n.worldY]),
            quests: window.gameDebug.quests().map((q) => [q.dialog, q.done, q.speaks, q.tasks]),
            st: window.gameDebug.getState(),
          };
        });
        say(JSON.stringify(info.npcs));
        say(JSON.stringify(info.quests));
        say(JSON.stringify({ at: info.st.player, held: info.st.heldItem, items: info.st.groundItems, clock: info.st.timeOfDay }));
        const homes = {};
        for (const k of ['radiationSuit', 'painter', 'businessMan', 'astronaut', 'wizard']) homes[k] = await P.homeOf(k);
        say(`casas: ${JSON.stringify(homes)}`);
      },

      // ── A SISI: a pá, quatro buracos, as sementes, o balde, a espera, as flores, a mesa e o quadro ──
      async sisi() {
        const stage = () => page.evaluate(() => window.gameDebug.quest.painter().stage);
        const held = async () => (await P.state()).heldItem;
        const home = await P.homeOf('painter');
        const near = { near: home, radius: 7 };
        await P.talk('painter', 'a Sisi');
        assert('A Sisi dá a pá', (await held()) === 'shovel' && (await stage()) === 'dig', `${await held()} / ${await stage()}`);
        for (let i = 0; i < 4; i += 1) {
          await P.doVerb('x', 'dig', `cavar ${i + 1}`, near);
          await sleep(500);
          await P.drain('cavar');
        }
        await shot('10-sisi-buracos', { note: 'Os quatro buracos' });
        await P.talk('painter', 'a Sisi (buracos prontos)');
        assert('Com os buracos, ela dá as sementes', (await held()) === 'dyeSeeds' && (await stage()) === 'sow', `${await held()} / ${await stage()}`);
        for (let i = 0; i < 4; i += 1) {
          await P.doVerb('x', 'sow', `semear ${i + 1}`, near);
          await sleep(450);
        }
        await P.talk('painter', 'a Sisi (semeado)');
        assert('Semeado, ela dá o balde', ['bucket', 'bucketFull'].includes(await held()) && (await stage()) === 'water', `${await held()} / ${await stage()}`);
        for (let i = 0; i < 12 && (await stage()) === 'water'; i += 1) {
          if ((await held()) === 'bucket') await P.doVerb('x', 'fill', 'encher o balde');
          else await P.doVerb('x', 'water', 'regar', near);
          await sleep(700);
          await P.drain('balde');
        }
        assert('Os quatro canteiros regados: as tintas crescem', (await stage()) === 'grow', await stage());
        await shot('11-sisi-regado', { note: 'Os canteiros regados' });
        say('esperando as flores crescerem (tempo de jogo)');
        await P.pageWait(() => window.gameDebug.quest.painter().stage === 'harvest', null, 'as flores crescerem', 240000);
        for (let i = 0; i < 4; i += 1) {
          await P.doVerb('z', 'pick', `colher flor ${i + 1}`, near);
          await sleep(500);
          await P.drain('flor');
        }
        assert('As quatro flores na mão', (await held()) === 'dyeBundle', await held());
        await P.doVerb('z', 'mix', 'a mesa de tintas', near);
        await P.drain('a mesa de tintas');
        await sleep(900);
        await P.drain('o pincel');
        assert('As tintas prontas: o quadro armado e o pincel na mão', (await stage()) === 'paint' && (await held()) === 'brush', `${await held()} / ${await stage()}`);
        await P.doVerb('z', 'paint', 'o quadro', near);
        await page.waitForSelector('#zh-paint-root canvas', { timeout: 8000 });
        await sleep(500);
        await shot('12-sisi-quadro', { note: 'O quadro aberto' });
        const box = await page.locator('#zh-paint-root canvas').boundingBox();
        const pots = page.locator('#zh-paint-root .zh-paint-pot');
        for (let k = 0; k < 4; k += 1) {
          await pots.nth(k).click();
          const y0 = box.y + box.height * (0.2 + k * 0.18);
          await page.mouse.move(box.x + box.width * 0.15, y0);
          await page.mouse.down();
          for (let s = 1; s <= 12; s += 1) await page.mouse.move(box.x + box.width * (0.15 + s * 0.06), y0 + Math.sin(s) * 12, { steps: 2 });
          await page.mouse.up();
        }
        await shot('13-sisi-pintado', { note: 'O quadro pintado' });
        await page.keyboard.press('Enter');
        await P.pageWait(() => !document.getElementById('zh-paint-root'), null, 'o quadro fechar', 8000);
        assert('Pintado, a Sisi vai olhar', (await stage()) === 'review', await stage());
        await P.talk('painter', 'a Sisi (o quadro)');
        const q = await P.quest('painter');
        assert('A quest da Sisi fechou', q?.done === true && (await stage()) === 'done', JSON.stringify(q));
        await shot('14-sisi-fim', { note: 'A Sisi viu o quadro' });
      },

      // ── O MARCO: o machado, os galhos de árvore seca rachados no cepo (quantos a quest pedir), a tenda, e acender ──
      async marco() {
        const L = () => page.evaluate(() => { const q = window.gameDebug.quest.lumber(); return { stage: q.stage, laid: q.laid, standing: q.standing, ui: q.overlayOpen }; });
        const held = async () => (await P.state()).heldItem;
        const home = await P.homeOf('businessMan');
        const near = { near: home, radius: 8 };
        await P.talk('businessMan', 'o Marco');
        assert('O Marco dá o machado', (await held()) === 'axe' && (await L()).stage === 'gather', `${await held()} / ${JSON.stringify(await L())}`);
        /** Pega o item do chão: de mão vazia, pisa nele; de mão cheia, encara e troca (Z). */
        const pickUp = async (kind) => {
          const st = await P.state();
          const it = st.groundItems.filter((g) => g.kind === kind)
            .sort((a, b) => Math.abs(a.worldX - st.player.worldX) + Math.abs(a.worldY - st.player.worldY) - Math.abs(b.worldX - st.player.worldX) - Math.abs(b.worldY - st.player.worldY))[0];
          if (!it) throw new Error(`nenhum ${kind} no chão`);
          await P.approachFree({ x: it.worldX, y: it.worldY }, `pegar ${kind}`);
          await P.press('z', 60, 400);
          await P.drain(`pegar ${kind}`);
          return P.free();
        };
        const split = async () => {
          await P.pageWait(() => window.gameDebug.quest.lumber().overlayOpen, null, 'o cepo abrir', 8000);
          await shot(`20-marco-cepo-${(await L()).laid}`, { note: 'Rachar no cepo' });
          await page.evaluate(() => new Promise((resolve) => {
            const q = window.gameDebug.quest;
            const fire = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'z', bubbles: true })); };
            let cool = 0;
            const t0 = performance.now();
            const tick = () => {
              const o = q.lumberOverlay();
              if (o?.kind !== 'split' || performance.now() - t0 > 60000) { resolve(); return; }
              cool -= 1;
              if (cool <= 0) {
                if (o.phase === 'aim' && Math.abs(o.aim - o.grainX) < 2.5 && Math.abs(o.aim - o.knotX) >= 8) { fire(); cool = 4; }
                else if (o.phase === 'force' && o.force >= 0.7 && o.force <= 0.8) { fire(); cool = 4; }
              }
              requestAnimationFrame(tick);
            };
            tick();
          }));
          await P.drain('as metades');
          return P.free();
        };
        for (let n = 0; n < 8 && (await L()).stage === 'gather'; n += 1) {
          // Depois do primeiro galho o machado fica com ele, entre as ferramentas guardadas, e vem sozinho diante da
          // árvore seca (ActionVerbs.toolFor). Só se pega do chão o que não é dele.
          if ((await held()) !== 'axe' && !(await page.evaluate(() => window.gameDebug.items.owns('axe')))) await pickUp('axe');
          const trees = await page.evaluate(() => window.gameDebug.props.dryTrees().filter((t) => t.blocking).map((t) => ({ x: t.x, y: t.y })));
          await P.doVerb('x', 'chop', `cortar árvore seca ${n + 1}`, { radius: 60, only: trees, repeat: true });
          await sleep(900);
          await P.drain('o galho');
          let st = await P.free();
          if (st.heldItem !== 'wood') st = await pickUp('wood');
          assert(`Galho ${n + 1} no colo`, st.heldItem === 'wood', st.heldItem);
          await P.doVerb('z', 'stand', 'o cepo', near);
          st = await split();
          assert(`Galho ${n + 1} rachado: as metades nas costas`, st.heldItem === 'splitWood', st.heldItem);
          await P.doVerb('z', 'stack', 'a tenda', near);
          await sleep(1200);
          await P.free();
        }
        assert('Os galhos na tenda', (await L()).stage === 'ready', JSON.stringify(await L()));
        await shot('21-marco-tenda', { note: 'A tenda pronta' });
        await P.talk('businessMan', 'o Marco (pronta)');
        assert('Ele manda acender', (await L()).stage === 'light', JSON.stringify(await L()));
        await P.doVerb('z', 'light', 'acender', near);
        await P.pageWait(() => window.gameDebug.quest.lumber().overlayOpen, null, 'o fogo abrir', 8000);
        await shot('22-marco-acender', { note: 'Acender' });
        for (let i = 0; i < 80 && (await L()).ui; i += 1) {
          const phase = await page.evaluate(() => window.gameDebug.quest.lumberOverlay()?.phase);
          if (phase === 'strike') await P.press('z', 50, 250);
          else if (phase === 'blow') await P.press('z', 50, 450);
          else await sleep(300);
        }
        await P.drain('a noite do Marco', 200);
        await P.free();
        const q = await P.quest('businessMan');
        assert('A quest do Marco fechou', q?.done === true && (await L()).stage === 'done', JSON.stringify(q));
        await shot('23-marco-fim', { note: 'Depois da noite' });
      },

      // ── A THEA: a picareta, carvão e minério no lago de lava, a bigorna, areia e vidro, a lente, o planalto e a noite ──
      async thea() {
        await playThea({ driver, shot, assert, skipOpening: true });
        await P.free();
      },

      // ── AS TRÊS NOITES: o colchão do acampamento e a Morte; ela avisa na primeira e deixa a foice no fim da terceira ──
      async noite() {
        const keys = ['death/visit', 'death/visit2', 'death/visit3'];
        for (let n = 1; n <= 3; n += 1) {
          await P.doVerb('z', 'sleep', 'o colchão do acampamento', { near: { x: 53, y: 48 }, radius: 3 });
          await P.waitFor((s) => s.resting, 'deitar', 8000);
          const lying = await page.evaluate(() => ({ sleeping: window.gameDebug.camp.rest().sleeping, camp: window.gameDebug.camp.rest().atCamp }));
          assert(`Noite ${n}: o herói dorme no colchão do acampamento`, lying.sleeping && lying.camp, JSON.stringify(lying));
          if (n === 1) await shot('30-noite-colchao', { note: 'Dormindo no acampamento' });
          say(`esperando a noite ${n} passar`);
          await P.waitFor((s) => s.dialogOpen, 'a Morte aparecer', 300000);
          if (n === 1) await shot('31-noite-morte', { note: 'A primeira visita da Morte' });
          await P.drain('a Morte', 200);
          const visited = await page.evaluate((k) => window.gameDebug.dialog.heard(k), keys[n - 1]);
          assert(`A Morte veio na noite ${n} no acampamento`, visited, '');
          for (let i = 0; i < 40 && (await P.state()).resting; i += 1) { await P.press('ArrowDown', 60, 400); await P.drain('levantar'); }
          await sleep(1500);
          const st = await P.free();
          const scythe = st.groundItems.find((g) => g.kind === 'scythe');
          if (n < 3) assert(`Noite ${n}: ainda sem foice (a Morte só avisa e volta)`, !scythe, JSON.stringify(scythe));
          else assert('No fim da terceira noite, a foice ficou no acampamento', !!scythe && Math.abs(scythe.worldX - 53) <= 4 && Math.abs(scythe.worldY - 48) <= 4, JSON.stringify(scythe));
        }
        assert('O mago deixa de lembrar do acampamento', (await page.evaluate(() => window.gameDebug.dialog.wizardLine())) !== 'tent', '');
      },

      // ── A SHUI: a faca e os seis cogumelos, cada um atrás de uma coisa que só uma ferramenta tira ──
      async shui() {
        const held = async () => (await P.state()).heldItem;
        const DIRS4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        /** A coisa vai para a mão: a mais perto no chão; com a mão cheia, o Z troca (a de antes fica no lugar). */
        const hold = async (kind) => {
          if ((await held()) === kind) return;
          const st = await P.state();
          const it = st.groundItems.filter((g) => g.kind === kind)
            .sort((a2, b2) => Math.abs(a2.worldX - st.player.worldX) + Math.abs(a2.worldY - st.player.worldY) - Math.abs(b2.worldX - st.player.worldX) - Math.abs(b2.worldY - st.player.worldY))[0];
          // A ferramenta que já é dele fica guardada e vem sozinha diante do que ela faz (ActionVerbs.toolFor).
          if (!it && (await page.evaluate((k) => window.gameDebug.items.owns(k), kind))) return;
          if (!it) throw new Error(`nenhum ${kind} no chão (na mão: ${st.heldItem})`);
          if (st.heldItem === 'none') { await P.walkTo([{ x: it.worldX, y: it.worldY }], `pegar ${kind}`); await P.press('z', 60, 350); }
          else { await P.approachFree({ x: it.worldX, y: it.worldY }, `pegar ${kind}`); await P.press('z', 60, 350); }
          await P.drain(`pegar ${kind}`);
          const now = await P.free();
          assert(`Na mão: ${kind}`, now.heldItem === kind, now.heldItem);
        };

        /** Um graveto novo: o machado numa árvore seca, e o galho no colo. */
        const freshStick = async () => {
          await hold('axe');
          const trees = await page.evaluate(() => window.gameDebug.props.dryTrees().filter((t) => t.blocking).map((t) => ({ x: t.x, y: t.y })));
          await P.doVerb('x', 'chop', 'árvore seca', { radius: 60, only: trees, repeat: true });
          await sleep(900);
          await P.drain('o galho');
          await hold('wood');
        };

        /**
         * ABRE O CAMINHO até `target` com o gesto `verb` do X: o BFS passa pelos tiles que aceitariam o gesto, e o herói
         * vai tirando o primeiro deles do caminho. `ensure` põe na mão o que o gesto pede antes de cada golpe.
         */
        const clearTo = async (target, verb, ensure, label) => {
          for (let round = 0; round < 20; round += 1) {
            await ensure();
            const grid = await P.solidGrid();
            const open = await page.evaluate(([v, cx, cy]) => {
              const g = window.gameDebug;
              const out = [];
              for (let y = Math.max(0, cy - 14); y <= Math.min(59, cy + 14); y += 1) for (let x = Math.max(0, cx - 14); x <= Math.min(59, cx + 14); x += 1) if (g.verbs.at('x', x, y) === v) out.push(`${x},${y}`);
              return out;
            }, [verb, target.x, target.y]);
            const openSet = new Set(open);
            const g2 = grid.map((row, y) => [...row].map((c, x) => (openSet.has(`${x},${y}`) ? '.' : c)).join(''));
            const st = await P.state();
            const from = { x: st.player.worldX, y: st.player.worldY };
            const goals = DIRS4.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy })).filter((q) => grid[q.y]?.[q.x] === '.' || openSet.has(`${q.x},${q.y}`));
            const way = P.bfs(g2, from, goals);
            if (!way) {
              // o fogo ainda está andando: o arbusto que arde não aceita mais o gesto, e ainda não abriu
              if (verb === 'burn' && round < 19) { await sleep(3000); continue; }
              throw new Error(`${label}: nem com ${verb} há caminho`);
            }
            const i = way.findIndex((q) => grid[q.y][q.x] === '#');
            if (i < 0) { say(`  ${label}: caminho aberto`); return; }
            const block = way[i];
            await P.walkTo([way[i - 1]], `${label}: diante de ${block.x},${block.y}`);
            await ensure();
            if ((await P.state()).player.worldX !== way[i - 1].x || (await P.state()).player.worldY !== way[i - 1].y) await P.walkTo([way[i - 1]], `${label}: de volta`);
            if (!(await page.evaluate(([x, y]) => window.gameDebug.world.solid(x, y), [block.x, block.y]))) continue; // abriu sozinho (o fogo anda)
            try { await P.face(block); } catch (e) { say(`  ${label}: ${e.message}`); continue; }
            const v = await page.evaluate(([x, y]) => window.gameDebug.verbs.at('x', x, y), [block.x, block.y]);
            if (v !== verb) { say(`  ${label}: ${block.x},${block.y} diz ${v}`); await sleep(500); continue; }
            await P.press('x', 60, 450);
            for (let k = 0; k < 10 && (await page.evaluate(([x, y]) => window.gameDebug.verbs.at('x', x, y), [block.x, block.y])) === verb; k += 1) await P.press('x', 60, 450);
            await P.drain(label);
            // o que cai (o fogo, a pedra afundando, a ponte) leva um tempo
            try { await P.pageWait(([x, y]) => !window.gameDebug.world.solid(x, y), [block.x, block.y], `${label}: ${block.x},${block.y} abrir`, verb === 'burn' ? 40000 : 6000); } catch (e) { say(`  ${e.message}`); }
          }
          throw new Error(`${label}: não abriu`);
        };

        /** O mini-game da colheita, jogado: a faca na faixa, a bucha na terra com o mouse, a ficha. */
        const forage = async (kind) => {
          await P.pageWait(() => window.gameDebug.forage.overlay()?.stage === 'aim', null, 'faca em posicao', 8000);
          await page.evaluate(() => new Promise((resolve) => {
            const fire = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyZ', key: 'z', bubbles: true }));
            const tick = () => {
              const o = window.gameDebug.forage.overlay();
              if (o?.stage !== 'aim') { resolve(); return; }
              const mid = (o.zoneTop + o.zoneBottom) / 2;
              if (Math.abs(o.knifeY - mid) < (o.zoneBottom - o.zoneTop) * 0.3) { fire('keydown'); fire('keyup'); }
              requestAnimationFrame(tick);
            };
            tick();
          }));
          await P.pageWait(() => window.gameDebug.forage.overlay()?.stage === 'clean', null, 'a bucha', 6000);
          await sleep(300);
          const toScreen = (x, y) => page.evaluate(([ax, ay]) => {
            const p = window.gameDebug.forage.overlay().page;
            return { x: p.originX + ax * p.unit, y: p.originY + ay * p.unit };
          }, [x, y]);
          const nextDirt = () => page.evaluate(() => {
            const o = window.gameDebug.forage.overlay();
            return o?.stage === 'clean' ? o.nextDirt : null;
          });
          let d = await nextDirt();
          if (d) {
            const start = await toScreen(d.x, d.y);
            await page.mouse.move(start.x, start.y);
            await page.mouse.down();
            for (let i = 0; i < 400 && d; i += 1) {
              const at = await toScreen(d.x + 0.5, d.y + 0.5);
              await page.mouse.move(at.x, at.y, { steps: 2 });
              d = await nextDirt();
            }
            await page.mouse.up();
          }
          await P.pageWait(() => window.gameDebug.forage.overlay()?.stage === 'note', null, 'a ficha', 10000);
          await shot(`40-ficha-${kind}`, { note: `A ficha do ${kind}` });
          for (let i = 0; i < 30 && !(await page.evaluate(() => window.gameDebug.forage.overlay() === null)); i += 1) await P.press('z', 50, 500);
          await P.pageWait(() => window.gameDebug.forage.overlay() === null, null, 'a colheita fechar', 8000);
          await P.drain('depois da ficha');
        };

        const spot = async (kind) => {
          const it = (await P.state()).groundItems.find((g) => g.kind === kind);
          if (!it) throw new Error(`o ${kind} não está no mapa`);
          return { x: it.worldX, y: it.worldY };
        };
        const harvest = async (kind) => {
          const at = await spot(kind);
          // Com o graveto ainda aceso nas costas a faca não vem (trocar apagaria o fogo): espera ele apagar.
          if ((await P.state()).heldOnFire) await P.waitFor((s2) => !s2.heldOnFire, 'o graveto apagar', 90000);
          await hold('knife');
          await P.approachSolid(at, `o ${kind}`);
          // O botão que o balão oferece: colher é da mão (Z), com a faca nas costas ou guardada.
          const zHarvests = (await page.evaluate(([x, y]) => window.gameDebug.verbs.at('z', x, y), [at.x, at.y])) === 'harvest';
          await P.press(zHarvests ? 'z' : 'x', 60, 300);
          await forage(kind);
          await P.free();
          const gone = !(await P.state()).groundItems.some((g) => g.kind === kind);
          assert(`O ${kind} foi colhido`, gone, '');
        };

        await P.talk('radiationSuit', 'a Shui');
        assert('A Shui dá a faca', (await held()) === 'knife', await held());

        // PORCINI: só chegar.
        await harvest('porcini');
        // MOREL: dois gravetos fazem a ponte até a ilha.
        await clearTo(await spot('morel'), 'bridge', async () => { if ((await held()) !== 'wood') await freshStick(); }, 'a ponte do morel');
        await shot('41-morel-ponte', { note: 'A ponte do morel' });
        await harvest('morel');
        // PUFFBALL: a foice abre o mato alto.
        await clearTo(await spot('puffball'), 'mow', () => hold('scythe'), 'o mato do puffball');
        await harvest('puffball');
        // INKCAP: um graveto aceso na lava põe fogo nos arbustos secos.
        await clearTo(await spot('inkCap'), 'burn', async () => {
          const st = await P.state();
          if (st.heldItem === 'wood' && st.heldOnFire) return;
          if (st.heldItem !== 'wood') await freshStick();
          await P.doVerb('x', 'light', 'acender o graveto na lava', { radius: 60 });
          await P.waitFor((s2) => s2.heldOnFire, 'o graveto pegar fogo', 4000);
        }, 'os arbustos do inkCap');
        await shot('42-inkcap-fogo', { note: 'O fogo abriu o caminho' });
        await harvest('inkCap');
        // CHANTERELLE: a pedra da picareta afunda na lava e vira passagem.
        const stoneInHand = async () => {
          if ((await held()) === 'stone') return;
          await hold('pickaxe');
          const plain = await page.evaluate(() => window.gameDebug.props.rocks().filter((r) => r.blocking && !r.ore).map((r) => ({ x: r.x, y: r.y })));
          const t = await P.doVerb('x', 'break', 'a rocha', { radius: 60, repeat: true, only: plain });
          await sleep(700);
          await P.drain('a pedra');
          await P.pageWait(([x, y]) => !window.gameDebug.world.solid(x, y), [t.x, t.y], 'a rocha abrir', 6000).catch(() => {});
          await hold('stone');
        };
        await clearTo(await spot('chanterelle'), 'cover', stoneInHand, 'a lava do chanterelle');
        await harvest('chanterelle');
        // FLY AGARIC: no corredor do norte, atrás da lava (scripts/minas-alem-da-lava.mjs): a pedra afunda até o arbusto
        // da frente dele (2,1), e o machado abre o mato morto.
        await clearTo({ x: 2, y: 1 }, 'cover', stoneInHand, 'a lava do corredor do norte');
        await clearTo(await spot('flyAgaric'), 'chop', () => hold('axe'), 'o mato morto do flyAgaric');
        await harvest('flyAgaric');

        await shot('43-cesta', { note: 'Os seis na cesta' });
        await hold('knife').catch(() => {});
        await P.talk('radiationSuit', 'a Shui (a cesta)');
        const q = await P.quest('radiationSuit');
        assert('A quest da Shui fechou', q?.done === true, JSON.stringify(q));
        const st = await P.waitFor((s2) => s2.heldItem === 'key' && !s2.itemGetOpen && !s2.dialogOpen && !s2.cutsceneActive, 'a chave do jardim', 15000).catch(async () => P.state());
        assert('A última quest dá a chave do jardim', st.heldItem === 'key', st.heldItem);
        await shot('44-shui-fim', { note: 'A Shui fechou: a chave' });
      },

      // ── O FIM: a chave no portão, o jardim alto, a névoa, a fogueira, o marshmallow, os créditos e o título ──
      async fim() {
        let st = await P.free();
        assert('A chave do jardim na mão', st.heldItem === 'key', st.heldItem);
        await P.doVerb('x', 'unlock', 'o portão do jardim', { radius: 60 });
        await P.waitFor((s2) => s2.cutsceneActive, 'a cena da chave', 6000).catch(() => {});
        await shot('50-portao-chave', { note: 'A chave no portão' });
        await P.drain('o portão abrir', 200);
        st = await P.free();
        assert('O portão abriu e a chave foi gasta', st.ending.gateOpen && st.heldItem !== 'key' && !st.groundItems.some((g) => g.kind === 'key'), JSON.stringify({ ending: st.ending, held: st.heldItem }));
        // Um graveto para o marshmallow: o que estiver no chão, senão o machado numa árvore seca.
        const hold = async (kind) => {
          if ((await P.state()).heldItem === kind) return;
          const s3 = await P.state();
          const it = s3.groundItems.filter((g) => g.kind === kind)
            .sort((a2, b2) => Math.abs(a2.worldX - s3.player.worldX) + Math.abs(a2.worldY - s3.player.worldY) - Math.abs(b2.worldX - s3.player.worldX) - Math.abs(b2.worldY - s3.player.worldY))[0];
          if (!it) throw new Error(`nenhum ${kind} no chão`);
          const all = s3.groundItems.filter((g) => g.kind === kind);
          let got = false;
          for (const g of [it, ...all.filter((x) => x !== it)]) {
            try {
              if (s3.heldItem === 'none') await P.walkTo([{ x: g.worldX, y: g.worldY }], `pegar ${kind}`);
              else await P.approachFree({ x: g.worldX, y: g.worldY }, `pegar ${kind}`);
              got = true;
              break;
            } catch (e) { say(`  ${kind} em ${g.worldX},${g.worldY}: ${e.message}`); }
          }
          if (!got) throw new Error(`nenhum ${kind} alcançável`);
          await P.press('z', 60, 350);
          await P.drain(`pegar ${kind}`);
          await P.free();
        };
        /** O graveto do fim: o que estiver no chão ao alcance; senão o machado (guardado) numa árvore seca. */
        const stick = async () => {
          try { await hold('wood'); return; } catch (e) { say(`  graveto do chão: ${e.message}; corto um`); }
          const trees = await page.evaluate(() => window.gameDebug.props.dryTrees().filter((t) => t.blocking).map((t) => ({ x: t.x, y: t.y })));
          await P.doVerb('x', 'chop', 'árvore seca (graveto do fim)', { radius: 60, only: trees, repeat: true });
          await sleep(900);
          await P.drain('o galho');
          if ((await P.free()).heldItem !== 'wood') await hold('wood');
        };
        await stick();
        assert('Um graveto na mão para o fim', (await P.state()).heldItem === 'wood', (await P.state()).heldItem);
        // Subir o jardim: a primeira pisada no cume é o vento levando a névoa (cena).
        const hearth = await page.evaluate(() => { const h = window.gameDebug.props.hearths()[0]; return h ? { x: h.x, y: h.y } : null; });
        assert('A fogueira do fim existe', !!hearth, '');
        try { await P.approachSolid(hearth, 'a fogueira do fim'); } catch (e) { say(`  1a tentativa: ${e.message}`); await P.drain('a névoa', 200); await P.approachSolid(hearth, 'a fogueira do fim'); }
        await P.drain('a névoa', 200);
        st = await P.free();
        const mist = await page.evaluate(() => window.gameDebug.valley.gardenMist() === null);
        assert('O vento levou a névoa', mist, '');
        await shot('51-jardim', { note: 'O jardim alto, diante da fogueira' });
        await P.approachSolid(hearth, 'a fogueira do fim');
        assert('Diante da fogueira, o Z acende', (await page.evaluate(([x, y]) => window.gameDebug.verbs.hand(x, y), [hearth.x, hearth.y])) === 'light', '');
        await P.press('z', 60, 600);
        await P.drain('acender', 200);
        st = await P.free();
        assert('A fogueira do fim acesa', st.ending.hearthLit, JSON.stringify(st.ending));
        await shot('52-fogueira', { note: 'A fogueira acesa' });
        if (st.heldItem !== 'wood') await stick();
        await P.approachSolid(hearth, 'a fogueira (assar)');
        const verb = await page.evaluate(([x, y]) => window.gameDebug.verbs.hand(x, y), [hearth.x, hearth.y]);
        assert('Com o graveto, o Z assa', verb === 'roast', String(verb));
        await P.press('z', 60, 600);
        say('o fim: assando, os amigos, a nave, a frase, os créditos e a manhã');
        // A cena do fogo: as falas passam no Z, até a tela do fim aparecer.
        const creditsUp = () => page.evaluate(() => !!document.querySelector('.zh-credits'));
        for (let i = 0; i < 600 && !(await creditsUp()); i += 1) {
          if (i === 30) await shot('53-reencontro', { note: 'O reencontro na fogueira' });
          if ((await P.state()).dialogOpen) await P.press('z', 60, 400);
          await sleep(500);
        }
        assert('A tela do fim apareceu', await creditsUp(), '');
        /** Espera `test` (async) virar verdade, com prazo; devolve se virou. */
        const until = async (what, test, ms) => {
          const t0 = Date.now();
          while (Date.now() - t0 < ms) { if (await test()) return true; await sleep(200); }
          say(`  prazo esgotado: ${what}`);
          return false;
        };
        // A tela do fim lida no DOM: a opacidade da frase, a maior do resto dela, as pequenas coisas e o "Fim".
        const ending = () => page.evaluate(() => {
          const op = (el) => (el ? Number(getComputedStyle(el).opacity) : null);
          const ep = document.querySelector('.zh-credits-epigraph');
          const plain = ep ? [...ep.querySelectorAll('span:not([data-strong])')] : [];
          const strong = ep?.querySelector('span[data-strong]') ?? null;
          return {
            phrase: op(ep),
            rest: plain.length ? Math.max(...plain.map(op)) : null,
            small: strong?.textContent ?? null,
            smallWeight: strong ? Number(getComputedStyle(strong).fontWeight) : null,
            end: op(document.querySelector('.zh-credits-end')),
            roll: document.querySelector('.zh-credits-roll')?.textContent ?? '',
          };
        });
        await until('a frase inteira', async () => (await ending()).phrase >= 0.99, 15000);
        let e = await ending();
        assert('A frase, com as pequenas coisas em negrito', e.small === 'pequenas coisas' && e.smallWeight >= 700 && e.rest >= 0.99, JSON.stringify(e));
        await shot('54-frase', { note: 'A frase das pequenas coisas' });
        await until('só as pequenas coisas', async () => { const s = await ending(); return s.rest !== null && s.rest < 0.01; }, 20000);
        await sleep(600);
        e = await ending();
        assert('O resto da frase apagou e só as pequenas coisas ficaram', e.rest < 0.01 && e.phrase >= 0.99, JSON.stringify(e));
        await shot('55-pequenas-coisas', { note: 'Só as pequenas coisas na tela' });
        await until('o Fim', async () => (await ending()).end >= 0.99, 20000);
        e = await ending();
        assert('O Fim, com as pequenas coisas já apagadas', e.end >= 0.99 && e.phrase < 0.01, JSON.stringify(e));
        await shot('56-fim', { note: 'Fim' });
        const testers = ['Adriel Carvalho', 'Eric Góes', 'Geovani Darcie', 'Diego Penha', 'Rodrigo Alister'];
        assert('Os créditos têm quem testou e validou o jogo', testers.every((n) => e.roll.includes(n)), e.roll);
        const crew = ['Shui, a micóloga', 'Sisi, a pintora', 'Marco, o lenhador', 'Thea, a astronauta', 'Sati, o mago'];
        assert('Cada vizinho nos créditos com o que faz', crew.every((n) => e.roll.includes(n)), e.roll);
        await until('os testadores na tela', () => page.evaluate(() => {
          const el = [...document.querySelectorAll('.zh-credits-roll div')].find((d) => d.textContent === 'Adriel Carvalho');
          return !!el && el.getBoundingClientRect().top < window.innerHeight * 0.55;
        }), 40000);
        await shot('57-creditos-testadores', { note: 'Quem testou e validou o jogo' });
        // Os créditos acabam e o jogo NÃO volta ao título: o Zero acorda no acampamento, e o bilhete avisa.
        const morning = () => page.evaluate(() => (window.gameDebug?.getState()?.scene === 'game' ? window.gameDebug.camp.morning() : null));
        const asleep = async () => !!(await page.evaluate(() => (window.gameDebug?.getState()?.scene === 'game' ? window.gameDebug.camp.rest() : null)))?.sleeping;
        assert('Os créditos levam ao Zero dormindo no colchão', await until('dormindo no acampamento', asleep, 90000), '');
        // O acampamento clareia (2,6 s) e a noite espera um instante antes de passar (MorningAfter).
        await sleep(3200);
        assert('Ainda dormindo quando o acampamento aparece', await asleep(), '');
        await shot('58-dormindo', { note: 'A noite passa: ele dorme no colchão do acampamento' });
        await until('a manhã no acampamento', async () => (await morning())?.note === true, 30000);
        await sleep(900);
        await shot('59-manha-bilhete', { note: 'Acordou no acampamento, e o bilhete' });
        st = await P.state();
        assert('Depois dos créditos, o acampamento e o bilhete (e não o título)', (await morning())?.note === true && st.player.worldX === 53 && st.player.worldY === 48, JSON.stringify({ at: st.player }));
        const clock = await page.evaluate(() => window.gameTime?.get());
        assert('Acordou de manhã, no dia seguinte', !!clock && clock.phase >= 0.25 && clock.phase < 0.4, JSON.stringify(clock));
        const rest = await page.evaluate(() => window.gameDebug.camp.rest());
        assert('Já de pé, e a Morte não veio', !rest.resting && rest.deathTile === null, JSON.stringify(rest));
        await P.press('z', 60, 600);
        assert('O bilhete fecha', (await morning())?.note === false, '');
        await P.free();
        await shot('60-manha-livre', { note: 'O vale continua aberto' });
        const save = await page.evaluate(() => JSON.parse(localStorage.getItem('zh.cozy.v1') ?? 'null'));
        assert('O save marca o fim visto', save?.endingSeen === true, JSON.stringify({ endingSeen: save?.endingSeen }));
      },
    };

    const to = process.env.ZERAR_TO ?? PHASES[PHASES.length - 1];
    const toIndex = PHASES.indexOf(to);
    if (toIndex < fromIndex) throw new Error(`ZERAR_TO desconhecida ou antes de ZERAR_FROM: ${to}`);
    /** Minutos de jogo desde o começo da partida (o relógio do jogo: dia e hora). */
    const gameMinutes = () => page.evaluate(() => { const g = window.gameTime?.get(); return g ? Math.round((g.day + g.phase) * 24 * 60) : null; });
    const times = fs.existsSync(TIMES) ? JSON.parse(fs.readFileSync(TIMES, 'utf8')) : {};
    if (fromIndex === 0) for (const k of Object.keys(times)) delete times[k];

    if (fromIndex > 0) await resume(from);
    for (const name of PHASES.slice(fromIndex, toIndex + 1)) {
      say(`── fase: ${name}`);
      const t0 = Date.now();
      const g0 = await gameMinutes().catch(() => null);
      await phases[name]();
      const g1 = await gameMinutes().catch(() => null);
      times[name] = { realS: Math.round((Date.now() - t0) / 1000), gameMin: g0 !== null && g1 !== null ? g1 - g0 : null, at: new Date().toISOString() };
      fs.mkdirSync(path.dirname(TIMES), { recursive: true });
      fs.writeFileSync(TIMES, JSON.stringify(times, null, 2));
      say(`⏱ ${name}: ${times[name].realS} s reais, ${times[name].gameMin ?? '?'} min de jogo`);
      await checkpoint(name);
    }
    assert('Sem erro no console', driver.consoleErrors.length === 0, driver.consoleErrors.slice(0, 3).join(' | '));
  },
};
