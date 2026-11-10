# Escrita em verso — o padrão do jogo

Toda fala do Zero The Hero é verso (pedido do autor, 2026-11-09). Este é o padrão para escrever qualquer verso da
história: falas novas, revisões, narração. A regra técnica (metro, estrofe, rima) mora no `_verso` de
`src/game/i18n/dialogos/pt-br.json` e é conferida por `src/game/i18n/versos.test.ts`; o que o teste não consegue
conferir — clareza, rima de ouvido — está aqui, e vale tanto quanto.

**O critério acima de todos: lida UMA vez, em voz alta, uma pessoa sem nenhuma leitura de filosofia entende.**
Quando a rima e a clareza brigam, troca-se a rima. Nunca a clareza.

## A forma

- **Uma estrofe por caixa.** A caixa de fala mostra a estrofe inteira, para a rima ficar à vista
  (`runtime/poemLayout.ts` recua os versos que rimam e não quebra verso).
- **Quadra:** quatro versos, o 2º rimando com o 4º.
- **Dístico:** dois versos que rimam entre si — a fala curta, a que o código encaixa em outra, e a de quem se
  alterna com outro falante na mesma conversa (o narrador e o mago, na abertura).
- **Metro solto, ritmo de fala:** entre 6 e 9 sílabas poéticas por verso. Não é contagem para caber: é para soar
  como alguém falando. O verso que precisa de inversão para caber no metro está errado.
- **Rima de ouvido, não de grafia:** o teste compara a escrita, e o ouvido compara o som. É aberto não rima com
  ê fechado (*colher/quiser*, *seco/eco*), nem ó com ô (*calor/redor*, *cor/melhor*). Evitar rima da mesma raiz
  (*funda/afunda*, *ele/dele*). Rima idêntica não vale.

## As cinco regras da clareza

1. **Ordem direta.** Sujeito, verbo, complemento — como na fala. Nada de inverter a frase para a rima cair.
   - ✗ *o sábio, um do outro, separa*
   - ✓ *o que eu não controlo, deixo*
2. **Palavras do dia a dia.** Sem termo técnico, palavra rara ou construção de livro antigo. Se a pessoa precisaria
   de dicionário, troque a palavra.
3. **Uma frase inteira a cada dois versos.** Cada par de versos se entende sozinho; não espalhe uma frase em
   pedaços pela estrofe.
4. **A escola como conselho prático, preso à história do personagem.** A filosofia não é citada: é dita como o
   personagem diria a um amigo, sobre a vida dele. O Marco perdeu tudo — o estoicismo dele é sobre o que ele
   controla. A Sisi pinta e tudo sai cinza — o absurdo dela é criar mesmo sem resposta do mundo.
5. **A missão continua dizendo direção, item e quantidade.** Rimado, mas sem perder o que o jogador precisa fazer.

## Exemplo

O Marco, a primeira fala.

Antes (rebuscado: inversão e ideia abstrata):

> Perdi o negócio, a lenha,
>     tudo. A mão treme, e não para.
> O que é meu, e o que não é:
>     o sábio, um do outro, separa.

Depois (o mesmo estoicismo, dito como numa conversa):

> Perdi o negócio e a lenha;
>     a mão treme sem parar.
> O que eu não controlo, deixo;
>     do que é meu, eu vou cuidar.

## Conferência de cada estrofe

- [ ] Lida uma vez em voz alta, dá para entender?
- [ ] A frase está na ordem direta?
- [ ] Toda palavra é do dia a dia?
- [ ] Cada par de versos é uma frase inteira?
- [ ] A rima soa como rima (mesma vogal aberta ou fechada)?
- [ ] Se é de um personagem com escola, a ideia dela aparece como conselho prático?
- [ ] Se é missão, diz para onde ir, o quê e quantos?
- [ ] O português e o inglês têm o mesmo número de caixas e de versos em cada caixa (`node scripts/dialogos.mjs --check`)?

## O inglês

O inglês é outro poema, não tradução (a rima não se traduz): common meter (8·6·8·6), dísticos 8·8, conferido de
ouvido. As mesmas regras de clareza valem para ele.
