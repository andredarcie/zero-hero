# Plano — o que a reforma do combate não alcançou

Revisão completa de `EnemyBase`, `WalkerEnemy`, as 7 espécies, `EnemyManager`, `EnemyProjectile`,
`CorpseDecals`, o bloco de combate do `GameScene`, `PlayerMovementController`, `HeroView` e
`SwordOrbit`. A reforma (ver `progress.md`, "O combate que passou a existir") está bem feita; o que
segue é o que ficou de fora dela.

Ordem de execução: os quatro bloqueadores primeiro, depois coerência, depois polimento.

---

## Bloqueadores

### [x] 1. A caveira ficou inteira fora da reforma

`UndeadEnemy extends EnemyBase`, não `WalkerEnemy` — e todas as leis novas moram no `WalkerEnemy`.
O inimigo mais comum do jogo é o único que não cumpre nenhuma delas:

| o que | onde | hoje |
|---|---|---|
| golpe armado é compromisso | `UndeadEnemy.takeDamage` | zera `windupMs` + `attackTimer` |
| guarda a frente | `guardsAgainst` | não sobrescreve → nunca guarda |
| marca o tile mirado | `markTargetTile` | não existe |
| brilho da guarda | `showGuardGlint` | não existe |
| `isWindingUp` | snapshot/debug | sempre `false` (o `gameDebug` mente) |
| tom de ferido | `startWindup` | `clearTint()` apaga o `woundedShade` |

`playtest/scenarios/esgrima.mjs:344` já cobra isto sobre um `spawnUndead`: o `waitForFunction` de
`windingUp` estoura os 8s e as duas asserções da guarda caem. O cenário está vermelho agora.

**Decisão.** Não herdar de `WalkerEnemy` — o cabeçalho dele explica, com razão, por que a caveira
fica no arquivo dela. A correção é mover **o telegrafo inteiro** (estado + marca + brilho + a
geometria da guarda + o `whiff`) para o `EnemyBase`, que é onde uma coisa que duas classes fazem
igual deve morar. Duas rotas para o mesmo fato é como uma delas envelhece errada — é a mesma conta
que tirou a ossada própria da caveira.

- `EnemyBase`: `startWindup(tx, ty, ms)`, `tickWindup(delta, px, py, hasTorch) → 'idle'|'busy'|'strike'`,
  `guardsAgainst`, `isWindingUp`, `clearWindup()` chamado de `die`/`despawn`/`destroy`.
- `WalkerEnemy` e `UndeadEnemy` viram dois clientes do mesmo telegrafo.

### [x] 2. O golpe armado acerta por cima de um vão depois do arremesso

`WalkerEnemy.update` sai cedo no `tickHitstun` **antes** do bloco de windup, e `struck` só compara o
tile mirado — não há teste de alcance. Acerte uma aranha armada a 1 tile: ela é arremessada para 2,
fica atordoada 300ms, e os 200ms restantes de windup cobram o golpe **de dois tiles de distância**.

Correção dentro do `tickWindup` (uma vez, para todo mundo): o golpe só pega se o tile mirado ainda
estiver ao alcance do corpo (`Manhattan(corpo, tile) <= 1`). Fora disso, `whiff()`.

### [x] 3. `sweepArc` conta recusa como acerto

`landed += 1` roda mesmo quando `strikeEnemy` saiu nos i-frames ou na guarda. O próximo corpo de
verdade do mesmo gesto chega com `echo = true`, e isso engole `playEnemyHit`, a piscada amarela do
herói, `playEnemyDeath` e o pacote inteiro do encontrão. No giro (8 tiles) acontece fácil.

`strikeEnemy` passa a devolver se o golpe **landou**, e só isso conta.

### [x] 4. A carga do giro sobrevive à pausa

ESC → `scene.pause()` → o plugin de teclado dorme → o `keyup-Z` nunca chega → `attackHeld` fica
`true` para sempre. Ao voltar, a carga completa sozinha: o sino toca do nada e o herói solta faíscas
douradas indefinidamente. O comentário do `pressAttack` já nomeia esta armadilha e defende o caminho
do *aperto* com `event.repeat`; o caminho da *carga* ficou aberto.

`resetChargeAndBuffers()` no `openPauseMenu`, antes do `scene.pause()`.

---

## Coerência de design

### [x] 5. O botão B não paga nada pelo golpe

`pressUse` nunca chama `root()` nem `lungeIntoSwing()`. O graveto aceso é o único golpe que ainda
mata de uma vez **e** o único que se dá em velocidade máxima de caminhada — a exceção caiu justo no
golpe mais forte. A raiz entra **só no ramo que bate numa criatura**, nunca no resto da tabela do B
(pegar, pousar, machado, picareta) — prender os pés para apanhar um graveto seria o defeito oposto.

### [x] 6. O golpe de item só é desenhado quando acerta

Em `strikeEnemy`, `swingHeld` vem depois das saídas de i-frames e guarda: B recusado mostra faísca e
nenhuma mão se mexe. O caminho do A é cuidadoso com exatamente isto ("o arco sai mesmo no vazio"), e
três linhas acima o `useItemAt` já desenha o arco no caso `isSpawning`. O arco sobe para antes das
recusas.

### [x] 7. A carência de virar-se é global, não por criatura

`creatureTurnGraceUntilMs` é um relógio só: virar-se para a caveira ao norte compra 180ms de
esbarrão grátis no slime a leste. Contra matilha, é um golpe de graça. A carência passa a lembrar
**em quem** foi gasta. O campo de tempo fica com o mesmo nome — os cenários zeram ele por lá.

### [x] 8. `iron` não bate

`stone`, `charcoal` e `battery` levam 1.5 com o comentário "as good as any other blunt tool"; o
lingote de ferro ficou de fora e não faz nada. Ou é contundente ou não é.

---

## Polimento

### [x] 9. FX da carga e do giro ancoram no tile lógico

`spawnChargeMote` e `spawnSpinRing` usam `playerWorld` direto. O `swingAnchor` passa de propósito
pelo `visualWorld` porque a posição lógica pula para o tile de destino quando o passo começa —
carregar andando põe as faíscas até um tile à frente do corpo desenhado.

### [x] 10. `despawn()` não desfaz a piscada dos i-frames

`die()` reseta `blinkDown`/alpha de propósito ("a piscada não pode vazar para a morte"); `despawn()`
não, então um corpo que se desfaz no vale da piscada começa a derreter em alpha 0.35.

### [x] 11. `shove` mata a pose do wind-up

O `killTweensOf(this)` apaga o `poseWindup`: corpo arremessado no meio do telegrafo fica em pé,
neutro, ainda comprometido — enquanto o anel no chão continua fechando. As duas metades do aviso
discordam. Depois de assentar o arremesso, o corpo volta a se agachar pelo tempo que sobra.

### [x] 12. Comentários que a reforma deixou para trás

- `GameScene.ts:283` — "the sword — or the stick while it BURNS — one-shots"
- `GameScene.ts:3899` — "`sword`: … mata a caveira de um golpe"
- `MageEnemy.ts:13,16` — "a espada mata de um golpe" / "A espada continua matando de um golpe"
- `SlimeEnemy.ts:22` — "a espada — que mata qualquer coisa de um golpe"
- `UndeadEnemy.ts:14-17` — "any damage taken mid-wind-up interrupts the attack"

### [x] 13. Código morto do revólver

`PlayerMovementController.setMouseWalkEnabled` + `mouseWalkEnabled`: ninguém chama, e o docstring
são três parágrafos sobre uma arma arrancada do jogo.

### [x] 14. `progress.md:35` levou um estrago acidental

`centraliza \nender_game_to_text e dvanceTime` quebrado em duas linhas nesta árvore de trabalho.

### [x] 15. Perf do `EnemyManager`

Um closure `blockedForEnemy` novo por inimigo por frame, e cada consulta faz `enemies.some(...)` —
mais um closure por chamada. Irrelevante com ~13 corpos; é no explorador que apareceria.

**O que NÃO fazer:** um índice `Map<tile, corpo>` por tick. Os corpos andam **durante** o laço (o
inimigo *i* dá um passo e o *i+1* consulta), e um índice velho deixaria dois corpos empilharem.
Correção honesta: um closure só por `update`, com o corpo corrente numa variável, e a varredura num
`for` em vez de `some` — sem alocação por consulta e sem mudar uma vírgula da semântica.

---

## Verificação

**Feito.** Os 15 itens estão implementados. `npm run typecheck` e `npx eslint src/ playtest/` passam
limpos. O "porquê" de cada um foi registrado no `progress.md` (seção "A terceira passada"); o
`CLAUDE.md` não mudou de propósito — nenhuma lei nova entrou, o que mudou foi o número de espécies
que cumpre as que já estavam escritas.

O que cada cenário passa a provar:

- **`esgrima`** — o portão. Os itens 1, 2, 3 e 7 mudam o que ele mede, e o passo 8 saiu do vermelho:
  o `waitForFunction` de `windingUp` na caveira agora resolve, a guarda dela responde, e ganhou duas
  asserções novas — um golpe no meio do telegrafo **fere e não cancela**. Se este bloco voltar a
  ficar vermelho, o que quebrou foi a unificação do telegrafo.
- **`fauna`** — o bestiário que anda: as outras seis espécies passaram a chamar a mesma máquina de
  windup, então é aqui que uma regressão no `tickWindup` aparece primeiro.
- **`combate`** — o contrato dos dois botões (o item 5 põe raiz e investida no B).
- **`inimigos`**, **`zora`**, **`projeteis`**, **`placa-undead`** — a rede. Nada aqui deveria
  movê-los; o `placa-undead` importa porque o item 1 mexeu no `takeDamage` da caveira, que é onde a
  cegueira de placa mora.

---

# Segunda leva — polimento

A primeira leva consertou o que o combate FAZ. Esta é sobre o que ele MOSTRA e o que ele SOA, que
é a metade que decide se ele é gostoso. Oito itens, e o primeiro é o maior achado da revisão.

### [x] Q1. O golpe que MATA é o único que não move o corpo

Todo golpe que não mata arremessa o corpo um tile (`shove`). O que mata não move nada: `strikeEnemy`
chama `enemy.triggerKnockback(dx, dy)` para o corpo morto, e `triggerKnockback` sai na primeira
linha (`if (!this.alive) return`) — e mesmo que não saísse, `render()` para de escrever a posição do
billboard depois da morte, então o deslocamento não teria por onde aparecer. **O melhor golpe do
jogo é o único que deixa o corpo exatamente onde ele estava**, inchando e desmanchando de pé.

O arremesso da morte tem de andar na POSIÇÃO do billboard, que é o que o desmanche já usa. Vale para
a bomba também, que mata pelo mesmo caminho e pelo mesmo silêncio.

### [x] Q2. Duas das três recusas são MUDAS

O aparo tem o tim (`playGuardBlock`). O resvalo nos i-frames e o golpe no corpo que ainda está
nascendo **não têm som nenhum** — o jogador aperta o botão, vê a lâmina passar por dentro do bicho e
não ouve nada, o que lê como input perdido e não como recusa. A lei da casa diz "toda recusa tem
desenho PRÓPRIO"; ela vale para o ouvido também.

### [x] Q3. Nenhuma recusa tem hitstop

A lâmina atravessa uma guarda erguida com menos resistência do que atravessa o ar. Um golpe aparado
é um IMPACTO — e o hitstop é a ferramenta mais barata e mais forte que existe para dizer "isto não
passou". Curto no aparo, curtíssimo no resvalo, um por gesto.

### [x] Q4. A faísca do acerto não tem direção

`spawnHitSpark` espalha em 360° uniformes, então um golpe vindo do oeste e um vindo do leste
desenham exatamente a mesma coisa. As faíscas têm de sair PARA FORA do golpe — a direção é a
informação, e é a mesma regra que a faísca da guarda já respeita.

### [x] Q5. O golpe errado do bicho não marca o lugar que ele mirou

O anel fecha sobre um tile e ali não acontece nada: a esquiva só é desenhada no CORPO (a investida e
o som). O tile que o telegrafo prometeu por meio segundo merece o impacto — é o que fecha o laço que
o anel abriu, e é o que faz "eu saí de lá a tempo" ser uma coisa vista.

### [x] Q6. Quatro espécies não reagem em cor ao dano

`hurtTexture` só existe na caveira, no morcego e no mago. Aranha, gosma, torreta e zora caem no
`restoreTint()`, que com a vida cheia não muda pixel nenhum — o primeiro golpe nelas não tem
resposta de corpo, só faísca e empurrão. A resposta certa não é acender (a lei do bloom), é
ESCURECER: um recuo de valor, curto, que funciona em qualquer corpo e não pede arte nova.

### [x] Q7. Bater na torreta apaga o aviso de que ela vai atirar

`takeDamage` chama `restoreTint()`, que limpa o `CHARGE_TINT` — então acertar a torreta no meio da
carga apaga o brilho azul e o leque sai sem aviso nenhum. É o mesmo problema que o mago já tinha
resolvido com um `restoreTint` próprio.

### [x] Q8. A lâmina não reage ao conectar

O arco varre os mesmos 155° na mesma velocidade e na mesma cor, acerte ou não. O hitstop já
CONGELA a lâmina no meio do arco quando o golpe conecta — falta ela dizer por que parou. Um lampejo
quente no sprite da arma durante o quadro congelado é o *impact frame* clássico, e aqui é de graça:
o arco é um sprite 2D do Phaser sobre o canvas, não um billboard `emissive`, então a lei do bloom
não se aplica a ele.

### Como se verifica a segunda leva

Quase tudo aqui é olho e ouvido — é o que "polimento" quer dizer. O que os cenários ainda seguram é
a estrutura por baixo: `esgrima` cobre resvalo, guarda e arremesso (os três caminhos que ganharam som
e hitstop), e `fauna` cobre o windup das seis espécies (que agora termina em poeira quando erra).
Nenhum deles assere pixel nem decibel, e nem deveria.

O que se olha jogando, em ordem de importância:

1. **matar uma caveira** — o corpo tem de ser jogado para trás enquanto se desfaz, e não inchar de pé;
2. **bater duas vezes seguidas rápido** — o segundo golpe tem de raspar e travar de leve, com som;
3. **bater de frente numa caveira armando** — faísca no lado fechado, tim, e a lâmina mordendo;
4. **sair do tile mirado** — a poeira tem de estourar no chão onde você estava;
5. **socar uma aranha ou uma gosma** — o corpo tem de escurecer no golpe (elas não têm arte de dano);
6. **bater na torreta carregando** — o azul do aviso tem de sobreviver à pancada;
7. **uma bomba no meio de três caveiras** — os três corpos têm de voar para fora dela.

---

### A única coisa que precisa de OLHO, não de asserção

A caveira **passou a guardar a frente**, e ela é o corpo que a matilha manda. É o que o design
sempre disse (e o que as outras seis já faziam), mas é a mudança de dificuldade real desta leva:
atacar de frente uma caveira que está armando agora é recusado, e a resposta vira sair do tile ou
contornar — o giro, que corta as diagonais, é a saída contra um cerco.

Se na mão isso ficar duro demais, o botão de ajuste existe e é de uma linha: `guardsWhileWindingUp`
devolvendo `false` no `UndeadEnemy` tira a guarda **só dela**, sem tocar em nenhuma outra espécie e
sem desfazer nada do resto (a marca no chão, o compromisso do golpe e o tom de ferido continuam).
