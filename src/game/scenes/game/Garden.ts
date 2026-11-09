// O CANTEIRO: a pá cava (só onde não prende ninguém), o balde rega, o capim brota, o buraco reabre quando o capim se
// vai, e os buracos cavados voltam do save.

import { CHUNK_COLUMNS, CHUNK_ROWS, DIGGABLE_GROUND_FRAMES, SOLID_UPPER_FRAMES } from '@/game/constants';
import { TallGrassObject } from '@/game/objects/TallGrassObject';
import { PlantSpotObject } from '@/game/objects/PlantSpotObject';
import { canStep } from '@/game/world/relief';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getChunkTerrain, getWorldBounds, getNpcTiles } from '@/game/world/WorldData';
import { adventureState } from '@/game/runtime/adventureState';
import type * as Engine from '@/game/engine';
import type { GameScene } from '../GameScene';

// O canteiro (ver waterPlantSpot): quanto o capim plantado leva para brotar depois de regado, e quanto o buraco leva
// para reabrir depois que o capim dele se foi.
const PLANT_GROW_MS = 3500;
const PLANT_REOPEN_MS = 2600;

/** O que Garden usa de GameScene (e a cena do motor, que ele passa a quem monta objetos do mundo). */
export type GardenHost = Engine.Scene & Pick<GameScene,
  'adventure' | 'chunkManager' | 'debris' | 'delivery' | 'npcManager' | 'playerWorld' | 'props' | 'query'
  | 'questSetup' | 'save' | 'sparkle' | 'time' | 'world3d'
>;

export class Garden {
  public constructor(private readonly host: GardenHost) {}

  /**
   * A superfície sob um buraco CAVADO também não volta: a pá limpou a grama baixa (decor da
   * camada upper) na cavada, e o world.json volta limpo do disco — sem este diff, a folhagem
   * renasceria POR BAIXO do buraco salvo. Roda ANTES do
   * World3D assar. Só decor NÃO-sólido sai (um gerador futuro pondo árvore ali não é derrubado
   * por um buraco); a ossada fica de fora porque ela é memória de SESSÃO (CorpseDecals), nunca
   * do save.
   */
  public applyDugSpotDiff(): void {
    const bounds = getWorldBounds();
    for (const key of adventureState().dugSpots) {
      const [wx, wy] = key.split(',').map(Number);
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
      const cx = Math.floor(wx / CHUNK_COLUMNS);
      const cy = Math.floor(wy / CHUNK_ROWS);
      if (cx < bounds.minCx || cx > bounds.maxCx || cy < bounds.minCy || cy > bounds.maxCy) continue;
      const terrain = getChunkTerrain(cx, cy);
      const lx = ((wx % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
      const ly = ((wy % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
      const upper = terrain.upper[ly][lx];
      if (upper !== null && !SOLID_UPPER_FRAMES.has(upper) && !terrain.collisions[ly][lx]) {
        terrain.upper[ly][lx] = null;
      }
    }
  }

  // The thrown water LANDED on a planted mound: the earth darkens, drinks, and germination
  // starts. (The bucket already emptied at the throw — see throwBucketWater.)
  public waterPlantSpot(spot: PlantSpotObject, wx: number, wy: number): void {
    if (this.host.questSetup.painterQuest?.waterAt(spot)) {
      getSoundManager().nature.playSplash();
      this.host.debris.spawnSmokePuff(wx, wy);
      return;
    }
    if (!spot.water(PLANT_GROW_MS, () => this.growPlantedGrass(spot))) return;
    getSoundManager().nature.playSplash();
    this.host.debris.spawnSmokePuff(wx, wy); // the mist of the pour settling over the wet earth
  }

  /** The watered mound germinated: sprout the real grass (waiting for the tile to be clear). */
  private growPlantedGrass(spot: PlantSpotObject): void {
    if (!spot.isWatered) return; // scene reset re-guard
    if (!this.host.query.isTileClearForRegrow(spot.worldX, spot.worldY)) {
      this.host.time.delayedCall(400, () => this.growPlantedGrass(spot));
      return;
    }
    const grass = new TallGrassObject(this.host, spot.worldX, spot.worldY);
    grass.sproutIn();
    this.host.props.tallGrasses.push(grass);
    spot.setGrown(grass);
    getSoundManager().work.playGrassCut(); // the blades pushing out — the same dry rustle
    this.host.delivery.questEvent({ type: 'grow' });
    this.host.sparkle.spawnGrowSparkle(spot.worldX, spot.worldY);
  }

  /**
   * A PÁ pode cavar aqui? A fechadura dela é o CHÃO NU DE TERRA (DIGGABLE_GROUND_FRAMES — o
   * pátio de pedra, a laje, a alvenaria de dungeon e o mar recusam a lâmina), e "nu" é a
   * pergunta LARGA duas vezes: nada ocupando o tile (isTileOccupied: parede, bicho, item,
   * coração, bomba, o próprio herói) e nenhum prop NEM NÃO-BLOQUEANTE em cima — um toco de
   * mato, uma marca de bomba, um cabo, uma placa ou um canteiro já cavado são todos "este
   * chão já tem dono". Congelado também recusa: gelo primeiro, terra depois.
   */
  public canDigAt(wx: number, wy: number): boolean {
    const chunkX = Math.floor(wx / CHUNK_COLUMNS);
    const chunkY = Math.floor(wy / CHUNK_ROWS);
    if (this.host.chunkManager?.hasChunkCoordinate(chunkX, chunkY) !== true) return false;
    if (!DIGGABLE_GROUND_FRAMES.has(this.host.chunkManager.getTile(wx, wy).ground)) return false;
    if (this.host.query.isTileOccupied(wx, wy)) return false;
    for (const entry of this.host.props.propRegistry) {
      if (this.host.query.propAt(entry.list, wx, wy)) return false;
    }
    // NINGUÉM FICA CERCADO: o canteiro semeado é sólido, e quatro em volta de um vizinho (ou dois, com a mesa e a
    // fogueira dele) o trancavam para sempre — a Sisi não recebia mais ninguém e a quest dela travava. Ao lado de
    // um NPC, onde ele está ou onde ele mora, a pá não cava.
    const nextTo = (x: number, y: number): boolean => Math.abs(x - wx) + Math.abs(y - wy) === 1;
    if (this.host.npcManager?.getActiveWorldPositions().some((n) => nextTo(n.worldX, n.worldY))) return false;
    if (getNpcTiles().some((n) => nextTo(n.worldX, n.worldY))) return false;
    return !this.digWouldTrap(wx, wy);
  }

  /**
   * O BURACO QUE TRANCA: cada buraco vira um monte sólido quando semeado, e não há como desfazer. Se este buraco,
   * somado aos que já estão abertos, deixasse o herói num cercadinho (a casa, o vizinho e os montes em volta), a
   * pá não cava. A conta é uma inundação curta a partir do herói: se ela não sai para o mundo, é cerca.
   */
  private digWouldTrap(wx: number, wy: number): boolean {
    const blocked = new Set<string>([`${wx},${wy}`]);
    for (const spot of this.host.props.plantSpots) if (spot.isHole) blocked.add(`${spot.worldX},${spot.worldY}`);
    const start = { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY };
    const seen = new Set<string>([`${start.x},${start.y}`]);
    const queue = [start];
    const ENOUGH = 40;
    while (queue.length && seen.size < ENOUGH) {
      const c = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        const k = `${nx},${ny}`;
        if (seen.has(k) || blocked.has(k) || this.host.query.isSolidForEntities(nx, ny) || !canStep(c.x, c.y, nx, ny)) continue;
        seen.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    return seen.size < ENOUGH;
  }

  /**
   * O impacto da pá: nasce um canteiro (plantSpot) DE VERDADE — o mesmo objeto dos autorados,
   * então semente, balde, mato e reabertura já o conhecem sem uma linha nova. O push é in
   * place de propósito (o propRegistry referencia este array; ver o comentário dele). Na
   * aventura de overworld o buraco é ESTRUTURA do jogador e entra no save como diff — dungeon não tem terra, e level/explorador zeram por desenho.
   */
  public digPlantHole(wx: number, wy: number): void {
    if (!this.canDigAt(wx, wy)) return; // o mundo teve 150ms para mudar — reconfere no impacto
    getSoundManager().work.playGrassCut(); // terra revirada — o mesmo farfalhar seco do plantio
    // SÓ O BURACO FICA NO TILE: cavar revolve a superfície inteira. A grama baixa assada no
    // terreno (decor da camada upper — não-sólido por construção: um frame sólido teria barrado
    // o canDigAt) e a ossada/mancha de quem morreu ali SOMEM sob a terra virada. Sem isto o
    // recorte do buraco desenha por cima de folhagem e osso — três pinturas no mesmo chão.
    const chunks = this.host.chunkManager;
    if (chunks) {
      const chunk = chunks.getChunk(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS));
      const lx = ((wx % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
      const ly = ((wy % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
      if (chunk.upper[ly][lx] !== null) {
        chunk.upper[ly][lx] = null;
        this.host.world3d?.terrain.removeDecorTile(wx, wy);
      }
    }
    const spot = new PlantSpotObject(this.host, wx, wy, { dug: true });
    this.host.props.plantSpots.push(spot);
    // A CAVADA AOS POUCOS: o canteiro aprofunda em quatro tempos (os frames do sheet — ver
    // PlantSpotObject.animateDigIn), e cada tempo tem o seu peso aqui fora. A poeira seca sobe
    // no impacto; os torrões voam em três levas que MINGUAM (a primeira pazada tira o grosso);
    // e a última batida — a que chuta os torrões desenhados pra fora do aro — assenta com o
    // baque surdo e um tremorzinho na direção da pazada. Tudo no compasso de DIG_STAGE_MS:
    // uma fonte só, ou o som e a terra dessincronizam do desenho na primeira mexida no número.
    this.host.debris.spawnSmokePuff(wx, wy);
    this.host.debris.spawnDirtBurst(wx, wy, 7);
    const beat = PlantSpotObject.DIG_STAGE_MS;
    this.host.time.delayedCall(beat, () => this.host.debris.spawnDirtBurst(wx, wy, 5));
    this.host.time.delayedCall(beat * 2, () => this.host.debris.spawnDirtBurst(wx, wy, 4));
    this.host.time.delayedCall(beat * 3, () => {
      this.host.debris.spawnDirtBurst(wx, wy, 3);
      getSoundManager().work.playFootstep(); // o assentar da terra — o mesmo baque de pousar algo
      const dx = Math.sign(wx - this.host.playerWorld.worldX);
      const dy = Math.sign(wy - this.host.playerWorld.worldY);
      this.host.world3d?.cam.shake(50, 0.007, dx, dy);
    });
    if (this.host.adventure) {
      adventureState().dugSpots.add(`${wx},${wy}`);
      this.host.save.persistAdventure();
    }
  }

  // Watch the plots each frame: raise the mound of a sown hole the moment the hero steps off
  // it (a dome must never be born blocking under someone's feet — the dropped-item arming
  // rule), and reopen the hole of a plot whose grown grass was consumed (cut/burnt).
  public updatePlantSpots(): void {
    for (const spot of this.host.props.plantSpots) {
      // The dome must never be born blocking on TOP of something. The original rule only
      // checked the hero ("um domo nunca nasce sob os pes") — but an item lying on the sown
      // tile (an arm's deposit, a swap) would be engulfed by the rising mound, unrecoverable behind
      // its collision. isTileClearForRegrow is the same gate the regrowing tree and the sprouting
      // grass already wait on: hero, item and crate all hold the mound down until the tile is
      // truly clear.
      if (spot.isSown && this.host.query.isTileClearForRegrow(spot.worldX, spot.worldY)) {
        spot.raiseMound();
        continue;
      }
      const grass = spot.grownGrass;
      if (!grass || grass.blocking || spot.reopenPending) continue;
      spot.reopenPending = true;
      this.host.time.delayedCall(PLANT_REOPEN_MS, () => {
        // Splice in place, never filter-and-reassign: o propRegistry referencia ESTES arrays.
        const idx = this.host.props.tallGrasses.indexOf(grass);
        if (idx >= 0) this.host.props.tallGrasses.splice(idx, 1);
        grass.destroy(); // the remains decay away and the dug hole shows again
        spot.reopen();
      });
    }
  }
}
