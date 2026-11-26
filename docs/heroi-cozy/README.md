# O herói do Zero The Hero (2026-11-19)

O pedido: pesquisar como os jogos cozy desenham os protagonistas, comparar com o herói de então (o cavaleiro
azul-marinho de capa verde) nos cenários do jogo e, se ele não combinasse, desenhar um novo — e, depois, "continuar até
chegar no personagem definitivo".

## A pesquisa (16 jogos cozy da Steam e guias de design)

Formas redondas e cabeça grande; rosto à mostra (quase todos); um toque quente que salta do cenário (a mochila laranja
da Claire, a capa vermelha do jacaré, o cabelo ruivo do Kynseed); uma ferramenta como identidade; e "se as fases são
florestas verdes, evite personagens verdes". "Cozy" é a fantasia de segurança, abundância e suavidade (Project
Horseshoe). Herói cabe no gênero quando é de brincadeira (Lil Gator Game) ou quando larga a espada (Wanderstop).

## As rodadas (tudo julgado NO JOGO: a folha trocada em tempo de execução, mesma hora, lugar e luz)

| rodada | o quê | o que o jogo (e o autor) disse |
|---|---|---|
| 1 | explorador com rosto (`hero-cozy.png`) | o mais "cozy" de cartilha; o autor preferiu sem rosto: "cada pessoa se identifica com o personagem sem saber como ele é, por trás da armadura" |
| 2 | elmo fechado (`hero-cozy-fechado.png`) | a fenda baixa lia como boca; o cinza saía bege e lia como pele com tarja → aço azulado, brilho na cúpula, e a viseira em T pedida |
| 3 | longe do Shovel Knight (`hero-v3-*.png`) | aço "neutro" volta a bege na luz dourada; roxo saturado sai rosa-choque; azul puxa para o Shovel Knight |
| 4 | roxo-poeira e cachecol (`hero-v4.png`) | foi ao jogo; o autor: "essa roupa roxa não combinou... no lugar do cachecol, faça uma capa mesmo" |
| 5 | a capa de volta (`hero-v5-aco.png`, `hero-v5-couro.png`) | o couro sai laranja e embola com o vermelho; a armadura de aço faz o cavaleirinho inteiro |
| 6 | capa vermelha (`hero-v6.png`) | foi ao jogo; o autor: "a capa ficou boa, mas faltou os braços... faça a capa da cor roxa que o personagem tinha antes" |
| 7 | braços de 2 pixels e capa índigo (`hero-v7-indigo.png`; `hero-v7-violeta.png` é a mesma, mais roxa) | braços de aço CLARO (no aço escuro sumiam na capa); a capa no índigo do herói de antes. Foi ao jogo; o autor: "o braço ficou muito grosso... faça fino, de um pixel... não é para ocupar tanto espaço no corpo" |
| 8 | braço de um pixel (`hero-v8.png`) | cada braço é UM pixel de aço claro, no lugar de um pixel da capa; o tronco volta aos 6 pixels de antes. Foi ao ar; o autor: "o herói antigo quando andava mexia as pernas e braços, esse atual não" |
| 9 | **o definitivo** (`hero-v9.png`) | o andar de verdade: no passo, o pé de trás sobe um pixel e as mãos balançam (uma entra na frente do cinto, a outra sai sobre a capa); o corpo não sobe mais no quadro (o jogo já o balança). `andar.gif` mostra o original, a 8ª e a 9ª andando |

O ganho é de tom (um cavaleirinho redondo de braços e capa, não uma caixa escura) e o verde que sai do herói (ele
brigava com o mato); o herói continua tão legível quanto antes em todo lugar.

## No jogo

- `public/assets/characters/player/hero.png` = `hero-v9.png` (a antiga está em `hero-antigo.png`).
- A tina tinge a CAPA: `homeState.CAPE_COLORS` são os três tons dela (e só dela, na folha).
- `spritefactory/sprites/hero-meditate.mjs` é a meditação do herói antigo: não reinstalar.

## Comandos

```
python gerar_heroi_cozy.py                       # as folhas (e as prévias -x8)
node capturar.mjs hero-antigo.png hero-v9.png   # as fotos no jogo (servidor em :5173); `antiga` = a do jogo
python medir.py hero-antigo hero-v9             # camuflagem e destaque (medidas.json)
python montar_comparacao.py definitivo.png "título" hero-antigo="Antes" hero-v9="Definitivo"
```
