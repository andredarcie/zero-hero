# A IMAGEM DO JULGAMENTO: as folhas ampliadas no alto e, embaixo, cada lugar com cada herói, no jogo de verdade
# (capturas/), de perto (com o destaque medido, medidas.json) e no zoom de sempre.
#   python montar_comparacao.py <saída.png> "<título>" antiga="Hoje" hero-v3-roxo="Roxo" ...
# Cada variante é o nome da folha sem .png (a de hoje é `antiga`, e a folha dela é a do jogo).
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
saida, titulo, pares = sys.argv[1], sys.argv[2], [a.split('=', 1) for a in sys.argv[3:]]
med = json.load(open(os.path.join(AQUI, 'medidas.json'), encoding='utf-8'))
LUGARES = [('mata', 'Mata'), ('prado', 'Prado (a pintora)'), ('praia', 'Praia'), ('cachoeira', 'Cachoeira'),
           ('lago', 'Lago, fim de tarde'), ('fonte-noite', 'Fonte termal, noite')]
F = 'C:/Windows/Fonts/'
fonte = lambda n, s: ImageFont.truetype(F + n, s)
T1, T2, T3 = fonte('segoeuib.ttf', 38), fonte('segoeuib.ttf', 24), fonte('segoeui.ttf', 19)
# (a folha `antiga` é a cópia guardada do herói de antes: desde a troca, a do jogo já é a nova)
folha_de = lambda v: 'hero-antigo.png' if v == 'antiga' else f'{v}.png'

C, G = 300, 14
W = len(LUGARES) * C + (len(LUGARES) + 1) * G
FOLHA = 7 if len(pares) <= 3 else 5
LINHA = 30 + C + 46
H = 90 + 34 + 32 * FOLHA + 36 + 2 * len(pares) * LINHA + 50
img = Image.new('RGB', (W, H), (24, 22, 28))
d = ImageDraw.Draw(img)
d.text((G, 18), titulo, font=T1, fill=(245, 239, 220))

y = 90
for i, (v, rot) in enumerate(pares):
    folha = Image.open(os.path.join(AQUI, folha_de(v))).convert('RGBA').resize((80 * FOLHA, 32 * FOLHA), Image.NEAREST)
    x = G + i * (W // len(pares))
    fundo = Image.new('RGBA', folha.size, (58, 70, 60, 255))
    fundo.alpha_composite(folha)
    img.paste(fundo.convert('RGB'), (x, y + 34))
    d.text((x, y), rot, font=T2, fill=(255, 224, 102))
y += 34 + 32 * FOLHA + 36

for sufixo, zoom in (('', 'de perto'), ('-real', 'no zoom do jogo')):
    for v, rot in pares:
        d.text((G, y), f'{rot}, {zoom}', font=T2, fill=(255, 224, 102))
        for i, (lugar, nome) in enumerate(LUGARES):
            im = Image.open(os.path.join(AQUI, 'capturas', f'{lugar}-{v}{sufixo}.png')).convert('RGB')
            w, h = im.size
            cx, cy = w // 2, h // 2 - (30 if not sufixo else 10)
            x = G + i * (C + G)
            img.paste(im.crop((cx - C // 2, cy - C // 2, cx + C // 2, cy + C // 2)), (x, y + 30))
            legenda = f'{nome} · destaque {med[lugar][v]["destaque"]:.0f}' if not sufixo else nome
            d.text((x, y + 30 + C + 4), legenda, font=T3, fill=(220, 214, 200))
        y += LINHA
d.text((G, H - 36), 'Mesma hora, mesmo lugar e a luz do jogo (a folha do herói trocada em tempo de execução). '
       'Destaque: ΔE dos 10% do herói mais distantes da cor do lugar em volta.', font=T3, fill=(170, 165, 155))
img.save(os.path.join(AQUI, saida))
print(img.size)
