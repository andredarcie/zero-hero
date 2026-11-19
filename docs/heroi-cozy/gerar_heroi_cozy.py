# O HERÓI DO ZERO THE HERO (2026-11-19): começou como hipótese de um herói mais "cozy" e, em oito rodadas julgadas no
# jogo (capturar.mjs, medir.py, montar_comparacao.py; README.md conta), virou o definitivo: a folha `hero-v8.png`
# é a public/assets/characters/player/hero.png. Para mudar o herói, mude AQUI e copie a folha para lá (a antiga está em
# hero-antigo.png). A capa usa só os três tons de runtime/homeState.CAPE_COLORS: é o pano que a tina tinge.
#
# Mesmas regras da folha de hoje (public/assets/characters/player/hero.png): 80x32, quadros de 16x16, na mesma ordem
#   0..3 andando de frente (3 = parado)   4 de costas   5 golpe de frente   6 golpe de costas   7..8 meditando
# e cores das rampas do jogo (spritefactory/lib/palette.mjs), mais a pele dos vizinhos (npcs.png).
#
# O desenho: o elmo do herói continua (é a marca dele), mas redondo, aberto e claro, com dois chifrinhos de marfim; o
# rosto aparece (olhos, bochechas); um cachecol vermelho que salta do verde da mata e do azul da água; uma túnica
# azul-acinzentada que se separa da areia e da grama; botas e, de costas, uma mochila de couro: um explorador.
#
#   python gerar_heroi_cozy.py   -> hero-cozy.png (a folha) e hero-cozy-x8.png (a prévia)
import os
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))

# As cores já contam com a luz do jogo, que levanta o claro (a 1ª prova no jogo: o elmo cinza-claro saía branco puro,
# os chifres brilhavam e a pele ficava amarela): o elmo é cinza-MÉDIO, o marfim é escuro, a pele puxa para o rosa.
COR = {
    'O': '#1d2b53',  # tinta do jogo (o contorno: aqui ninguém usa preto)
    'o': '#243669',
    # elmo: aço AZULADO (a luz quente do dia puxava o cinza para o bege, e o elmo sem rosto lia como pele com uma tarja
    # nos olhos); o brilho de um pixel na cúpula diz "metal"
    'H': '#7a8aa6',
    'h': '#5a6a86',
    'j': '#414d66',
    'X': '#c9d4e6',
    'C': '#c8bc96',  # chifre de marfim
    'c': '#9a9078',
    'S': '#e39478',  # pele
    's': '#c9615a',  # bochecha e boca
    'E': '#1d2b53',  # olho
    'R': '#c83e3e',  # cachecol (ember)
    'r': '#a53030',
    'q': '#7d2424',
    'B': '#3f607e',  # túnica (deepblue)
    'b': '#334c62',
    'd': '#26384a',
    'W': '#886644',  # couro (wood)
    'w': '#63452c',
    'v': '#4a3220',
}

ELMO = [
    "................",
    ".O....OOOO....O.",
    ".CO.OOhXHhOO.OC.",
    ".cCOhHXHHHHhOCc.",
    "..cOhHHHHHHhOc..",
    "...OjhhhhhhjO...",
]
# o rosto: o cabelo castanho nas laterais arredonda o rosto (sem ele, um retângulo de pele), os olhos juntos e uma boca
ROSTO = [
    "...OwSSSSSSwO...",
    "...OwSESSESwO...",
    "...OSsSSSSsSO...",
    "....OSSssSSO....",
]
NUCA = [
    "...OvwwwwwwvO...",
    "...OvwwwwwwvO...",
    "...OvvwwwwvvO...",
    "....OvvvvvvO....",
]
CORPO_FRENTE = [
    "..RRRrRRRRrRRq..",
    "..OqbBBBBBBbOq..",
    "..ObBBBBBBBbOq..",
    "...OdWWWWWdO....",
]
# de costas, a mochila clara (o couro novo) contra o cabelo escuro: um explorador
CORPO_COSTAS = [
    "..RRRRRRRRRRq...",
    "..ObWWWWWWbOq...",
    "..ObWwwwwWbOq...",
    "...OdWWWWdO.....",
]
# os braços abertos do golpe (a ferramenta entra por fora, no jogo)
CORPO_GOLPE = [
    ".ORRRrRRRRrRRqO.",
    "OSOqbBBBBBBbOqSO",
    "..ObBBBBBBBbO...",
    "...OdWWWWWdO....",
]
PERNAS = {
    'parado': ["...OdbbObbdO....", "...OvvO..OvvO..."],
    'passoE': ["...OdbbObbdO....", "...OvvO...OvO..."],
    'meio':   ["....OdbObdO.....", "....OvvOvvO....."],
    'passoD': ["...OdbbObbdO....", "....OvO..OvvO..."],
}
MEDITA = [
    "................",
    "................",
    ".O....OOOO....O.",
    ".CO.OOhHHhOO.OC.",
    ".cCOhHHHHHHhOCc.",
    "..cOhHHHHHHhOc..",
    "...OjhhhhhhjO...",
    "...OwSSSSSSwO...",
    "...OwSoSSoSwO...",  # olhos fechados (dois pontos: uma barra lia como a viseira antiga)
    "...OSsSSSSsSO...",
    "....OSSssSSO....",
    ".ORRRrRRRRrRRqO.",
    "OSbbBBBBBBBBbbSO",
    "OdbvvvwwwwvvvbdO",
    "OvvvwwwwwwwwvvvO",
    ".OOOOOOOOOOOOOO.",
]


# ── A 2ª HIPÓTESE: SEM ROSTO (o autor, 2026-11-19: "o ideal seja não mostrar o rosto do personagem, porque aí cada
# pessoa se identifica com o personagem sem saber como ele é de verdade, por trás da armadura"). O elmo fecha: uma
# fenda escura de ponta arredondada no lugar do rosto (nada de olho, nada do T verde), redondo e de aço; o resto fica
# (o cachecol vermelho, a túnica, as botas, a mochila).
# A fenda fica na altura dos OLHOS, logo abaixo da cúpula, numa linha só (a 1ª prova a punha embaixo, em duas linhas:
# de longe ela lia como uma boca aberta, não como viseira).
# A VISEIRA EM T (o autor, 2026-11-19: "faça o capacete ter um desenho de T"): a fenda dos olhos e, descendo do meio
# dela, a abertura do nariz e da boca — o T do Zero de hoje, agora aberto no aço em vez de pintado de verde.
ELMO_VISEIRA = ELMO[:5] + ["...OhOOOOOOhO..."]
ELMO_FECHADO = [
    "...OhHHOOHHhO...",
    "...OjhhOOhhjO...",
    "...OjhhhhhhjO...",
    "....OjjjjjjO....",  # o queixo do elmo, mais estreito: a cabeça fica redonda
]
NUCA_FECHADA = [
    "...OhHHHHHHhO...",
    "...OhhhhhhhhO...",
    "...OjhhhhhhjO...",
    "....OjjjjjjO....",
]
MEDITA_FECHADO = MEDITA[:6] + [
    "...OhOOOOOOhO...",
    "...OhHHOOHHhO...",
    "...OjhhOOhhjO...",
    "...OjhhhhhhjO...",
    "....OjjjjjjO....",
] + [l.replace('S', 'h') for l in MEDITA[11:]]  # as mãos nos joelhos: luvas de aço, sem pele


CORES = dict(COR)  # a paleta da folha que está sendo gerada (gerar() troca)


def quadro(linhas, sobe=0):
    """Um quadro 16x16 a partir das linhas (sobe = quantos pixels o corpo sobe: o balanço do passo)."""
    q = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    linhas = (linhas + ['................'] * 16)[:16]
    for y, l in enumerate(linhas):
        for x, ch in enumerate(l[:16]):
            if ch == '.':
                continue
            yy = y - sobe
            if 0 <= yy < 16:
                h = CORES[ch]
                q.putpixel((x, yy), (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), 255))
    return q


def gerar(rosto, nuca, medita, nome, elmo=ELMO, cor=None):
    """A folha inteira (80x32, a ordem da de hoje) com este rosto (ou viseira), esta nuca e esta meditação."""
    CORES.clear()
    CORES.update({**COR, **(cor or {})})
    def frente(pernas, sobe=0):
        topo = quadro(elmo + rosto + CORPO_FRENTE + ['................', '................'], sobe)
        # (o elmo tem 6 linhas, o rosto 4 e o corpo 4: as pernas ficam nas duas últimas). No passo o corpo sobe um
        # pixel: a coxa sobe junto (repete a linha de cima da perna), senão abre uma fresta na cintura.
        pernas_linhas = PERNAS[pernas]
        if sobe:
            pernas_linhas = [pernas_linhas[0]] + pernas_linhas
        topo.alpha_composite(quadro(['................'] * (16 - len(pernas_linhas)) + pernas_linhas))
        return topo

    def costas(corpo=CORPO_COSTAS):
        return quadro(ELMO + nuca + corpo + PERNAS['parado'])

    golpe = CORPO_GOLPE if rosto is ROSTO else [l.replace('S', 'h') for l in CORPO_GOLPE]  # luva de aço, sem pele
    folha = Image.new('RGBA', (80, 32), (0, 0, 0, 0))
    quadros = [
        frente('passoE', 1), frente('meio'), frente('passoD', 1), frente('parado'),
        costas(),
        quadro(elmo + rosto + golpe + PERNAS['parado']),
        costas([golpe[0].replace('S', 'w'), golpe[1]] + CORPO_COSTAS[2:]),
        quadro(medita),
        quadro(medita[1:] + ['................']),
    ]
    for i, q in enumerate(quadros):
        folha.alpha_composite(q, ((i % 5) * 16, (i // 5) * 16))
    folha.save(os.path.join(AQUI, f'{nome}.png'))
    prev = folha.resize((80 * 8, 32 * 8), Image.NEAREST)
    fundo = Image.new('RGBA', prev.size, (58, 70, 60, 255))
    fundo.alpha_composite(prev)
    fundo.save(os.path.join(AQUI, f'{nome}-x8.png'))


gerar(ROSTO, NUCA, MEDITA, 'hero-cozy')
gerar(ELMO_FECHADO, NUCA_FECHADA, MEDITA_FECHADO, 'hero-cozy-fechado', elmo=ELMO_VISEIRA)

# ── A 3ª RODADA: LONGE DO SHOVEL KNIGHT (um cavaleiro de elmo com chifres e viseira em T, todo azul). O aço fica cinza
# NEUTRO (um nada frio, que a luz quente do dia leva ao cinza), e a túnica sai do azul: ou roxa (a cor do Zero que o
# autor lembra, "o cavaleiro roxo e verde", e a tinta violeta do próprio jogo) ou o azul de antes, para comparar.
ACO = {'H': '#8a8f9c', 'h': '#686d79', 'j': '#4d515c', 'X': '#d6dbe4'}
ROXO = {'B': '#7d4fa0', 'b': '#6a3a8c', 'd': '#4e2a6a'}
gerar(ELMO_FECHADO, NUCA_FECHADA, MEDITA_FECHADO, 'hero-v3-roxo', elmo=ELMO_VISEIRA, cor={**ACO, **ROXO})
gerar(ELMO_FECHADO, NUCA_FECHADA, MEDITA_FECHADO, 'hero-v3-azul', elmo=ELMO_VISEIRA, cor=ACO)

# ── A 4ª RODADA: o que a 3ª mostrou no jogo. (1) O aço "neutro" volta a bege na luz dourada do dia; o aço AZULADO da 2ª
# rodada é o que o jogo mostra como cinza de verdade — ele fica (é a paleta-base, COR). (2) O roxo saturado sai
# rosa-choque de dia e briga com o cachecol; o azul, com o T e os chifres, puxa para o Shovel Knight. Um roxo
# ACINZENTADO: o "cavaleiro roxo" de hoje, sem o azul do outro, e sem virar rosa ao sol.
ROXO_POEIRA = {'B': '#6a5a8e', 'b': '#554676', 'd': '#3e335a'}
gerar(ELMO_FECHADO, NUCA_FECHADA, MEDITA_FECHADO, 'hero-v4', elmo=ELMO_VISEIRA, cor=ROXO_POEIRA)

# ── A 5ª RODADA (o autor, depois de ver o roxo no jogo: "essa roupa roxa não combinou... no lugar do cachecol, faça uma
# capa mesmo"). A CAPA volta (é o pano da tina, nos três vermelhos): de frente ela aparece nos ombros e dos lados, presa
# por um broche dourado; de costas cobre o herói do ombro ao joelho. A túnica sai do roxo — duas provas: armadura de aço
# (o cavaleirinho inteiro, do elmo às grevas) e gibão de couro (o aventureiro).
CAPA_FRENTE = [
    "..ORrOBGGBOrRO..",  # os ombros: a capa por cima, e o broche
    ".ORrOBBBBBBOrRO.",
    ".ORqObBBBBbOqRO.",
    ".OqqOdWWWWdOqqO.",  # o cinto, e a capa caindo dos lados
]
CAPA_GOLPE = [CAPA_FRENTE[0], "hORrOBBBBBBOrROh"] + CAPA_FRENTE[2:]  # os braços abertos, as luvas de aço
CAPA_COSTAS = [
    "..ORRRRRRRRRRO..",
    ".ORRrRRRRRRrRRO.",
    ".ORrRRRRRRRRrRO.",
    ".OqrRRRRRRRRrqO.",
]
CAPA_COSTAS_GOLPE = [CAPA_COSTAS[0], "hORRrRRRRRRrRROh"] + CAPA_COSTAS[2:]
BARRA = ".OqqrrrrrrrrqqO."  # a barra da capa, de costas
PERNAS_CAPA = {
    'parado': [".OqqOdbOObdOqqO.", "....OvvOOvvO...."],
    'passoE': [".OqqOdbOObdOqqO.", "....OvvOOvO....."],
    'meio':   [".OqqOdbOObdOqqO.", "....OvvOOvvO...."],
    'passoD': [".OqqOdbOObdOqqO.", ".....OvOOvvO...."],
}
MEDITA_CAPA = MEDITA_FECHADO[:11] + [
    "..ORrOBGGBOrRO..",
    ".ORrObBBBBbOrRO.",
    "ORrhdWWWWWWdhrRO",  # as luvas nos joelhos, o cinto
    "OqbbbbBBBBbbbbqO",  # as pernas cruzadas, e a capa no chão dos dois lados
    ".OOOOOOOOOOOOOO.",
]


def gerar_capa(nome, cor):
    """A folha do herói de capa (mesma ordem de quadros), nesta paleta."""
    CORES.clear()
    CORES.update({**COR, 'G': '#d8a838', **cor})

    def frente(pernas, sobe=0, corpo=CAPA_FRENTE):
        topo = quadro(ELMO_VISEIRA + ELMO_FECHADO + corpo + ['................', '................'], sobe)
        linhas = PERNAS_CAPA[pernas]
        if sobe:
            linhas = [linhas[0]] + linhas
        topo.alpha_composite(quadro(['................'] * (16 - len(linhas)) + linhas))
        return topo

    def costas(corpo=CAPA_COSTAS):
        return quadro(ELMO + NUCA_FECHADA + corpo + [BARRA, "....OvvOOvvO...."])

    folha = Image.new('RGBA', (80, 32), (0, 0, 0, 0))
    quadros = [
        frente('passoE', 1), frente('meio'), frente('passoD', 1), frente('parado'),
        costas(), frente('parado', corpo=CAPA_GOLPE), costas(CAPA_COSTAS_GOLPE),
        quadro(MEDITA_CAPA), quadro(MEDITA_CAPA[1:] + ['................']),
    ]
    for i, q in enumerate(quadros):
        folha.alpha_composite(q, ((i % 5) * 16, (i // 5) * 16))
    folha.save(os.path.join(AQUI, f'{nome}.png'))
    prev = folha.resize((80 * 8, 32 * 8), Image.NEAREST)
    fundo = Image.new('RGBA', prev.size, (58, 70, 60, 255))
    fundo.alpha_composite(prev)
    fundo.save(os.path.join(AQUI, f'{nome}-x8.png'))


# armadura: o aço do elmo também no corpo e nas grevas (o cinto de couro); gibão: couro, e o cinto mais escuro
gerar_capa('hero-v5-aco', {'B': '#7a8aa6', 'b': '#5a6a86', 'd': '#414d66'})
gerar_capa('hero-v5-couro', {'B': '#886644', 'b': '#63452c', 'd': '#4a3220', 'W': '#3a2618'})

# ── O DEFINITIVO (a 6ª): a armadura de aço venceu (o couro sai laranja na luz dourada e embola com o vermelho da capa;
# o aço faz o cavaleirinho inteiro). O aço do CORPO desce um degrau: de dia o peito clareava quase a branco e disputava
# com o elmo — o elmo fica o ponto mais claro, e o broche dourado aparece.
gerar_capa('hero-v6', {'B': '#5a6a86', 'b': '#414d66', 'd': '#323c52'})

# ── A 7ª (o autor: "a capa ficou boa, mas faltou os braços... faça a capa da cor roxa que o personagem tinha antes...
# gostei da versão com armadura"). OS BRAÇOS: de frente a capa tapava os lados, e o corpo era um tronco só. Agora o
# tronco tem 4 pixels, cada braço 2 (o de fora mais escuro), com a ombreira de aço em cima e a luva clara na altura do
# cinto; a capa aparece atrás dos braços e se abre na barra. A COR: o "roxo" do herói de antes é o índigo da folha dele
# (#223467 / #1d2b53) — e #1d2b53 é o contorno do jogo inteiro, então a capa nesse tom se funde no contorno. Duas provas:
# o índigo original com um realce, e o mesmo índigo puxado para o violeta e mais claro.
# (Os braços são do aço CLARO do elmo — a 1ª prova os fazia no aço escuro do corpo, e no jogo eles sumiam na capa
# índigo: os lados viravam dois blocos azuis.)
CAPA_FRENTE_BRACOS = [
    ".ORHhOBGGBOhHRO.",  # as ombreiras de aço por cima da capa, o broche
    ".ORhHOBBBBOHhRO.",  # os braços (o lado de fora um tom abaixo), o tronco
    ".ORhHObBBbOHhRO.",
    ".OqHHOdWWdOHHqO.",  # as luvas na altura do cinto
]
CAPA_GOLPE_BRACOS = [
    CAPA_FRENTE_BRACOS[0],
    "OHhhhOBBBBOhhhHO",  # os braços abertos, as luvas na ponta
    ".ORrOObBBbOOrRO.",
    ".OqqOOdWWdOOqqO.",
]


def gerar_capa_bracos(nome, cor):
    """A folha do herói de capa e braços (mesma ordem de quadros), nesta paleta."""
    CORES.clear()
    CORES.update({**COR, 'G': '#d8a838', 'B': '#5a6a86', 'b': '#414d66', 'd': '#323c52', **cor})

    def frente(pernas, sobe=0, corpo=CAPA_FRENTE_BRACOS):
        topo = quadro(ELMO_VISEIRA + ELMO_FECHADO + corpo + ['................', '................'], sobe)
        linhas = PERNAS_CAPA[pernas]
        if sobe:
            linhas = [linhas[0]] + linhas
        topo.alpha_composite(quadro(['................'] * (16 - len(linhas)) + linhas))
        return topo

    def costas(corpo=CAPA_COSTAS):
        return quadro(ELMO + NUCA_FECHADA + corpo + [BARRA, "....OvvOOvvO...."])

    folha = Image.new('RGBA', (80, 32), (0, 0, 0, 0))
    quadros = [
        frente('passoE', 1), frente('meio'), frente('passoD', 1), frente('parado'),
        costas(), frente('parado', corpo=CAPA_GOLPE_BRACOS), costas(CAPA_COSTAS_GOLPE),
        quadro(MEDITA_CAPA), quadro(MEDITA_CAPA[1:] + ['................']),
    ]
    for i, q in enumerate(quadros):
        folha.alpha_composite(q, ((i % 5) * 16, (i // 5) * 16))
    folha.save(os.path.join(AQUI, f'{nome}.png'))
    prev = folha.resize((80 * 8, 32 * 8), Image.NEAREST)
    fundo = Image.new('RGBA', prev.size, (58, 70, 60, 255))
    fundo.alpha_composite(prev)
    fundo.save(os.path.join(AQUI, f'{nome}-x8.png'))


gerar_capa_bracos('hero-v7-indigo', {'R': '#2c4287', 'r': '#223467', 'q': '#1b284f'})
gerar_capa_bracos('hero-v7-violeta', {'R': '#4f449a', 'r': '#3d3480', 'q': '#2c2563'})

# ── A 8ª (o autor: "o braço ficou muito grosso... faça fino, de um pixel... não é para ocupar tanto espaço no corpo").
# Cada braço é UM pixel: a ombreira e o braço no aço claro, o antebraço um tom abaixo, a luva clara no cinto. O tronco
# volta aos 6 pixels de antes, e as pernas ficam debaixo dele.
CAPA_FRENTE_BRACOS[:] = [
    ".ORHOBBGGBBOHRO.",  # o ombro, o tronco e o broche
    ".ORHOBBBBBBOHRO.",  # o braço fino, colado na capa
    ".ORhObBBBBbOhRO.",  # o antebraço
    ".OqHOdWWWWdOHqO.",  # a luva, na altura do cinto
]
CAPA_GOLPE_BRACOS[:] = [
    CAPA_FRENTE_BRACOS[0],
    "OHHHOBBBBBBOHHHO",  # os braços abertos, finos
    ".ORrObBBBBbOrRO.",
    ".OqqOdWWWWdOqqO.",
]
gerar_capa_bracos('hero-v8', {'R': '#2c4287', 'r': '#223467', 'q': '#1b284f'})
print('ok')
