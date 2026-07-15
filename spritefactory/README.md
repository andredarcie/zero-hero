# Sprite Factory

Fábrica isolada de sprites no padrão exato de Zero the Hero. Nada aqui é importado pelo jogo —
o único produto que sai daqui é um PNG instalado em `public/assets/` por um passo explícito.

## O padrão do jogo (medido, não inventado)

Extraído dos 151 PNGs shipped (`node spritefactory/extract-palette.mjs` regenera a auditoria em
`reports/palette-report.txt`):

1. **Frames de 16×16.** Sheets empilham frames (herói = 80×16 em linha; chave = 16×32 em coluna).
   Nenhum pixel pode vazar do tile — profundidade vem do shader 3D, nunca de arte maior.
2. **2 a 8 cores por frame.** A pedra tem 2, a árvore 3, o sheet inteiro do herói 8. Menos é mais.
3. **Alpha binário.** Zero anti-aliasing, zero sombra suave (0,23% de pixels semi-transparentes em
   todo o jogo — e são artefatos, não estilo).
4. **Sem outline preto.** O "preto" do jogo é o navy **#1d2b53** (o ink). Sprites são silhuetas
   chapadas: o herói é navy com detalhe verde, o vaso é navy sobre navy. Exceção: *pickups* podem
   ganhar halo claro #cdcdcd para ler no chão escuro (precedente: frame de mapa da key.png).
5. **Sombra chapada, luz da esquerda.** A pedra é literalmente lado claro + lado escuro com aresta
   dura. Sem gradiente, sem dithering ordenado.
6. **Textura orgânica = speckle.** Folhagem e água usam ruído esparso (árvore, grass tile, água),
   nunca degradê.
7. **Terreno é full-bleed 100% opaco;** props e itens flutuam centrados com respiro dentro do tile.
8. **Animação é micro-variação:** posições de brilho da água mudam, pernas alternam, fagulhas da
   tocha se movem. Nunca redesenhe a silhueta inteira entre frames.

A paleta curada vive em `lib/palette.mjs` (RAMPS, escadas nomeadas dark→light); o censo completo em
`lib/palette-data.mjs` (gerado). O ink navy, bone, stone, olive, wood, ember, gold etc.

## O loop de auto-melhoria (para a IA que vier trabalhar aqui)

O formato de autoria primário é o **text grid** — o mesmo formato que o `dump` imprime para os
sprites originais. Estudar um sprite shipped e rascunhar um novo são o mesmo ato.

```bash
# 1. ESTUDE — despeje referências como grid de texto e olhe a paleta
node spritefactory/factory.mjs dump environment/props/rock.png
node spritefactory/factory.mjs palette

# 2. AUTORE — escreva sprites/<nome>.mjs (grid + paleta; veja sprites/barrel.mjs)

# 3. CONSTRUA — PNG + preview + relatório do linter; sai com erro se algo FALHAR
node spritefactory/factory.mjs build <nome>

# 4. OLHE — leia out/<nome>-preview.png (zoom 12×, contexto dia E noite no tile real de grama).
#    Julgue: a silhueta lê a 1×? Some à noite? Parece pertencer ao lado da pedra e do vaso?

# 5. MELHORE — edite o grid, rebuild, compare. Repita 3–5 até o linter passar E o olho aprovar.

# 6. INSTALE — só quando perfeito (o install recusa se houver FAIL no relatório)
node spritefactory/factory.mjs install <nome> environment/props/<nome>.png
#    …e registre no src/game/assets/assetManifest.ts para o jogo carregar.
```

O critério de pronto é duplo, e os dois valem: **o linter passa** (regras objetivas acima) e
**o preview convence** (a parte que só o olho pega: silhueta, peso, leitura à noite). Não pule o
passo 4 — o linter não vê forma.

## Formato de spec (`sprites/<nome>.mjs`)

```js
export default {
  name: 'barrel',
  kind: 'prop',          // prop | item | character | terrain | effect | icon
  layout: 'row',         // como frames viram sheet: 'row' (anim) ou 'column' (estados)
  palette: { A: '#63452c', B: '#815938', C: '#b7916a', D: '#1d2b53' },
  frames: [[             // 16 strings de 16 chars; '.' = transparente
    '................',
    // ...
  ]],
  // draw({Pix, seededRng, speckle, RAMPS}) => [Pix,...]  // alternativa procedural (speckle etc.)
  // allowNewColors: ['#123456'],  // fora da paleta só com declaração explícita + motivo em notes
  // allowOrphans: true,           // pixels isolados intencionais (fagulhas)
  notes: 'por que essas cores/essa forma',
}
```

## Arquivos

- `factory.mjs` — CLI (`build` / `check` / `dump` / `palette` / `install`)
- `extract-palette.mjs` — regenera paleta e auditoria a partir de `public/assets`
- `lib/png.mjs` — PNG decode/encode sem dependências
- `lib/palette.mjs` — ramps curadas + nearest-colour ("você quis dizer")
- `lib/pixel.mjs` — canvas de pixel, grids, speckle com RNG semeado (builds determinísticos)
- `lib/analyze.mjs` — o linter (todas as regras do padrão, com níveis fail/warn/info)
- `lib/preview.mjs` — a folha de revisão (zoom + contexto dia/noite com tiles reais)
- `sprites/` — specs; `out/` — artefatos construídos; `reports/` — auditoria da paleta

`check` também audita PNGs existentes: `node spritefactory/factory.mjs check public/assets/... prop`.
