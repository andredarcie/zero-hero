/**
 * O QUE CADA FALA É, para quem escreve (o editor de falas, editor/DialogEditor): um título curto e QUANDO o jogador a
 * vê, no lugar do caminho do código ("npc.radiationSuitHint.porcini" vira "Dica: porcini — falando com a Shui, se o
 * próximo cogumelo que falta colher é o porcini"). A tabela `CURATED` foi escrita lendo, no código, onde e em que
 * condição cada fala é escolhida (2026-11-18); a fala que o jogo de hoje não mostra está marcada (`unused`), para
 * ninguém gastar verso nela. O que não estiver na tabela cai na regra pelo jeito do caminho (o pedido, o obrigado, a
 * dica, o passo, o achado...). FALA NOVA NO CÓDIGO GANHA UMA LINHA AQUI.
 */

export interface FalaTitle {
  title: string;
  /** Quando o jogador vê esta fala (vazio se não se sabe). */
  when: string;
  /** O jogo de hoje não mostra esta fala (um NPC fora do mapa, uma fala reserva). */
  unused?: boolean;
}

type Row = [title: string, when: string, unused?: true];

const ROWS: Readonly<Record<string, Row>> = {
  // ── o mago (Sati) ──
  'wizard.intro': ['Sati na chegada ao vale', 'Na abertura: depois de fincar a espada, o herói vê o Sati chegar pela estrada, e ele fala pela primeira vez.'],
  'wizard.tent': ['Sati manda dormir no acampamento', 'Ao falar com o Sati antes da primeira noite dormida no colchão do acampamento (antes da 1ª visita da Morte).'],
  'wizard.again': ['Sati entre as visitas da Morte', 'Ao falar com o Sati depois da 1ª visita da Morte e antes da 3ª: ele manda dormir de novo.'],
  'wizard.guide': ['Sati depois da Morte', 'Ao falar com o Sati depois das três visitas da Morte, enquanto o portão do Jardim Alto segue fechado.'],
  'wizard.gate': ['Sati com o jardim aberto', 'Ao falar com o Sati depois que o portão do Jardim Alto foi aberto, antes do fim: ele manda ir à fogueira do meio.'],
  'wizard.after': ['Sati depois do fim', 'Ao falar com o Sati depois do final (a fogueira, o marshmallow e os créditos), quando o jogo volta de manhã.'],
  'npc.wizard.lines': ['Fala reserva do Sati', 'O Sati sempre diz uma das falas acima; esta fica de reserva.', true],
  // ── Shui ──
  'npc.radiationSuit.lines': ['Pedido dos cogumelos', 'Na primeira conversa com a Shui: ela pede quatro tipos de cogumelo, dá a faca e emenda a dica do porcini.'],
  'npc.radiationSuitDone.lines': ['Obrigado pelos quatro cogumelos', 'Na conversa em que o herói entrega o 4º tipo de cogumelo (o chá vem logo depois); volta se ele já colheu todos sem entregar.'],
  'npc.radiationSuitAll': ['Os oito cogumelos entregues', 'Ao falar com a Shui depois de entregar os oito tipos de cogumelo do vale; repete em toda conversa daí em diante.'],
  'npc.radiationSuitTea': ['Chá: o cogumelo escondido', 'Logo depois do obrigado pelos quatro cogumelos: a Shui acha um cogumelo pequeno escondido na cesta e vai fazer chá.'],
  'npc.radiationSuitTeaDrink': ['Chá: hora de beber', 'Com o chá pronto no fogo ao lado dela, antes de o herói beber e a viagem começar.'],
  'npc.radiationSuitTeaAfter': ['Chá: a volta da viagem', 'Quando a viagem do chá acaba e o herói volta a si, sentado diante da Shui; acontece uma vez por partida.'],
  'npc.radiationSuitHint.porcini': ['Dica: porcini', 'No 1º papo com a Shui, logo após o pedido (a câmera mostra o porcini ao lado dela); repete até o herói colhê-lo.'],
  'npc.radiationSuitHint.morel': ['Dica: morchela-amarela', 'Falando com a Shui, se o próximo cogumelo que falta colher é a morchela-amarela (depois do porcini).'],
  'npc.radiationSuitHint.puffball': ['Dica: bufa-de-lobo', 'Falando com a Shui, se o próximo cogumelo que falta colher é a bufa-de-lobo (depois da morchela).'],
  'npc.radiationSuitHint.inkCap': ['Dica: coprino-cabeludo', 'Falando com a Shui, se o próximo cogumelo que falta colher é o coprino-cabeludo (depois da bufa-de-lobo).'],
  'npc.radiationSuitHint.chanterelle': ['Dica: cantarelo-dourado', 'Falando com a Shui, se o próximo cogumelo que falta colher é o cantarelo-dourado (depois do coprino).'],
  'npc.radiationSuitHint.flyAgaric': ['Dica: amanita-mata-moscas', 'Falando com a Shui, se o próximo cogumelo que falta colher é a amanita-mata-moscas (depois do cantarelo).'],
  'npc.radiationSuitHint.oyster': ['Dica: cogumelo-ostra', 'Falando com a Shui, se o próximo cogumelo que falta colher é o cogumelo-ostra (depois da amanita).'],
  'npc.radiationSuitHint.jackOLantern': ['Dica: cogumelo-da-oliveira', 'Falando com a Shui, quando o herói já colheu os outros sete e falta o cogumelo-da-oliveira, o último.'],
  'finds.door.radiationSuit': ['Porta da casa da Shui', 'Ao bater (Z) na porta da casa da Shui: ela não deixa entrar e chama para sentar no banco da varanda.'],
  // ── Sisi ──
  'npc.painter.lines': ['Pedido da Sisi: cavar', 'Na primeira conversa com a Sisi: ela conta que tudo sai cinza, dá a pá e pede para cavar as trincas na frente dela.'],
  'npc.painterDone.lines': ['Sisi depois do quadro', 'Ao falar com a Sisi depois que o pedido dela fechou (o quadro pintado e comentado).'],
  'npc.painterStep.dig': ['Faltam buracos', 'Ao falar com a Sisi enquanto ainda faltam buracos para cavar; ela diz quantos faltam.'],
  'npc.painterStep.seeds': ['Buracos prontos: sementes', 'Ao falar com a Sisi depois de cavar os quatro buracos: ela guarda a pá e dá as sementes.'],
  'npc.painterStep.sow': ['Faltam sementes', 'Ao falar com a Sisi enquanto há buracos sem semente; ela diz quantas faltam plantar.'],
  'npc.painterStep.bucket': ['Plantado: hora de regar', 'Ao falar com a Sisi com as quatro sementes plantadas: ela dá o balde e manda buscar água na lagoa a oeste.'],
  'npc.painterStep.water': ['Faltam regar', 'Ao falar com a Sisi enquanto há covas sem água; ela diz quantas faltam regar.'],
  'npc.painterStep.wait': ['Esperar as flores', 'Com tudo regado e as flores crescendo: ela manda esperar ou dormir uma noite.'],
  'npc.painterStep.harvest': ['Flores prontas para colher', 'Ao falar com a Sisi com as flores abertas e ainda não todas colhidas: ela manda colher e levar à mesa.'],
  'npc.painterStep.bring': ['Levar as flores à mesa', 'Ao falar com a Sisi com as quatro flores já colhidas, mas ainda não levadas à mesa dela.'],
  'npc.painterStep.easel': ['Quadro armado: pode pintar', 'Ao falar com a Sisi com o cavalete já armado e o quadro ainda não pintado.'],
  'npc.painterMake.intro': ['Tintas: começo', 'Ao levar as flores colhidas à mesa da Sisi: ela começa a mostrar como faz a tinta.'],
  'npc.painterMake.urucum': ['Tinta de urucum', 'Na mesa, logo após o começo: o 1º pote enche com a tinta do urucum.'],
  'npc.painterMake.anil': ['Tinta de anil', 'Na mesa, depois do urucum: o 2º pote enche com o azul do anil.'],
  'npc.painterMake.curcuma': ['Tinta de cúrcuma', 'Na mesa, depois do anil: o 3º pote enche com o amarelo da cúrcuma.'],
  'npc.painterMake.garanca': ['Tinta de garança', 'Na mesa, depois da cúrcuma: o 4º pote enche com o vermelho da garança.'],
  'npc.painterMake.binder': ['Fixar a tinta', 'Na mesa, com os quatro potes cheios: ela conta como a cor fica presa.'],
  'npc.painterMake.brush': ['Pincel para o herói', 'Fim da cena da mesa: ela agradece, arma o cavalete e entrega o pincel ao herói.'],
  'npc.painterReview.form.sparse': ['Quadro com poucos traços', 'Ao voltar à Sisi depois de pintar, se o quadro ficou quase vazio: o 1º comentário dela.'],
  'npc.painterReview.form.middle': ['Quadro meio cheio', 'Ao voltar à Sisi depois de pintar, se o quadro não ficou nem quase vazio nem todo coberto: o 1º comentário.'],
  'npc.painterReview.form.full': ['Quadro todo pintado', 'Ao voltar à Sisi depois de pintar, se a tinta cobriu quase a tela toda: o 1º comentário dela.'],
  'npc.painterReview.color.all': ['Usou as quatro cores', 'Logo após o comentário da forma, se o herói usou as quatro cores no quadro.'],
  'npc.painterReview.color.urucum': ['Cor que manda: urucum', 'Logo após o comentário da forma, se faltou alguma cor e a que mais aparece é a do urucum (laranja).'],
  'npc.painterReview.color.anil': ['Cor que manda: anil', 'Logo após o comentário da forma, se faltou alguma cor e a que mais aparece é a do anil (azul).'],
  'npc.painterReview.color.curcuma': ['Cor que manda: cúrcuma', 'Logo após o comentário da forma, se faltou alguma cor e a que mais aparece é a da cúrcuma (amarelo).'],
  'npc.painterReview.color.garanca': ['Cor que manda: garança', 'Logo após o comentário da forma, se faltou alguma cor e a que mais aparece é a da garança (vermelho).'],
  'npc.painterReview.thanks': ['Obrigado da Sisi', 'Fecha a conversa dos comentários do quadro: ela agradece e pega o pincel de volta; o pedido dela termina aí.'],
  'finds.door.painter': ['Porta da casa da Sisi', 'Ao bater (Z) na porta da casa da Sisi: ela não deixa entrar e chama para sentar no banco da varanda.'],
  // ── Marco ──
  'npc.businessMan.lines': ['Pedido do Marco: lenha', 'Na primeira conversa com o Marco: ele pede lenha rachada e dá o machado (a árvore seca e o cepo aparecem na tela).'],
  'npc.businessManDone.lines': ['Marco depois da fogueira', 'Ao falar com o Marco depois da noite da fogueira, com o pedido dele já fechado.'],
  'npc.businessManStep.gather': ['Falta lenha', 'Ao falar com o Marco sem galho na mão, enquanto faltam metades de lenha; ele diz quantas faltam.'],
  'npc.businessManStep.block': ['Galho na mão: o cepo', 'Ao falar com o Marco com um galho seco na mão: ele mostra o cepo e explica como rachar.'],
  'npc.businessManStep.ready': ['Lenha pronta', 'Ao falar com o Marco depois de deixar as duas metades no chão da fogueira: ele manda acender.'],
  'npc.businessManStep.light': ['Lembrete: acender o fogo', 'Ao falar com o Marco de novo antes de acender a fogueira.'],
  'npc.businessManNight.split.clean': ['Comentário: corte limpo', 'Na noite da fogueira, após a 1ª fala do Marco, se os dois galhos racharam limpos, de primeira.'],
  'npc.businessManNight.split.rough': ['Comentário: corte torto', 'Na noite da fogueira, após a 1ª fala do Marco, se algum galho não rachou limpo de primeira.'],
  'npc.businessManNight.fire.first': ['Comentário: fogo de primeira', 'Na noite da fogueira, logo após o comentário do corte, se o fogo pegou na primeira tentativa.'],
  'npc.businessManNight.fire.worked': ['Comentário: fogo trabalhoso', 'Na noite da fogueira, logo após o comentário do corte, se o fogo precisou de mais de uma tentativa.'],
  'npc.businessManNight.story': ['Noite da fogueira: conversa', 'Depois de acender o fogo do Marco: ele senta com o herói e conversa (os dois comentários entram após a 1ª fala).'],
  'npc.businessManNight.farewell': ['Noite da fogueira: despedida', 'Na mesma noite, depois de um silêncio olhando o fogo: a última fala do Marco antes de amanhecer.'],
  'finds.door.businessMan': ['Porta da casa do Marco', 'Ao bater (Z) na porta da casa do Marco: ele não deixa entrar e chama para sentar no banco da varanda.'],
  // ── Thea ──
  'npc.astronaut.lines': ['Pedido da Thea: telescópio', 'Na primeira conversa com a Thea: a nave caiu, ela pede ajuda com o telescópio e dá a picareta (segue a dica do minério).'],
  'npc.astronautDone.lines': ['Thea depois do céu', 'Ao fechar o pedido, a Thea parte na nave e não dá mais para falar com ela: esta fala fica de reserva.', true],
  'npc.astronautHint.ore': ['Dica: buscar minério', 'Logo após o pedido da Thea, e ao falar com ela enquanto o herói ainda não pegou minério de ferro.'],
  'npc.astronautHint.bloom': ['Dica: o forno', 'Ao falar com a Thea depois de pegar minério, antes de ter a esponja de ferro: levar minério e carvão ao forno.'],
  'npc.astronautHint.iron': ['Dica: a bigorna', 'Ao falar com a Thea com a esponja de ferro já feita, antes da barra: ela manda martelar na bigorna.'],
  'npc.astronautStep.anvil': ['Thea busca a barra', 'Ao terminar a barra de ferro na bigorna: a Thea vem correndo, pega a barra e vai montar o tripé.'],
  'npc.astronautStep.tripod': ['Tripé pronto, falta a lente', 'Raro: se o herói levar a barra de ferro na mão até a Thea (em vez de ela vir à bigorna); ela pede areia e cinza.'],
  'npc.astronautStep.wait': ['Lembrete: areia e cinza', 'Com o tripé pronto, ao falar com a Thea sem o vidro na mão: ela lembra onde estão a areia e a cinza.'],
  'npc.astronautStep.polish': ['Polir a lente', 'Ao falar com a Thea com o vidro do forno na mão (ou no meio do polimento): ela ensina a polir a lente.'],
  'npc.astronautStep.carry': ['Levar o telescópio', 'Logo que a lente fica pronta e o telescópio vai para o herói; repete se falar com ela antes de levá-lo ao marco.'],
  'npc.astronautStep.night': ['Esperar a noite', 'Com o telescópio já montado no marco de pedras, ao falar com a Thea antes de anoitecer.'],
  'npc.astronautStep.farewell': ['No planalto, à noite', 'De noite no planalto, depois de achar os quatro alvos no telescópio: a Thea senta ao lado e conversa.'],
  'npc.astronautStep.goodbye': ['Adeus da Thea', 'Logo após a conversa no planalto, quando a nave vem buscá-la: o adeus antes de partir.'],
  'npc.astronautStep.reunion': ['Thea volta na festa final', 'No fim do jogo, na fogueira do Jardim Alto: a Thea chega de nave e se junta aos amigos.'],
  'finds.door.astronaut': ['Porta da casa da Thea', 'A Thea não tem porta de casa no mapa hoje.', true],
  // ── a Morte ──
  'death.visit': ['1ª visita da Morte', 'Na 1ª noite dormindo no colchão do acampamento: depois de olhar as estrelas, a Morte aparece e avisa que volta.'],
  'death.visit2': ['2ª visita da Morte', 'Na 2ª noite dormida no colchão do acampamento, quando a noite acaba: a Morte volta e pergunta se ele viveria tudo de novo.'],
  'death.visit3': ['3ª e última visita', 'Na 3ª noite dormida no colchão do acampamento: a despedida da Morte; ao levantar, a foice dela fica no chão.'],
  // ── o fim, a chave e a narração ──
  'garden.key': ['Entrega da chave do jardim', 'No fim da última fala de quem fecha o último dos quatro pedidos (qualquer um); logo depois vem a chave do Jardim Alto.'],
  'ending.lines': ['Narração final', 'No fim, sentado na fogueira do Jardim Alto com os amigos, quando o marshmallow doura; depois sobem os créditos.'],
  'finds.helmet': ['Capacete com flor', 'Ao usar Z no capacete enferrujado largado no vale, fora do caminho dos pedidos.'],
  'finds.bottle': ['Garrafa com bilhete', 'Ao usar Z na garrafa com bilhete achada no vale.'],
  'finds.sword': ['A espada fincada', 'Ao usar Z na espada que o herói fincou no chão na abertura: ela vibra e vem este pensamento.'],
  'finds.smithy': ['A forja velha', 'Ao usar Z no resto de parede da forja velha, perto do forno e da bigorna da Thea.'],
  'finds.sign': ['Placa do Jardim Alto', 'Ao usar Z na placa ao lado do portão do Jardim Alto, enquanto ele está fechado.'],
  'finds.signOpen': ['Placa com o jardim aberto', 'Ao usar Z na mesma placa depois que o portão do Jardim Alto foi aberto com a chave.'],
  'finds.door.empty': ['Casa vazia da Thea', 'Seria ao bater na porta da Thea depois que ela partiu, mas a casa dela não tem porta no mapa.', true],
  'camp.ring': ['Pedras da fogueira', 'Ao usar Z nas pedras da fogueira do acampamento do herói.'],
  'camp.rack': ['Lembrança da Shui', 'Ao usar Z no secador de cogumelos, a lembrança da Shui que o jogador põe no acampamento.'],
  'camp.easel': ['Lembrança da Sisi', 'Ao usar Z no quadro da Sisi, a lembrança que o jogador põe no acampamento depois do pedido dela.'],
  'camp.woodpile': ['Lembrança do Marco', 'Ao usar Z na pilha de lenha, a lembrança do Marco posta no acampamento.'],
  'camp.chart': ['Lembrança da Thea', 'Ao usar Z no mapa de estrelas, a lembrança da Thea posta no acampamento.'],
  'camp.tubEmpty': ['Tina sem tinta', 'Ao usar Z na tina de tingir do acampamento quando ainda não há tinta: o herói pensa nas flores da Sisi.'],
  'cat.barrel': ['Barril vazio do gato', 'Ao usar Z no barril do gato quando ele não está dormindo lá dentro.'],
  // ── o gato (Sinope) ──
  'npc.blackCat.lines': ['Fala reserva do gato', 'O gato não fica no mapa como os outros: no carinho ele diz as lições (a 1ª é igual a esta).', true],
  'cat.talk.*': ['Lição do gato', 'Carinho no gato (Z perto dele, ou no barril com ele dormindo), que chega após o 1º pedido: as lições em ordem, depois sorteadas.'],
  // ── fora do jogo ──
  'npc.salesman.lines': ['Falas do vendedor', 'O vendedor não está no mapa de hoje.', true],
  'npc.poet.lines': ['Falas do poeta', 'O poeta não está no mapa de hoje.', true],
};

/** De quem é a fala ("da Shui"), para o nome na caixa. */
const OF: Readonly<Record<string, string>> = {
  wizard: 'do Sati', radiationSuit: 'da Shui', painter: 'da Sisi', businessMan: 'do Marco', astronaut: 'da Thea',
  blackCat: 'do gato Sinope', death: 'da Morte', salesman: 'do vendedor', poet: 'do poeta',
};
const SUBJECT: Readonly<Record<string, string>> = {
  wizard: 'o Sati', radiationSuit: 'a Shui', painter: 'a Sisi', businessMan: 'o Marco', astronaut: 'a Thea',
  blackCat: 'o gato', death: 'a Morte', salesman: 'o vendedor', poet: 'o poeta',
};
const OUT_OF_MAP: ReadonlySet<string> = new Set(['salesman', 'poet']);

const row = ([title, when, unused]: Row): FalaTitle => (unused ? { title, when, unused } : { title, when });

/** O título e o "quando" da fala deste caminho. */
export const falaTitle = (key: string): FalaTitle => {
  if (ROWS[key]) return row(ROWS[key]);
  let m: RegExpExecArray | null;
  if ((m = /^cat\.talk\.(\d+)$/u.exec(key))) return { ...row(ROWS['cat.talk.*']), title: `Lição do gato nº ${m[1]}` };
  if ((m = /^(?:npc\.(\w+?)(?:Done)?|(death))\.name$/u.exec(key))) {
    const kind = m[1] ?? m[2];
    return OUT_OF_MAP.has(kind)
      ? { title: 'Nome na caixa de fala', when: `O nome ${OF[kind] ?? kind}, que não está no mapa de hoje.`, unused: true }
      : { title: 'Nome na caixa de fala', when: `O nome que aparece em cima da fala ${OF[kind] ?? `de ${kind}`}.` };
  }
  const who = (kind: string): string => SUBJECT[kind] ?? kind;
  if ((m = /^npc\.(\w+)Done\.lines$/u.exec(key))) return { title: 'O obrigado', when: `Quando ${who(m[1])} recebe o que pediu.` };
  if ((m = /^npc\.(\w+)\.lines$/u.exec(key))) return { title: 'Primeira conversa', when: `Quando o herói fala com ${who(m[1])} pela primeira vez.` };
  if ((m = /^npc\.(\w+)Hint\.(\w+)$/u.exec(key))) return { title: `Dica: ${m[2]}`, when: `Quando ${who(m[1])} explica o próximo passo (${m[2]}).` };
  if ((m = /^npc\.(\w+)Step\.(\w+)$/u.exec(key))) return { title: `Passo do pedido: ${m[2]}`, when: `Durante o pedido ${OF[m[1]] ?? m[1]}.` };
  if ((m = /^finds\.door\.(\w+)$/u.exec(key))) return { title: 'Batendo à porta', when: `Quando o herói bate à porta ${OF[m[1]] ?? m[1]}.` };
  if ((m = /^finds\.(\w+)$/u.exec(key))) return { title: `Achado: ${m[1]}`, when: 'Quando o herói lê um achado do vale.' };
  if ((m = /^camp\.(\w+)$/u.exec(key))) return { title: `Acampamento: ${m[1]}`, when: 'Quando o herói usa esta peça do acampamento.' };
  return { title: key.split('.').pop() ?? key, when: '' };
};
