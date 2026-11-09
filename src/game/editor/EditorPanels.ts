// OS PAINÉIS DO EDITOR: os controles da vista, as opções da ferramenta e a paleta da aba (tiles, NPCs, itens, peças),
// com o ícone e a dica de cada célula. Refeitos a cada mudança de estado.

import { bosqueIconKey } from '@/game/objects/BigTrees';
import { fenceIconKey } from '@/game/objects/WoodFence';
import { yardIconKey } from '@/game/objects/LumberYard';
import { forgeIconKey } from '@/game/objects/OldForge';
import { crashIconKey } from '@/game/objects/CrashSite';
import { ASSET_KEYS, KEY_FRAMES, MOONFLOWER_FRAMES, NPC_VISUALS, SEA_TILE_FRAME, SOLID_GROUND_FRAMES, SOLID_UPPER_FRAMES, TOOLBOX_FRAMES } from '@/game/constants';
import type { TileLayerId } from '@/game/editor/EditorStore';
import { fungusTextureKey } from '@/game/fungi/fungi';
import type { PickupKind } from '@/game/world/ScreenContent';
import type { PropKind } from '@/game/world/worldSchema';
import { NPC_KINDS, NPC_LABELS } from './EditorModals';
import { type EntitySelection, ENTITY_DOT_COLOR } from './EditorMinimap';
import type { EditorDomUi } from './EditorDomUi';

export type CollisionPaintMode = 'keep' | 'set' | 'clear';
// O que a ferramenta Serra pinta: o planalto, ou a escada (que aponta sozinha para o planalto).
export type ReliefPaintMode = 'high' | 'peak' | 'stair';
export type ViewMode = 'world' | 'chunk';
// A ESPADA NAO ESTA AQUI, e a ausencia e a regra: ela deixou de ser item (o heroi nasce com a
// dele — ver GameScene.swordEquipped) e nao nasce mais no chao nem se apanha. Oferece-la na
// paleta seria autorar um objeto que o mundo carrega e nenhum botao usa.
export const PICKUP_DEFS: ReadonlyArray<{ type: PickupKind; label: string; key: string; frame?: number }> = [
  { type: 'key', label: 'Chave', key: ASSET_KEYS.keyItem, frame: KEY_FRAMES.pickup },
  { type: 'axe', label: 'Machado', key: ASSET_KEYS.axeIcon },
  { type: 'pickaxe', label: 'Picareta', key: ASSET_KEYS.pickaxeIcon },
  { type: 'scythe', label: 'Foice', key: ASSET_KEYS.scytheIcon },
  { type: 'shovel', label: 'Pa — cava buraco de plantio na terra', key: ASSET_KEYS.shovelIcon },
  { type: 'wood', label: 'Graveto', key: ASSET_KEYS.woodIcon },
  { type: 'stone', label: 'Pedra', key: ASSET_KEYS.rock },
  { type: 'iron', label: 'Bloco de Ferro', key: ASSET_KEYS.ironItem },
  { type: 'bucket', label: 'Balde', key: 'bucket-icon' }, // arte gerada no boot (registerBucketTextures)
  // Os seis fungos (arte gerada no boot, registerFungiTextures): nascem no chao, a faca solta.
  { type: 'puffball', label: 'Bufa-de-lobo (Lycoperdon perlatum)', key: fungusTextureKey('puffball') },
  { type: 'inkCap', label: 'Coprino-cabeludo (Coprinus comatus)', key: fungusTextureKey('inkCap') },
  { type: 'morel', label: 'Morel (Morchella esculenta)', key: fungusTextureKey('morel') },
  { type: 'chanterelle', label: 'Cantarelo (Cantharellus cibarius)', key: fungusTextureKey('chanterelle') },
  { type: 'flyAgaric', label: 'Mata-moscas (Amanita muscaria)', key: fungusTextureKey('flyAgaric') },
  { type: 'porcini', label: 'Porcini (Boletus edulis)', key: fungusTextureKey('porcini') },
];
export const PROP_DEFS: ReadonlyArray<{ type: PropKind; label: string; key: string; frame?: number }> = [
  { type: 'campfire', label: 'Fogueira', key: ASSET_KEYS.campfireFrame1 },
  { type: 'dryBush', label: 'Mato Seco', key: ASSET_KEYS.dryBush },
  { type: 'lockedDoor', label: 'Porta', key: ASSET_KEYS.lookedDoorObject },
  { type: 'swingGate', label: 'Portao de Bater', key: ASSET_KEYS.swingGateObject },
  { type: 'dryTree', label: 'Arvore Seca', key: ASSET_KEYS.dryTree, frame: 0 },
  { type: 'dryShrub', label: 'Arbusto Seco', key: ASSET_KEYS.dryShrub },
  { type: 'rock', label: 'Pedra', key: ASSET_KEYS.rock },
  { type: 'ironRock', label: 'Pedra de Ferro', key: ASSET_KEYS.ironRock, frame: 0 },
  { type: 'coalRock', label: 'Pedra de Carvão', key: ASSET_KEYS.coalRock, frame: 0 },
  { type: 'tallGrass', label: 'Mato Alto', key: ASSET_KEYS.tallGrassUp, frame: 0 },
  { type: 'water', label: 'Rio (agua)', key: ASSET_KEYS.water },
  { type: 'lava', label: 'Lava (a pedra afunda e vira chao)', key: ASSET_KEYS.lavaFloor },
  { type: 'bridgeSpot', label: 'Ponto de Ponte', key: ASSET_KEYS.bridge },
  // A paleta mostra a flor ABERTA: e a pose que diz o que a peca faz (uma ponte de petalas), e o
  // botao fechado, sozinho num icone, so diria "tem uma planta aqui".
  { type: 'moonflower', label: 'Flor da Lua', key: ASSET_KEYS.moonflower, frame: MOONFLOWER_FRAMES.lying[3] },
  { type: 'plantSpot', label: 'Buraco de Plantio', key: ASSET_KEYS.plantHole, frame: 0 },
  { type: 'toolbox', label: 'Caixa de Ferramentas (G gira)', key: ASSET_KEYS.toolbox, frame: TOOLBOX_FRAMES.closed },
  { type: 'furnace', label: 'Forno manual (G gira) — abra o catalogo para fundir', key: ASSET_KEYS.furnace, frame: 1 },
  // O ALTAR nao gira e nao tem energia: e um movel. Z poe o item selecionado na laje, e bater
  // nele (Z de espada, ou o X com o que estiver na mao) malha a ESPONJA em ferro.
  { type: 'altar', label: 'Altar — laje onde se POE uma peca e se MALHA (Z poe, bater transforma)', key: ASSET_KEYS.altar, frame: 0 },
  // O FIM DO JOGO: a fogueira que so o heroi acende, e o portao que so abre quando o ultimo
  // pedido dos vizinhos fecha. Um de cada, no centro do vale.
  { type: 'hearth', label: 'Fogueira do Fim — o heroi acende e assa o cogumelo', key: ASSET_KEYS.campfireFrame1 },
  { type: 'gardenGate', label: 'Portao do Jardim — abre quando todos os pedidos fecham', key: ASSET_KEYS.lookedDoorObject },
  // O BOSQUE (objects/BigTrees): bloqueiam pelo proprio prop; o tronco caido deita em dois tiles (o posto e o da direita).
  { type: 'oakTree', label: 'Carvalho velho (bosque)', key: bosqueIconKey('oak') },
  { type: 'birchTree', label: 'Betula (bosque)', key: bosqueIconKey('birch') },
  { type: 'youngOak', label: 'Carvalhinho (bosque)', key: bosqueIconKey('sapling') },
  { type: 'fallenLog', label: 'Tronco caido (bosque) — ocupa este tile e o da direita', key: bosqueIconKey('log') },
  // Liga sozinha nos vizinhos; a ponta (um vizinho so) vira pilar de portao.
  { type: 'woodFence', label: 'Cerca de madeira — liga nos vizinhos; a ponta vira pilar de portao', key: fenceIconKey },
  // O quintal do lenhador (objects/LumberYard).
  { type: 'woodpile', label: 'Pilha de lenha', key: yardIconKey('woodpile') },
  { type: 'sawhorse', label: 'Cavalete com serra', key: yardIconKey('sawhorse') },
  { type: 'stump', label: 'Toco', key: yardIconKey('stump') },
  { type: 'axeStump', label: 'Toco com machado cravado', key: yardIconKey('axeStump') },
  { type: 'wheelbarrow', label: 'Carrinho de mao com lenha', key: yardIconKey('wheelbarrow') },
  { type: 'yardSign', label: 'Placa do lenhador', key: yardIconKey('yardSign') },
  // A forja velha (objects/OldForge): perto de um forno, ele ganha o piso de lajes da oficina.
  { type: 'forgeRubble', label: 'Chamine caida (forja velha)', key: forgeIconKey('forgeRubble') },
  { type: 'forgeRack', label: 'Suporte de ferramentas velhas (forja velha)', key: forgeIconKey('forgeRack') },
  // A cratera da nave da Thea (objects/CrashSite).
  { type: 'crashCrater', label: 'Cratera da nave (o buraco; o centro e solido)', key: crashIconKey('crashCrater') },
  { type: 'shipHull', label: 'Chapa do casco da nave', key: crashIconKey('shipHull') },
  { type: 'shipThruster', label: 'Propulsor da nave (solta fumaca)', key: crashIconKey('shipThruster') },
  { type: 'shipFin', label: 'Aleta da nave', key: crashIconKey('shipFin') },
];
// The tiles palette used to be an anonymous grid of "Tile 23" cells, so a whole cemetery sitting
// in the bottom rows of forest_tile_set.png was invisible to whoever was building the map. Tiles
// are grouped and named here instead. Any frame missing from this table still shows up, under
// "Outros" — the palette enumerates the tileset, so a new row of art is never hidden by omission.
//
// `layer` is the layer the tile is DRAWN for, and picking it switches the active layer. That is
// not a convenience: the ground mesh ignores alpha (MeshLambertMaterial, no alphaTest), so a tile
// with transparent pixels — the bones, the skull — painted onto the ground reads as a black
// square, while an opaque floor tile on the upper layer hides the ground it should be part of.
type TileDef = { frame: number; label: string; layer: TileLayerId };
const TILE_GROUPS: ReadonlyArray<{
  title: string;
  tiles: readonly TileDef[];
  /** Grupo do ANDAR DE BAIXO: no subterrâneo a paleta mostra só estes (ver renderPalette). */
  dungeon?: boolean;
}> = [
  {
    title: 'Chao',
    tiles: [
      { frame: 5, label: 'Terra', layer: 'ground' },
      { frame: 6, label: 'Terra 2', layer: 'ground' },
      // O mar bloqueia por si so (SOLID_GROUND_FRAMES), sem colisao pintada — e a fronteira
      // do mundo, e nenhum item do jogo abre agua. Fica no chao porque E chao, nao um prop.
      { frame: SEA_TILE_FRAME, label: 'Mar', layer: 'ground' },
    ],
  },
  {
    title: 'Floresta',
    tiles: [
      { frame: 4, label: 'Pinheiro', layer: 'upper' },
      { frame: 14, label: 'Pinheiro 2', layer: 'upper' },
      { frame: 15, label: 'Pinheiro com Frutos', layer: 'upper' },
      { frame: 16, label: 'Pinheiro com Flores', layer: 'upper' },
      { frame: 17, label: 'Pinheiro 3', layer: 'upper' },
      { frame: 18, label: 'Pinheiro 4', layer: 'upper' },
      { frame: 3, label: 'Arvore Seca', layer: 'upper' },
      { frame: 21, label: 'Arvore Seca 2', layer: 'upper' },
      { frame: 1, label: 'Arbusto Florido', layer: 'upper' },
      { frame: 12, label: 'Pedregulho', layer: 'upper' },
      { frame: 13, label: 'Pedras', layer: 'upper' },
      { frame: 10, label: 'Cogumelos Vermelhos', layer: 'upper' },
      { frame: 11, label: 'Cogumelos Roxos', layer: 'upper' },
      { frame: 0, label: 'Folhagem', layer: 'upper' },
      { frame: 7, label: 'Folhagem 2', layer: 'upper' },
      { frame: 8, label: 'Folhagem 3', layer: 'upper' },
      { frame: 19, label: 'Folhagem 4', layer: 'upper' },
      { frame: 20, label: 'Folhagem 5', layer: 'upper' },
      { frame: 9, label: 'Gravetos', layer: 'upper' },
      { frame: 2, label: 'Graveto Solto', layer: 'upper' },
    ],
  },
  {
    // A FLORA DOS BIOMAS (spritefactory/sprites/biome-decor.mjs, world/biomes.ts). O bioma já veste a
    // decoração genérica com elas sozinho; aqui é para pôr uma de propósito. Sem este grupo os frames
    // cairiam em "Outros", sem camada, e pintar com o "Chão" ligado poria a planta no lugar do piso.
    title: 'Flora dos Biomas',
    tiles: [
      { frame: 63, label: 'Samambaia', layer: 'upper' },
      { frame: 64, label: 'Musgo Florido', layer: 'upper' },
      { frame: 65, label: 'Trigo', layer: 'upper' },
      { frame: 66, label: 'Margaridas', layer: 'upper' },
      { frame: 67, label: 'Papoulas', layer: 'upper' },
      { frame: 68, label: 'Campânulas', layer: 'upper' },
      { frame: 69, label: 'Cristais', layer: 'upper' },
      { frame: 70, label: 'Brasas', layer: 'upper' },
      { frame: 71, label: 'Folhas e Pinha', layer: 'upper' },
      { frame: 72, label: 'Trevos', layer: 'upper' },
    ],
  },
  {
    // A MATA ANTIGA DO JARDIM ALTO (spritefactory/sprites/ancient-grove.mjs). As árvores bloqueiam sozinhas
    // (SOLID_UPPER_FRAMES), como o pinheiro.
    title: 'Mata Antiga',
    tiles: [
      { frame: 73, label: 'Árvore Anciã', layer: 'upper' },
      { frame: 74, label: 'Árvore Anciã (torta)', layer: 'upper' },
      { frame: 75, label: 'Moita Velha', layer: 'upper' },
      { frame: 76, label: 'Capim Antigo', layer: 'upper' },
    ],
  },
  {
    // A montanha (CLIFF_WALL_FRAMES). E a MESMA pintura do "Chao de Pedra" do cemiterio, so que
    // em pe: no chao ela e patio, na camada de cima ela e montanha — e o World3D a assa em CUBO,
    // com topo de planalto e lateral sombreada. Bloqueia sozinha (SOLID_UPPER_FRAMES), como o
    // pinheiro. Nao precisa alternar as duas: o volume do cubo ja quebra a repeticao.
    title: 'Montanha',
    tiles: [
      { frame: 39, label: 'Rocha', layer: 'upper' },
      { frame: 40, label: 'Rocha com Musgo', layer: 'upper' },
    ],
  },
  {
    // A ALVENARIA DE DUNGEON (DUNGEON_TILES). Ela existia no atlas desde sempre e NAO estava aqui:
    // os dez frames caiam em "Outros", sem nome e — o que doi — sem CAMADA. Sem `TileDef` o clique
    // nao troca a camada ativa, entao pintar um muro com o "Chao" ligado punha a parede no piso, e
    // pintar um piso com "Superior" ligado tapava o chao. Sao exatamente as duas falhas que o
    // comentario do topo desta tabela descreve, e o subterraneo ficou editavel a um clique
    // (a chave Overworld/Underworld do painel) sem que houvesse onde desenhar as paredes dele.
    //
    // A divisao é a mesma da montanha e pelo mesmo motivo: PISO e chao, MURO fica em pe. O muro
    // bloqueia sozinho (DUNGEON_WALL_FRAMES esta em SOLID_UPPER_FRAMES, e o editor mostra essa
    // colisao implicita em ambar), e o World3D o assa em CUBO com o topo PRETO PURO — o escuro
    // entre uma sala e a outra. Nada disso precisa de colisao pintada.
    title: 'Dungeon',
    dungeon: true,
    tiles: [
      { frame: 42, label: 'Piso', layer: 'ground' },
      { frame: 43, label: 'Piso 2', layer: 'ground' },
      { frame: 44, label: 'Piso 3', layer: 'ground' },
      { frame: 51, label: 'Piso Rachado', layer: 'ground' },
      { frame: 45, label: 'Muro', layer: 'upper' },
      { frame: 46, label: 'Muro 2', layer: 'upper' },
      { frame: 47, label: 'Muro 3', layer: 'upper' },
      { frame: 49, label: 'Muro com Musgo', layer: 'upper' },
      { frame: 48, label: 'Muro com Tocha', layer: 'upper' },
      // A pista da parede bombardeavel — a legenda que o Zelda 1 nunca deu. Fica por ultimo
      // porque ela nao e decoracao: ela PROMETE uma passagem.
      { frame: 50, label: 'Muro Rachado', layer: 'upper' },
    ],
  },
  {
    // The cemetery. Ground first, then the things that stand on it, then the litter.
    title: 'Cemiterio',
    tiles: [
      { frame: 23, label: 'Chao de Pedra', layer: 'ground' },
      { frame: 24, label: 'Chao de Pedra com Musgo', layer: 'ground' },
      { frame: 29, label: 'Laje Rachada', layer: 'ground' },
      { frame: 30, label: 'Laje Rachada 2', layer: 'ground' },
      { frame: 32, label: 'Laje com Musgo', layer: 'ground' },
      { frame: 31, label: 'Cova Aberta', layer: 'ground' },
      { frame: 25, label: 'Tumulo', layer: 'upper' },
      { frame: 22, label: 'Cabeca na Estaca', layer: 'upper' },
      { frame: 27, label: 'Caveira e Ossos', layer: 'upper' },
      { frame: 28, label: 'Ossos', layer: 'upper' },
    ],
  },
];
const TILE_DEFS: ReadonlyMap<number, TileDef> = new Map(
  TILE_GROUPS.flatMap((group) => group.tiles).map((tile) => [tile.frame, tile]),
);

/** O que EditorPanels usa de EditorDomUi. */
export type EditorPanelsHost = Pick<EditorDomUi,
  'button' | 'changed' | 'icon' | 'navChunk' | 'optionsEl' | 'paletteEl' | 'scene' | 'sectionLabel' | 'state'
  | 'store'
>;

export class EditorPanels {
  public constructor(private readonly host: EditorPanelsHost) {}

  private renderViewControls(): void {
    this.host.optionsEl.appendChild(this.host.sectionLabel('Visao'));
    const seg = document.createElement('div');
    seg.className = 'zh-seg';
    const modes: Array<{ id: ViewMode; label: string; hint: string }> = [
      { id: 'world', label: 'Mundo', hint: 'Mundo inteiro com pan e zoom livres (M alterna)' },
      { id: 'chunk', label: 'Chunk', hint: 'Foca e edita um chunk por vez (M alterna, setas navegam)' },
    ];
    modes.forEach((mode) => {
      const btn = this.host.button(mode.label, mode.hint, () => {
        this.host.state.viewMode = mode.id;
        this.host.changed();
      });
      btn.classList.toggle('active', this.host.state.viewMode === mode.id);
      seg.appendChild(btn);
    });
    this.host.optionsEl.appendChild(seg);

    if (this.host.state.viewMode === 'chunk') {
      const nav = document.createElement('div');
      nav.className = 'zh-seg';
      nav.style.marginTop = '4px';
      const label = document.createElement('span');
      label.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;font-size:11px;color:#a9c6cc;white-space:nowrap;';
      label.textContent = `Chunk (${this.host.state.chunkX}, ${this.host.state.chunkY})`;
      const arrow = (html: string, hint: string, dx: number, dy: number): HTMLButtonElement => {
        const btn = this.host.button(html, hint, () => this.host.navChunk(dx, dy));
        btn.style.flex = '0 0 40px';
        return btn;
      };
      nav.append(
        arrow('&#9664;', 'Chunk a esquerda (seta)', -1, 0),
        arrow('&#9650;', 'Chunk acima (seta)', 0, -1),
        arrow('&#9660;', 'Chunk abaixo (seta)', 0, 1),
        arrow('&#9654;', 'Chunk a direita (seta)', 1, 0),
        label,
      );
      this.host.optionsEl.appendChild(nav);
    }
  }

  public renderOptions(): void {
    this.host.optionsEl.innerHTML = '';
    this.renderViewControls();
    this.host.optionsEl.appendChild(this.host.sectionLabel('Opcoes'));

    const isTileTool = this.host.state.tool === 'brush' || this.host.state.tool === 'rect' || this.host.state.tool === 'fill' || this.host.state.tool === 'picker';
    if (isTileTool) {
      const layerSeg = document.createElement('div');
      layerSeg.className = 'zh-seg';
      (['ground', 'upper'] as const).forEach((layer) => {
        const btn = this.host.button(layer === 'ground' ? 'Chao' : 'Superior', 'Camada ativa (Tab alterna)', () => {
          this.host.state.layer = layer;
          this.host.changed();
        });
        btn.classList.toggle('active', this.host.state.layer === layer);
        layerSeg.appendChild(btn);
      });
      this.host.optionsEl.appendChild(layerSeg);

      const collSeg = document.createElement('div');
      collSeg.className = 'zh-seg';
      collSeg.style.marginTop = '4px';
      const modes: Array<{ id: CollisionPaintMode; label: string; hint: string }> = [
        { id: 'keep', label: 'Colisao: manter', hint: 'Pintar tiles nao mexe na colisao' },
        { id: 'set', label: 'marcar', hint: 'Cada tile pintado vira colisao' },
        { id: 'clear', label: 'limpar', hint: 'Cada tile pintado remove colisao' },
      ];
      modes.forEach((mode) => {
        const btn = this.host.button(mode.label, mode.hint, () => {
          this.host.state.collisionMode = mode.id;
          this.host.changed();
        });
        btn.classList.toggle('active', this.host.state.collisionMode === mode.id);
        collSeg.appendChild(btn);
      });
      this.host.optionsEl.appendChild(collSeg);
    }

    if (this.host.state.tool === 'spawn') {
      const start = this.host.store.spawn;
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:10px;color:#66d9ef;margin:4px 0 6px;line-height:1.55;';
      hint.innerHTML = `<b>Ponto Inicial obrigatorio</b><br>Atual: (${start.worldX}, ${start.worldY}). Clique em um tile livre para mover. Existe exatamente um por level.`;
      this.host.optionsEl.appendChild(hint);
    }

    if (this.host.state.tool === 'relief') {
      const reliefSeg = document.createElement('div');
      reliefSeg.className = 'zh-seg';
      const modes: Array<{ id: ReliefPaintMode; label: string; hint: string }> = [
        { id: 'high', label: 'Planalto', hint: 'Bloco um nivel acima do chao' },
        { id: 'peak', label: 'Cume', hint: 'O segundo andar: dois niveis acima do chao, em cima do planalto' },
        { id: 'stair', label: 'Escada', hint: 'Encosta num planalto (ou num cume); clicar de novo gira' },
      ];
      modes.forEach((mode) => {
        const btn = this.host.button(mode.label, mode.hint, () => {
          this.host.state.reliefMode = mode.id;
          this.host.changed();
        });
        btn.classList.toggle('active', this.host.state.reliefMode === mode.id);
        reliefSeg.appendChild(btn);
      });
      this.host.optionsEl.appendChild(reliefSeg);
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:10px;color:#d9a55a;margin:4px 0 6px;line-height:1.55;';
      hint.textContent = this.host.state.reliefMode === 'high'
        ? 'Pinte o planalto; a borda escura e o paredao. So se sobe por escada. Botao direito volta ao chao.'
        : this.host.state.reliefMode === 'peak'
          ? 'Pinte o cume, o segundo andar, cercado de planalto. Do planalto ao cume, so por escada. Botao direito volta ao chao.'
          : 'Clique num tile de chao encostado no planalto (ou de planalto encostado no cume): a seta aponta para onde a escada sobe. Clique de novo para girar.';
      this.host.optionsEl.appendChild(hint);
    }

    if (this.host.state.tool === 'brush' || this.host.state.tool === 'eraser' || this.host.state.tool === 'collision'
      || (this.host.state.tool === 'relief' && this.host.state.reliefMode !== 'stair')) {
      const brushSeg = document.createElement('div');
      brushSeg.className = 'zh-seg';
      brushSeg.style.marginTop = '4px';
      ([1, 2, 3] as const).forEach((size) => {
        const btn = this.host.button(`${size}x${size}`, 'Tamanho do pincel ( [ e ] )', () => {
          this.host.state.brushSize = size;
          this.host.changed();
        });
        btn.classList.toggle('active', this.host.state.brushSize === size);
        brushSeg.appendChild(btn);
      });
      this.host.optionsEl.appendChild(brushSeg);
    }

    const checks = document.createElement('div');
    checks.className = 'zh-checks';
    checks.style.marginTop = '6px';
    const toggles: Array<{ label: string; key: 'showGrid' | 'showCollisions' | 'showRelief' | 'showEntities' | 'showFixtures'; kbd: string }> = [
      { label: 'Grade', key: 'showGrid', kbd: 'G' },
      { label: 'Colisoes', key: 'showCollisions', kbd: 'V' },
      { label: 'Serras', key: 'showRelief', kbd: 'L' },
      { label: 'Entidades', key: 'showEntities', kbd: 'T' },
      { label: 'Pecas do jogo', key: 'showFixtures', kbd: 'O' },
    ];
    toggles.forEach((toggle) => {
      const label = document.createElement('label');
      label.title = `Atalho: ${toggle.kbd}`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = this.host.state[toggle.key];
      input.addEventListener('change', () => {
        this.host.state[toggle.key] = input.checked;
        this.host.changed();
      });
      label.append(input, document.createTextNode(toggle.label));
      checks.appendChild(label);
    });
    this.host.optionsEl.appendChild(checks);
  }

  public renderPalette(): void {
    this.host.paletteEl.innerHTML = '';
    const tab = this.host.state.tab;

    if (tab === 'tiles') {
      const texture = this.host.scene.textures.get(ASSET_KEYS.forestTileset);
      const frameCount = Math.max(1, texture.frameTotal - 1);
      this.host.paletteEl.appendChild(this.tileCell(null));

      const shown = new Set<number>();
      for (const group of TILE_GROUPS) {
        if (group.dungeon === true) continue; // a alvenaria de dungeon nao tem mais onde existir
        const tiles = group.tiles.filter((tile) => tile.frame < frameCount);
        if (tiles.length === 0) continue;
        this.host.paletteEl.appendChild(this.groupHeader(group.title));
        for (const tile of tiles) {
          shown.add(tile.frame);
          this.host.paletteEl.appendChild(this.tileCell(tile.frame));
        }
      }

      // Whatever the table doesn't name — a blank frame, or a row of art added after this was
      // written. The tileset is the source of truth; this list only orders and names it.
      // …e nada disso no subterrâneo: "Outros" é o resto do atlas (mar, estágios de corte, frames
      // vazios), que é exatamente o que a filtragem acima existe para tirar da frente lá embaixo.
      const rest: number[] = [];
      for (let frame = 0; frame < frameCount; frame += 1) if (!shown.has(frame)) rest.push(frame);
      if (rest.length > 0) {
        this.host.paletteEl.appendChild(this.groupHeader('Outros'));
        for (const frame of rest) this.host.paletteEl.appendChild(this.tileCell(frame));
      }
      return;
    }

    const addEntityCell = (sel: EntitySelection, label: string, key: string, frame?: number): void => {
      const cell = document.createElement('button');
      cell.className = 'zh-cell';
      cell.title = label;
      const selected = this.host.state.tool === 'entity'
        && this.host.state.entity.list === sel.list && this.host.state.entity.type === sel.type;
      cell.classList.toggle('selected', selected);
      const img = document.createElement('img');
      img.src = this.host.icon(key, frame);
      img.alt = label;
      const dot = document.createElement('span');
      dot.className = 'zh-dot';
      dot.style.background = ENTITY_DOT_COLOR[sel.list];
      cell.append(img, dot);
      cell.addEventListener('click', () => {
        this.host.state.entity = sel;
        this.host.state.tool = 'entity';
        this.host.changed();
      });
      this.host.paletteEl.appendChild(cell);
    };

    if (tab === 'npcs') {
      NPC_KINDS.forEach((kind) => {
        const visual = NPC_VISUALS[kind];
        addEntityCell({ list: 'npcs', type: kind }, NPC_LABELS[kind], visual.key, visual.frame);
      });
    } else if (tab === 'pickups') {
      PICKUP_DEFS.forEach((def) => addEntityCell({ list: 'pickups', type: def.type }, def.label, def.key, def.frame));
    } else {
      PROP_DEFS.forEach((def) => addEntityCell({ list: 'props', type: def.type }, def.label, def.key, def.frame));
    }
  }

  private groupHeader(title: string): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'zh-group';
    header.textContent = title;
    return header;
  }

  private tileCell(frame: number | null): HTMLButtonElement {
    const cell = document.createElement('button');
    cell.className = 'zh-cell';
    cell.title = frame === null ? 'Limpar (camada superior)' : this.tileTooltip(frame);
    cell.classList.toggle('selected', this.host.state.tile === frame);
    if (frame === null) {
      const x = document.createElement('span');
      x.className = 'zh-x';
      x.textContent = 'X';
      cell.appendChild(x);
    } else {
      const img = document.createElement('img');
      img.src = this.host.icon(ASSET_KEYS.forestTileset, frame);
      img.alt = `tile ${frame}`;
      cell.appendChild(img);
    }
    cell.addEventListener('click', () => {
      this.host.state.tile = frame;
      if (this.host.state.tool !== 'brush' && this.host.state.tool !== 'rect' && this.host.state.tool !== 'fill') this.host.state.tool = 'brush';
      // Named tiles carry the layer they were drawn for — see TileDef. Painting the tomb onto the
      // ground, or the bones onto a layer that ignores their alpha, is never what was meant.
      const def = frame === null ? undefined : TILE_DEFS.get(frame);
      if (def) this.host.state.layer = def.layer;
      this.host.changed();
    });
    return cell;
  }

  private tileTooltip(frame: number): string {
    const def = TILE_DEFS.get(frame);
    if (!def) return `Tile ${frame}`;
    const layer = def.layer === 'ground' ? 'chao' : 'superior';
    const solid = SOLID_UPPER_FRAMES.has(frame) || SOLID_GROUND_FRAMES.has(frame) ? ', bloqueia' : '';
    return `${def.label} — tile ${frame} (camada ${layer}${solid})`;
  }
}
