// AS FALAS DE MISSÃO CUMPRIDA — um roteiro alternativo por NPC que pede alguma coisa.
//
// Modelo enrich-*: este script LÊ public/world.json e ACRESCENTA — nunca refaz. Idempotente (o
// resultado é função só do disco de entrada, então rodar duas vezes é rodar uma), determinístico
// (zero Math.random, zero timestamp) e proibido de tocar em chunks, terreno, props ou nos
// roteiros-base. Ele só escreve as chaves `<id>Done` de `world.dialogs`.
//
// COMO O PAR SE MANTÉM DE PÉ. As TAREFAS moram no código (src/game/dialogs/NpcQuests.ts) e as
// FALAS moram aqui, porque fala de NPC mora no world.json — as duas metades se encontram no nome
// do roteiro alternativo (`doneDialog: 'astronautDone'`). Para os dois lados não se separarem em
// silêncio, o script CONFERE o arquivo TS: toda fala daqui tem de ser citada lá, e todo
// `doneDialog` de lá tem de ter fala aqui. Faltando qualquer um dos dois, ele falha com exit 1.
//
// `node scripts/add-npc-quests.mjs --check` não escreve: falha se o disco ainda não for o ponto
// fixo. É o que se roda no dia da dúvida.
//
// Cada roteiro alternativo NASCE DO ROTEIRO-BASE (nome, cor, sprite, frame, voz e o BALCÃO, se
// houver): a única coisa que muda são as falas. Um NPC que trocasse de rosto ao cumprir a missão
// pareceria outro NPC — e o balcão do astronauta não pode sumir porque a nave dele foi consertada.

import fs from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const line = (text) => ({ speaker: 'npc', text });
const narr = (text) => ({ speaker: 'narrator', text });

/**
 * As falas de DEPOIS, por roteiro alternativo. A chave é `<base>Done`.
 *
 * A REGRA DE ESCRITA, e ela é mais dura que a das falas de antes: o NPC (1) reconhece o que
 * recebeu — senão a missão não teve resposta —, (2) **empurra a lore um passo**, em vez de
 * agradecer, e (3) **diz que mandou lenha para a PIRA**. Um "obrigado, herói" é uma fala gasta
 * num jogo em que o NPC falar diferente é o único sinal de que a missão existiu.
 *
 * O item (3) não é enfeite: é o ÚNICO lugar do jogo onde a regra "toda missão sobe a torre"
 * pode ser aprendida. Não há diário, não há contador na tela e a pira quase sempre está longe
 * de quem acabou de agradecer — se o NPC não disser em voz alta que mandou as toras, o jogador
 * volta lá um dia e encontra uma torre mais alta sem saber por quê. Cada um diz do jeito dele,
 * e ninguém diz o NÚMERO: o que se aprende é a regra, não a planilha.
 *
 * A lore que elas empurram é a do mago (locale `wizard.*`): o escuro tomou o mundo, a fogueira
 * dele é a última chama, as lareiras frias são DOS QUE VIERAM ANTES, e Zero é o último herdeiro
 * de uma cruzada esquecida. Cada NPC diz a parte disso que ele enxerga do lugar onde está — o
 * lenhador não sabe que vende o combustível de um renascimento, e é justamente isso que a fala
 * dele deixa escapar.
 */
const DONE_LINES = {
  // Três lareiras acesas: a LINHA de luz ficou maior.
  blackCatDone: [
    line('Three hearths breathing where there were three cold stones. Mrrow.'),
    line('You did not light fires. You moved a LINE — and everything on the far side of it noticed.'),
    line('The ones who kept those hearths are still out there, walking. They remember warmth. That is the whole problem.'),
    line('And I sent wood to that tower of yours in the open field. A cat pays in kindling. Mrrow.'),
  ],
  // Quatro pinheiros vivos: a clareira, e a luz que entrou com ela.
  poetDone: [
    line('Four pines down. Listen — the grove has a rest in it now.'),
    narr('He listens to the gap for a long time.'),
    line('And the light came in with the silence. That is the whole trick of this world, is it not: you cut, and the dark gets smaller.'),
    line('The trunks are too good to rot here. I had them hauled to your pyre — let the grove end as a signal.'),
  ],
  // O campo verde, e a foice que provou que ele cresceu.
  painterDone: [
    line('You GREW it. All the way down to the south beds — that is a meadow, and I did not paint it.'),
    line('In a world the dark ate, green is not decoration. Green is an argument.'),
    line('Come back when the light is low. That is the hour a field is worth the canvas.'),
    line('Oh, and the cuttings went to your tower in the field. A meadow can spare a few branches for a fire that big.'),
  ],
  // Seis gravetos entregues — e ele não sabe o que está vendendo.
  businessManDone: [
    line('Six sticks. Delivered. On schedule. Do you know how rare that is out here?'),
    line('And do you know what a stick is worth in a dark this size? Everything. A bridge, a fire, a night somebody survives.'),
    line('So I will keep buying timber and you will keep carrying flame. Different trades. Same fuel.'),
    line('And I wrote off a bundle to that pyre of yours. Call it advertising. Everyone will see it burn.'),
  ],
  // Estoque: quatro pedras e quatro gravetos — o que segura o fogo e o que o carrega.
  salesmanDone: [
    line('Stock! Actual stock! Friend, you have made me a legitimate business.'),
    line('Stone and sticks. One stops a fire dead, one carries it for miles. I sell both and take no side.'),
    line('The bucket stays free, obviously. Water is the only thing out here that ENDS a flame — a man should give that away, not sell it.'),
    line('I also had a load carried to your tower. Free. Do not tell anyone — it ruins the model.'),
  ],
  // A barra que afundou com quem trabalhou aqui antes do escuro.
  radiationSuitDone: [
    line('That is the metal. It went down with the ones who came before, and you walked it back over basalt.'),
    narr('The suit ticks twice and goes quiet.'),
    line('They worked this valley before the dark. Every bar out there was a day somebody spent. Carry it like that.'),
    line('I sent my scrap timber to your pyre, too. Nothing here is worth keeping dry for long.'),
  ],
  // Seis minérios: o primeiro carregamento da nave.
  astronautDone: [
    line('Six lumps of ore. That is a hull patch and a landing strut, and I am not being poetic.'),
    line('Ore, fire, hammer, bar. Your ancients ran that same order — I keep digging their slag out of this crater.'),
    line('She will not fly on six. But she stopped being scrap the moment you set them down. Bring bars if you find them; the counter stays open.'),
    line('And the crating from the ship went to that tower of yours. It was never going to fly. Let it burn where people can see it.'),
  ],
  // Cinco fogueiras e três cargas de carvão: a fumaça que ela viu atravessar três campos.
  deathDone: [
    line('Five hearths. And that furnace smoke again — I watched it cross three fields from right here.'),
    line('I was sent to CLOSE this place, hero. Instead I stand at the end of the road counting fires you lit.'),
    line('Go on, then. Light another. I will keep waiting — it is still the one thing I am good at.'),
    line('I had wood taken to your pyre as well. Do not read anything into it. I simply prefer the road lit.'),
  ],
  // Oito mortos da estrada, e seis campos trazidos à existência.
  wizardDone: [
    line('Eight of the road-dead put down, and six fields decided into being. You have been busy, Zero.'),
    line('They were the crusade before you. They kept the hearths you are relighting, and they lost. Do not hate them for still walking.'),
    line('Keep spending the coin. A world that stops being decided stops being.'),
    line('And the old crusade left cordwood in these ruins. It is at the pyre now, where it always meant to go.'),
  ],
};

const worldPath = fileURLToPath(new URL('../public/world.json', import.meta.url));
const questsPath = fileURLToPath(new URL('../src/game/dialogs/NpcQuests.ts', import.meta.url));
const backupPath = fileURLToPath(new URL('../backup/world-pre-npc-quests.json', import.meta.url));
const check = process.argv.includes('--check');

const world = JSON.parse(await fs.readFile(worldPath, 'utf8'));
const questsSrc = await fs.readFile(questsPath, 'utf8');

// ── As duas metades ainda se conhecem? ───────────────────────────────────────
const declared = new Set(
  [...questsSrc.matchAll(/doneDialog:\s*'([^']+)'/gu)].map((m) => m[1]),
);
const problems = [];
for (const id of Object.keys(DONE_LINES)) {
  if (!declared.has(id)) problems.push(`"${id}" tem falas aqui mas nenhuma missão o cita em NpcQuests.ts`);
  const base = id.replace(/Done$/u, '');
  if (!world.dialogs[base]) problems.push(`"${id}" derivaria de "${base}", que não existe em world.dialogs`);
}
for (const id of declared) {
  if (!DONE_LINES[id]) problems.push(`NpcQuests.ts pede o roteiro "${id}", que não tem falas neste script`);
}
if (problems.length) {
  console.error(`As missões e as falas se separaram:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

// ── O roteiro alternativo é o base com outras falas ──────────────────────────
const built = {};
for (const [id, lines] of Object.entries(DONE_LINES)) {
  const base = world.dialogs[id.replace(/Done$/u, '')];
  built[id] = { ...base, lines };
}

const before = JSON.stringify(
  Object.fromEntries(Object.keys(built).map((id) => [id, world.dialogs[id] ?? null])),
);
const after = JSON.stringify(built);
if (before === after) {
  console.log(`world.json já é o ponto fixo: ${Object.keys(built).length} roteiros de missão cumprida.`);
  process.exit(0);
}
if (check) {
  console.error('--check: world.json NÃO é o ponto fixo. Rode o script sem --check.');
  process.exit(1);
}

await fs.mkdir(fileURLToPath(new URL('../backup', import.meta.url)), { recursive: true });
await fs.writeFile(backupPath, JSON.stringify(world, null, 2), 'utf8');
for (const [id, dialog] of Object.entries(built)) world.dialogs[id] = dialog;
await fs.writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
console.log(
  `Wrote ${Object.keys(built).length} quest-done dialogs `
  + `(${Object.keys(world.dialogs).length} scripts in world.json). Backup: backup/world-pre-npc-quests.json`,
);
