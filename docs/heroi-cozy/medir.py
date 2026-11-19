# O CONTRASTE DE CADA HERÓI CONTRA O LUGAR (capturas/: <lugar>-antiga|nova|vazia.png, de capturar.mjs).
# A silhueta é o que muda entre a foto com o herói e a foto vazia (só na caixa em volta dele). Na borda dela, cada pixel
# do herói é comparado ao pixel do cenário logo ao lado (ΔE em Lab, CIE76): a média diz o quanto a silhueta se destaca,
# e a fração de bordas com ΔE < 12 diz o quanto dela some no fundo. Também a claridade (L*) média do herói e do anel de
# cenário em volta.
#   python medir.py  -> medidas.json
import json
import os

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
CAP = os.path.join(AQUI, 'capturas')
LUGARES = ['mata', 'prado', 'praia', 'cachoeira', 'lago', 'fonte-noite']


def lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def medir(lugar, qual):
    a = np.asarray(Image.open(os.path.join(CAP, f'{lugar}-{qual}.png')).convert('RGB')).astype(float)
    v = np.asarray(Image.open(os.path.join(CAP, f'{lugar}-vazia.png')).convert('RGB')).astype(float)
    h, w, _ = a.shape
    caixa = np.zeros((h, w), bool)
    caixa[h // 2 - 190:h // 2 + 150, w // 2 - 150:w // 2 + 150] = True
    mask = (np.abs(a - v).sum(-1) > 36) & caixa
    la = lab(a)
    pares = []
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        viz = np.roll(np.roll(mask, dy, 0), dx, 1)
        borda = mask & ~viz  # pixel do herói cujo vizinho (na direção) é cenário
        ys, xs = np.nonzero(borda)
        yv, xv = ys - dy, xs - dx
        ok = (yv >= 0) & (yv < h) & (xv >= 0) & (xv < w)
        d = np.linalg.norm(la[ys[ok], xs[ok]] - la[yv[ok], xv[ok]], axis=-1)
        pares.append(d)
    d = np.concatenate(pares)
    # o anel de cenário: 18 px em volta da silhueta
    anel = np.zeros_like(mask)
    for dy in range(-18, 19, 3):
        for dx in range(-18, 19, 3):
            anel |= np.roll(np.roll(mask, dy, 0), dx, 1)
    anel &= ~mask
    # O MIOLO contra o lugar (a borda é o contorno de tinta, igual nos dois): cada pixel do herói contra a cor média do
    # anel. Camuflagem = quanto do herói fica a menos de 15 de ΔE do lugar; destaque = o ΔE dos 10% mais distantes (a
    # parte do herói que puxa o olho).
    fundo = la[anel].mean(0)
    dh = np.linalg.norm(la[mask] - fundo, axis=-1)
    return {
        'pixels': int(mask.sum()),
        'camuflagem': round(float((dh < 15).mean()) * 100, 1),
        'destaque': round(float(np.percentile(dh, 90)), 1),
        'contraste_borda': round(float(d.mean()), 1),
        'borda_que_some': round(float((d < 12).mean()) * 100, 1),
        'L_heroi': round(float(la[mask][:, 0].mean()), 1),
        'L_fundo': round(float(la[anel][:, 0].mean()), 1),
    }


import sys

VARIANTES = ['antiga'] + (sys.argv[1:] or ['hero-cozy', 'hero-cozy-fechado'])
arq = os.path.join(AQUI, 'medidas.json')
out = json.load(open(arq, encoding='utf-8')) if os.path.exists(arq) else {}
for l in LUGARES:
    out.setdefault(l, {})
    for q in VARIANTES:
        out[l][q] = medir(l, q)
json.dump(out, open(arq, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
for l in LUGARES:
    linha = '  '.join(f"{q}: camuflagem {out[l][q]['camuflagem']:4.1f}% destaque {out[l][q]['destaque']:4.1f}" for q in VARIANTES)
    print(f'{l:12s} {linha}')
