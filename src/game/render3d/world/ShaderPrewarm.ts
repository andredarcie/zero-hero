// O AQUECIMENTO DOS SHADERS: cada material que o jogo vai usar é desenhado uma vez, fora da tela, antes do primeiro
// quadro — para nenhum programa ser compilado no meio do jogo (a regra de shader deste projeto).

import * as THREE from 'three';
import { CLIFF_WALL_FRAMES, SEA_TILE_FRAME } from '@/game/constants';
import { Billboard3D, type Billboard3DOptions } from '../Billboard3D';
import { getWoodTexture } from '../woodTexture';
import { buildFlatTileGeometry, buildTileCubeGeometry, ROCK_CUBE_SHADE } from '../terrainGeometry';
import type { World3D } from '../World3D';
import { FX_DOT_TEXTURE } from './worldDefs';


/** O que ShaderPrewarm usa de World3D. */
export type ShaderPrewarmHost = Pick<World3D,
  'air' | 'camera' | 'groundLight' | 'mirror' | 'objects' | 'renderer' | 'scene' | 'screen' | 'shadows' | 'tiles'
>;

export class ShaderPrewarm {
  /** Invisible stand-ins that hold the runtime shaders' programs alive. See prewarmShaders. */
  private readonly warmups: Array<{ setVisible(v: boolean): unknown }> = [];

  public constructor(private readonly host: ShaderPrewarmHost) {}

  /**
   * Compile every shader up front, at the final light count. Call once per scene, after the
   * world's props exist and before the first frame — otherwise each material compiles lazily
   * on the frame it is first drawn, and the player wears it.
   */
  public prewarmShaders(): void {
    // renderer.compile() only knows about materials that are IN the scene right now. Everything
    // the game makes LATER — the first ember, the first puff, the first skeleton, the first drop —
    // is compiled and linked by the driver on the frame it is first drawn, and that costs 50–300ms
    // of frozen game. The profile caught two of them: a stall at +1s and another at +6s, each a
    // quarter of a second, each blamed on nothing in particular.
    //
    // So stand in for them. One throwaway billboard per option SHAPE the game creates at runtime
    // puts the program in the cache before the real object ever asks for it — only the shape
    // reaches the program's cache key, never the texture or the position. Note the fogless FX:
    // USE_FOG is baked into the program, so a fogless puff is a different shader from a foggy
    // pickup, however alike the two look on screen.
    //
    // This list is guarded rather than trusted: perf-profile fails if ANY program compiles during
    // play, so a new billboard shape that forgets to register here cannot stay forgotten.
    const runtimeVariants: Billboard3DOptions[] = [
      { emissive: true },                     // heart, dropped item, campfire flame
      { additive: true },                     // fire glow, embers
      { groundShadow: true },                 // a skeleton, an NPC: lit, with a contact blob
      { groundShadow: true, outline: true },  // o gato que chega, as visitas da fogueira: contornados (spriteOutline)
      { castGroundShadow: true },             // the hero
      { centered: true },                     // the item raised on ITEM GET
      { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 },
      { centered: true, fog: false, depthWrite: false, additive: true },
      { flat: true, fog: false, depthWrite: false, additive: true },   // the ring, the ground crack
      // Um quad deitado e aditivo, ainda LIDO pelo fog: o disco de calor da poca de fogo e os
      // aneis no chao. Fica no prewarm mesmo que hoje nasca tarde — um `alphaTest`/flag novo
      // vira outro programa, e compilar shader em runtime e o pior stall que este jogo tem.
      { flat: true, additive: true },
      // The moonflower's two bodies. They are LIT sprites with a lowered alphaTest, because they
      // CROSS-DISSOLVE into each other (see MoonflowerObject) and the lit default of 0.5 would pop
      // a fading sprite out of existence instead of fading it. `alphaTest` reaches the program's
      // cache key, so "the same billboard with a different cutoff" is a different shader — and the
      // lying one is born hidden, so compile() (which walks only VISIBLE objects) would never see
      // it and the first bloom of the run would pay for the link.
      { groundShadow: true, alphaTest: 0.02 },
      { flat: true, alphaTest: 0.02 },
      // A NATUREZA (objects/nature, a cachoeira, o lago das carpas, a chuva): quase tudo dela nasce TARDE — o anel
      // do sapo que pulou, a gota que pingou da folha, a neblina do amanhecer, a primeira poça — e cada formato novo
      // compilado na hora congelava o jogo ~0,8 s (a foto do peixe pulando saiu com "1 fps ▼819ms").
      { flat: true, depthWrite: false, alphaTest: 0.01 },               // poças, anéis na água, sombra da copa, espuma
      { flat: true, depthWrite: false, alphaTest: 0.01, fog: false },   // o anel do pingo de chuva
      { flat: true, depthWrite: false, alphaTest: 0.01, additive: true }, // as manchas de sol
      { flat: true, depthWrite: false, alphaTest: 0.5 },                // as folhas no chão
      { flat: true, depthWrite: false, alphaTest: 0.2 },                // as carpas
      { flat: true, depthWrite: false },                                // as vitórias-régias
      { centered: true, depthWrite: false, alphaTest: 0.01 },           // gotas, sementes, respingos
      { centered: true, depthWrite: false, alphaTest: 0.01, fog: false }, // a neblina, o borrifo da cachoeira
      { centered: true, additive: true, alphaTest: 0.01 },              // o arco-íris da cachoeira
      { centered: true, additive: true, alphaTest: 0.01, fog: false },  // o arco-íris depois da chuva
      { centered: true, depthWrite: false },                            // as libélulas
      { depthWrite: false },                                            // a queda e o pé da cachoeira
      { depthWrite: false, alphaTest: 0.01, fog: false, emissive: true }, // a coroinha do pingo de chuva
    ];
    for (const opts of runtimeVariants) {
      this.warmups.push(new Billboard3D(this.host.scene, FX_DOT_TEXTURE, 0, opts).setDisplaySize(0.001, 0.001));
    }

    // The bridge deck. Its boxes are born when you WALK to a river — the chunk streamer builds the
    // water, and a buildable spot immediately ghosts in its deck — so they are not here to be
    // compiled now. And a Lambert BOX wearing a texture, with neither vertex colours nor an alpha
    // test, is a program shape nothing else in this world has: the first river you approach used
    // to cost a frozen quarter of a second.
    this.warmups.push(this.host.objects.addBox(0.001, 0.001, 0.001, getWoodTexture('plankA', false)));

    // The terrain's two newest materials, which a STREAMING world can meet mid-run. Every other
    // terrain material is in the scene already (the first bake ran in the constructor), but the
    // sea's mesh only exists if the baked window HAS water and the mountain's only if it has rock —
    // and the explorer re-bakes a moving window, so a lake can enter the world on frame 4000 and
    // compile its program there: a 50-300ms freeze mid-expedition. (`explorador` asserts zero new
    // programs across a traversal, so this would also fail the suite, correctly.)
    const mats = this.host.tiles.terrainMats;
    if (mats) {
      const stand = [
        new THREE.Mesh(
          buildFlatTileGeometry(
            [{ x: 0, z: 0, frame: SEA_TILE_FRAME }], -80, undefined, () => [0, 0, 0, 0],
          ),
          mats.sea,
        ),
        new THREE.Mesh(
          buildTileCubeGeometry(
            [{ x: 0, z: 0, frame: CLIFF_WALL_FRAMES[0] }], () => false, ROCK_CUBE_SHADE,
          ),
          mats.rock,
        ),
      ];
      for (const mesh of stand) {
        mesh.position.set(0, -80, 0); // out of the world, and hidden right after the compile
        this.host.scene.add(mesh);
        this.warmups.push({ setVisible: (v: boolean) => { mesh.visible = v; } });
      }
    }

    // Compile against the COMPOSER'S render target, not against the canvas.
    //
    // This is the whole ball game. The world is never drawn to the canvas: EffectComposer draws it
    // into an offscreen target and the post chain resolves that to the screen. And three bakes the
    // target's colour space into the program's cache key — linear for an offscreen target, sRGB for
    // the canvas. So a prewarm that leaves the canvas bound compiles a complete set of programs the
    // game will never ask for, and the game then compiles its REAL set lazily, one 50–300ms freeze
    // at a time, on the frame each material is first drawn. It looked like the prewarm was running
    // (it was) and doing nothing (it was), which is the worst kind of bug to read.
    const prevTarget = this.host.renderer.getRenderTarget();
    this.host.renderer.setRenderTarget(this.host.screen.composer.renderTarget1);
    this.host.renderer.compile(this.host.scene, this.host.camera);
    // O mapa de luz do chão é um shader próprio, fora da cena: desenhá-lo aqui o compila (e o
    // ANGLE termina o executável) no carregamento, não no primeiro quadro de jogo (845ms).
    this.host.groundLight.update(this.host.renderer, this.host.camera);
    this.host.renderer.setRenderTarget(this.host.screen.composer.renderTarget1);
    this.drawEverythingOnce();
    // O ar aceso (AirLight): a máscara de sombras vista de cima é OUTRO alvo de saída para os materiais de sombra, e o
    // passe do ar é um programa próprio — os dois desenham aqui, com a profundidade que o quadro acima acabou de gravar.
    this.host.air.warm(this.host.screen.composer.renderTarget1.depthTexture);
    // E de novo no alvo do ESPELHO, pela mesma razão: é outro alvo, e o primeiro reflexo do jogo
    // não pode ser o quadro em que o ANGLE termina o programa do herói.
    // (A água sai deste desenho sem o espelho: amostrar o alvo em que se desenha é um laço de
    // realimentação, e o WebGL recusa o draw.)
    this.host.renderer.setRenderTarget(this.host.mirror.warmTarget());
    this.drawEverythingOnce();
    this.host.mirror.afterWarm();

    // The shadow mask's material variants too (castMask / solidCastFieldMask): flip the
    // silhouettes into mask mode for one compile pass so toggling hd3d.shadowMask later
    // never compiles a program mid-run. The mask RT is bound for it — same colour-space
    // reasoning as the composer target above.
    this.host.shadows.applyShadowMaskMode(true);
    this.host.renderer.setRenderTarget(this.host.shadows.maskTarget);
    this.host.renderer.compile(this.host.shadows.maskScene, this.host.shadows.maskCamera);
    this.host.shadows.applyShadowMaskMode(false);

    this.host.renderer.setRenderTarget(prevTarget);

    // Hide them, but do NOT destroy them. destroy() disposes the material, three drops that
    // material's reference to the program, and a program nobody references any more is deleted
    // outright — so tearing the stand-ins down would undo the very compile they were built for.
    // They cost nine invisible quads for the run; the alternative costs a quarter-second freeze.
    for (const w of this.warmups) w.setVisible(false);
  }

  /**
   * COMPILAR NÃO BASTA: é preciso DESENHAR. No Chrome do Windows o WebGL roda sobre o ANGLE, e o
   * ANGLE só gera o executável final de um programa (o HLSL compilado para o Direct3D) no
   * primeiro DRAW — ele depende do formato dos atributos da geometria e do alvo de saída, que o
   * `renderer.compile` não informa. O `compile` deixa o programa linkado e a conta pendurada: o
   * perfil pegou o shader do rio travando 312ms no `getProgramInfoLog` no quadro em que a água
   * entrou na tela pela primeira vez, seis segundos depois de "compilada".
   *
   * Então tudo é desenhado uma vez aqui, no carregamento, com o recorte de câmera desligado — o rio
   * fora da tela, os stand-ins escondidos debaixo do mundo. O carregamento paga uma vez o que o
   * jogador pagaria aos trancos no meio da partida. O quadro sai no alvo do compositor, que o
   * `RenderPass` limpa antes do primeiro quadro de verdade: nada disto chega à tela.
   */
  private drawEverythingOnce(): void {
    const unculled: THREE.Object3D[] = [];
    this.host.scene.traverse((o) => {
      if (o.frustumCulled) {
        o.frustumCulled = false;
        unculled.push(o);
      }
    });
    this.host.renderer.render(this.host.scene, this.host.camera);
    for (const o of unculled) o.frustumCulled = true;
  }
}
