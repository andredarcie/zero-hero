import * as THREE from 'three';

/**
 * O TUNEL ENTRE OS LEVELS — a viagem, o "stargate" de 2001 filtrado pelo SNES.
 *
 * Ele existe fora do jogo de proposito. O mundo (World3D) e a cena do Phaser sao DESTRUIDOS no
 * meio da transicao — `GameScene.completeLevel` chama `scene.restart()` para construir o level
 * seguinte — entao nada que viva dentro deles pode continuar desenhando durante a troca. Este
 * modulo e um singleton com canvas, renderer e loop de rAF PROPRIOS, empilhado acima de tudo
 * (z-index 3: o mundo esta no 0, o canvas do Phaser no 1). Ele nasce quando o portal engole o
 * heroi, atravessa a reconstrucao inteira do mundo e so morre quando o novo level pede.
 *
 * Ser um segundo contexto WebGL e o preco disso, e ele e pago numa tela que ja esta coberta:
 * o contexto e criado enquanto a succao ainda roda, entao a compilacao dos dois shaders daqui
 * nao aparece como engasgo no meio do movimento.
 *
 * PIXELADO, na paleta do portal (decisao do usuario). O backing store e uma fracao da janela e
 * o CSS o estica com NEAREST — o mesmo truque do World3D (applyPixelScale), calibrado para um
 * pixel do tunel ficar do tamanho de um pixel da ARTE do mundo (um tile tem 16). Sem isso o
 * tunel seria o unico frame liso do jogo e leria como a tela de outro jogo.
 *
 * A geometria sao duas coisas, nao uma:
 *   - A PAREDE: um cilindro aberto visto por dentro, com uma textura de colunas geradas aqui
 *     (roxo/dourado sobre preto) rolando ao longo do eixo. Ela e o que faz o buraco ser um
 *     TUNEL e nao um campo de estrelas.
 *   - AS RISCAS: quads que passam voando. Cada um e girado para o plano (tangencial, eixo) —
 *     isto e, com a normal apontando para o eixo do tunel — porque so assim ele fica de FRENTE
 *     para a camera esteja em que angulo estiver. Um quad que nao gira desaparece de perfil
 *     exatamente quando passa pelo lado da tela, que e quando ele mais deveria aparecer.
 *
 * Tres fases: ENTRADA (acelera do preto), CRUZEIRO (segura enquanto o proximo level carrega —
 * duracao desconhecida, e por isso que a fase existe) e SAIDA (o nucleo cresce e estoura em
 * branco-violeta, revelando o mundo novo por baixo).
 */

// Paleta: as duas cores do portal (levelPortalTexture) e nada mais.
const VIOLET = new THREE.Color('#8b5cf6');
const GOLD = new THREE.Color('#f5d97a');
const PALE = new THREE.Color('#e9d5ff');

const STREAK_COUNT = 110;
/** Onde as riscas nascem e ate onde vao (a camera olha para -Z, parada na origem). */
const FAR_Z = -46;
const PASS_Z = 3.5;
const TUNNEL_RADIUS = 5.2;
/** Onde fica a luz do fim do tunel: fundo o bastante para ser o ponto de fuga, e nao um objeto. */
const CORE_Z = -84;

const ENTER_MS = 520;
/**
 * A saida: o mergulho no clarao. Exportada porque a QUEDA do heroi do outro lado tem de
 * COMECAR dentro dela — se esperasse o fim, o mundo novo apareceria com o heroi parado no ar
 * antes de cair, e a chegada perderia exatamente o unico frame que ela precisa vender.
 */
export const PORTAL_TUNNEL_EXIT_MS = 620;
const EXIT_MS = PORTAL_TUNNEL_EXIT_MS;
/** Piso da fase de cruzeiro: mesmo com o level carregando instantaneamente, a viagem existe. */
export const PORTAL_TUNNEL_MIN_CRUISE_MS = 1150;
/**
 * Teto do cruzeiro. O overlay cobre a tela inteira e nao aceita input: se quem devia chamar
 * `finish()` morrer no caminho (uma cena que foi para outro lugar, um fetch que travou), o
 * jogador ficaria preso olhando um tunel para sempre. Passado este tempo ele sai sozinho —
 * um mundo mal-chegado ainda e melhor que um jogo que nao volta.
 */
const MAX_CRUISE_MS = 9000;

/** Tamanho de um pixel da arte do mundo na tela, em px de CSS. Um tile e 16 deles. */
const DEFAULT_ART_PIXEL = 4;

type Phase = 'enter' | 'cruise' | 'exit' | 'done';

class PortalTunnel {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly wall: THREE.Mesh;
  private readonly wallTexture: THREE.Texture;
  private readonly streaks: THREE.InstancedMesh;
  /** Estado por risca: angulo no tubo, raio, z e comprimento. Rearmado ao passar pela camera. */
  private readonly streakZ: Float32Array;
  private readonly streakAngle: Float32Array;
  private readonly streakRadius: Float32Array;
  private readonly streakLen: Float32Array;
  private readonly streakSpeed: Float32Array;
  private readonly core: THREE.Mesh;
  private readonly coreTexture: THREE.Texture;
  private readonly dummy = new THREE.Object3D();

  private readonly pixelSize: number;
  private phase: Phase = 'enter';
  private phaseMs = 0;
  private totalMs = 0;
  private travelled = 0;
  private rafId = 0;
  private lastTs = 0;
  private exitResolve?: () => void;

  public constructor(artPixel: number) {
    this.pixelSize = Math.max(2, Math.round(artPixel));

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'portal-tunnel';
    // Acima do mundo (0) e do canvas do Phaser (1). `pointer-events:none` porque durante a
    // viagem nao ha nada para clicar e o overlay nao pode roubar o input do jogo por baixo.
    this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:3;'
      + 'display:block;image-rendering:pixelated;pointer-events:none;background:#05030c;'
      + 'opacity:0;transition:opacity 160ms linear;';
    document.body.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x05030c, 1);
    this.applySize();

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 90);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);

    // ── a parede ──────────────────────────────────────────────────────────────
    this.wallTexture = makeWallTexture();
    const wallGeo = new THREE.CylinderGeometry(TUNNEL_RADIUS, TUNNEL_RADIUS, 120, 22, 1, true);
    // O cilindro nasce em pe (eixo Y); deitar no eixo Z e o que faz dele um tunel.
    wallGeo.rotateX(Math.PI / 2);
    this.wall = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({
      map: this.wallTexture,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
      fog: false,
    }));
    this.wall.position.z = -40;
    this.scene.add(this.wall);

    // ── as riscas ─────────────────────────────────────────────────────────────
    this.streakZ = new Float32Array(STREAK_COUNT);
    this.streakAngle = new Float32Array(STREAK_COUNT);
    this.streakRadius = new Float32Array(STREAK_COUNT);
    this.streakLen = new Float32Array(STREAK_COUNT);
    this.streakSpeed = new Float32Array(STREAK_COUNT);
    this.streaks = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
      }),
      STREAK_COUNT,
    );
    this.streaks.frustumCulled = false;
    for (let i = 0; i < STREAK_COUNT; i += 1) {
      this.respawnStreak(i, true);
      // Dourado e a minoria: ele e o brilho, e brilho que e maioria vira fundo.
      const color = i % 5 === 0 ? GOLD : (i % 3 === 0 ? PALE : VIOLET);
      this.streaks.setColorAt(i, color);
    }
    if (this.streaks.instanceColor) this.streaks.instanceColor.needsUpdate = true;
    this.scene.add(this.streaks);

    // ── o nucleo ──────────────────────────────────────────────────────────────
    // A LUZ NO FIM DO TUNEL. Na entrada e um clarao distante; na saida vem para cima da camera
    // e engole a tela — a chegada e uma EXPLOSAO de luz, o oposto exato da succao que abriu a
    // sequencia.
    //
    // Ele TAPA o ponto de fuga, e isso e funcao e nao enfeite: o cilindro se estende alem do
    // plano distante da camera, entao o miolo da imagem era um quadrado de clear color — um
    // buraco PRETO no centro exato de um tunel que devia estar levando o heroi para algum
    // lugar. Estica-lo ate caber no plano distante so trocaria o buraco por uma borda dura.
    this.coreTexture = makeCoreTexture();
    this.core = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.coreTexture,
        color: PALE,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.62,
        fog: false,
      }),
    );
    this.core.position.set(0, 0, CORE_Z);
    this.core.scale.setScalar(12);
    this.scene.add(this.core);

    window.addEventListener('resize', this.onResize);
    // Um frame de respiro antes de aparecer: o primeiro render compila os shaders, e o fade-in
    // do CSS esconde exatamente esse frame.
    requestAnimationFrame(() => { this.canvas.style.opacity = '1'; });
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  public get active(): boolean { return this.phase !== 'done'; }
  public get elapsedMs(): number { return this.totalMs; }

  /** Comeca a saida. Resolve quando o overlay ja saiu da frente do mundo novo. */
  public finish(): Promise<void> {
    if (this.phase === 'exit' || this.phase === 'done') {
      return new Promise<void>((resolve) => {
        if (this.phase === 'done') resolve();
        else this.exitResolve = resolve;
      });
    }
    this.phase = 'exit';
    this.phaseMs = 0;
    return new Promise<void>((resolve) => { this.exitResolve = resolve; });
  }

  public destroy(): void {
    if (this.rafId) window.cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.phase = 'done';
    window.removeEventListener('resize', this.onResize);
    this.wallTexture.dispose();
    this.coreTexture.dispose();
    this.wall.geometry.dispose();
    (this.wall.material as THREE.Material).dispose();
    this.streaks.geometry.dispose();
    (this.streaks.material as THREE.Material).dispose();
    this.streaks.dispose();
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    this.renderer.dispose();
    // Devolver o contexto na mao: um WebGL orfao segura VRAM ate o GC passar, e o jogo ja tem
    // um contexto vivo (o World3D do level novo) disputando com ele.
    this.renderer.forceContextLoss();
    this.canvas.remove();
    const resolve = this.exitResolve;
    this.exitResolve = undefined;
    resolve?.();
  }

  private readonly onResize = (): void => {
    this.applySize();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  private applySize(): void {
    const w = Math.max(1, Math.floor(window.innerWidth / this.pixelSize));
    const h = Math.max(1, Math.floor(window.innerHeight / this.pixelSize));
    this.renderer.setSize(w, h, false); // CSS continua 100%: o browser faz o upscale NEAREST
  }

  /** Coloca a risca `i` num angulo/raio novo, la no fundo do tunel. */
  private respawnStreak(i: number, initial: boolean): void {
    this.streakAngle[i] = Math.random() * Math.PI * 2;
    // Raio ao quadrado: distribuicao uniforme na SECAO do tubo. Sortear o raio direto amontoa
    // tudo no centro, e o centro e o ponto de fuga — riscas ali nao correm, so piscam.
    this.streakRadius[i] = TUNNEL_RADIUS * (0.28 + 0.72 * Math.sqrt(Math.random()));
    this.streakLen[i] = 2.2 + Math.random() * 5.5;
    this.streakSpeed[i] = 0.72 + Math.random() * 0.62;
    this.streakZ[i] = initial
      ? FAR_Z + Math.random() * (PASS_Z - FAR_Z)
      : FAR_Z - Math.random() * 8;
  }

  private readonly tick = (ts: number): void => {
    if (this.phase === 'done') return;
    this.rafId = requestAnimationFrame(this.tick);
    // Teto no delta: uma aba que volta do background entrega um salto de segundos, e sem o teto
    // a viagem inteira acontece num frame so.
    const dt = Math.min((ts - this.lastTs) / 1000, 0.05);
    this.lastTs = ts;
    this.phaseMs += dt * 1000;
    this.totalMs += dt * 1000;

    let speed: number;
    if (this.phase === 'enter') {
      const k = Math.min(1, this.phaseMs / ENTER_MS);
      speed = 6 + 30 * k * k; // acelera devagar e depois de vez: uma partida, nao um corte
      if (this.phaseMs >= ENTER_MS) { this.phase = 'cruise'; this.phaseMs = 0; }
    } else if (this.phase === 'cruise') {
      speed = 36 + Math.sin(this.totalMs / 380) * 4;
      if (this.phaseMs >= MAX_CRUISE_MS) { this.phase = 'exit'; this.phaseMs = 0; }
    } else {
      const k = Math.min(1, this.phaseMs / EXIT_MS);
      speed = 36 + 145 * k * k; // o mergulho final
      const mat = this.core.material as THREE.MeshBasicMaterial;
      // O nucleo vem da distancia ate a cara da camera e cobre a tela.
      this.core.position.z = CORE_Z + (Math.abs(CORE_Z) + 1) * k * k;
      this.core.scale.setScalar(12 + 40 * k * k);
      mat.opacity = 0.62 + 0.38 * k;
      // Some do jogo nos ultimos 30%: o mundo novo aparece POR BAIXO do estouro de luz, nunca
      // depois de um corte para preto.
      this.canvas.style.opacity = String(1 - Math.max(0, (k - 0.7) / 0.3));
      if (this.phaseMs >= EXIT_MS) { this.destroy(); return; }
    }

    this.travelled += speed * dt;
    // A parede rola ao longo do eixo e torce devagar — a torcao e o que impede as colunas de
    // lerem como um papel de parede parado enquanto so o brilho anda.
    this.wallTexture.offset.y = -this.travelled * 0.06;
    this.wallTexture.offset.x = this.travelled * 0.004;
    this.wall.rotation.z = this.travelled * 0.02;

    for (let i = 0; i < STREAK_COUNT; i += 1) {
      this.streakZ[i] += speed * this.streakSpeed[i] * dt;
      if (this.streakZ[i] > PASS_Z) this.respawnStreak(i, false);
      const angle = this.streakAngle[i];
      const r = this.streakRadius[i];
      this.dummy.position.set(Math.cos(angle) * r, Math.sin(angle) * r, this.streakZ[i]);
      // Normal apontando para o eixo: girar 90 graus em Y poe o plano no par (Z, Y) — o local x
      // vira o COMPRIMENTO, deitado no eixo do tunel — e girar em Z leva o conjunto ate o angulo
      // da risca. Nesta ordem a risca fica sempre de frente para a camera.
      this.dummy.quaternion.setFromAxisAngle(AXIS_Z, angle);
      this.dummy.quaternion.multiply(Q_FACE_AXIS);
      // Comprimento cresce com a velocidade: e o borrao de movimento, feito de geometria.
      this.dummy.scale.set(this.streakLen[i] * (0.5 + speed / 52), 0.09, 1);
      this.dummy.updateMatrix();
      this.streaks.setMatrixAt(i, this.dummy.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  };
}

const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const Q_FACE_AXIS = new THREE.Quaternion().setFromAxisAngle(AXIS_Y, Math.PI / 2);

/**
 * A textura da parede: colunas de largura irregular em roxo/dourado sobre preto.
 *
 * As colunas correm no eixo V (o comprimento do cilindro), entao rolar V faz a parede inteira
 * viajar. A variacao ao longo da coluna e um degrade em DEGRAUS, nao um gradiente: um degrade
 * liso aqui reapareceria como a unica rampa suave do jogo assim que o NEAREST esticasse a
 * imagem. 64x64 e de proposito minusculo — a textura e esticada por 120 unidades de tunel.
 */
const makeWallTexture = (): THREE.Texture => {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#05030c';
  ctx.fillRect(0, 0, size, size);

  const columns = ['#8b5cf6', '#6d28d9', '#a78bfa', '#f5d97a', '#3b1d6e'];
  for (let x = 0; x < size; x += 1) {
    // Uma coluna em cada tres fica apagada: o vazio entre as riscas e o que da profundidade.
    if ((x * 7 + Math.floor(x / 3)) % 3 === 0) continue;
    const color = columns[(x * 3 + Math.floor(x / 5)) % columns.length];
    for (let y = 0; y < size; y += 1) {
      // Quatro degraus de brilho ao longo da coluna, em padrao que nao repete no olho.
      const step = ((x * 5 + y * 3) % 17) / 17;
      const bright = step < 0.34 ? 0.18 : step < 0.62 ? 0.45 : step < 0.86 ? 0.78 : 1;
      ctx.globalAlpha = bright;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 4);
  return tex;
};

/**
 * A luz do fim do tunel, como DISCO e nao como quadrado.
 *
 * O nucleo era um quad de cor chapada, e um quad de cor chapada e um quadrado — bem no meio da
 * tela, no unico ponto para onde todas as riscas apontam. Este disco tem quatro degraus de
 * brilho e borda dura (nada de gradiente, nada de alpha suave): 32x32 e ampliado por dezenas de
 * unidades, entao a escadinha da borda e grossa e deliberada, do mesmo tamanho do resto.
 */
const makeCoreTexture = (): THREE.Texture => {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const mid = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - mid, y - mid) / mid;
      if (d > 1) continue;
      const bright = d < 0.34 ? 1 : d < 0.58 ? 0.72 : d < 0.8 ? 0.4 : 0.16;
      ctx.globalAlpha = bright;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
};

let current: PortalTunnel | undefined;

/**
 * Abre o tunel. `artPixel` e o tamanho na tela de um pixel da arte do mundo (tile / 16) — e o
 * que faz o tunel ter a MESMA grossura de pixel que o jogo que ele acabou de deixar.
 */
export const startPortalTunnel = (artPixel = DEFAULT_ART_PIXEL): void => {
  if (current?.active) return;
  current = new PortalTunnel(artPixel);
};

export const portalTunnelActive = (): boolean => current?.active === true;
export const portalTunnelElapsedMs = (): number => current?.elapsedMs ?? 0;

/** Fecha o tunel com o estouro de luz. Resolve quando o mundo novo esta a vista. */
export const finishPortalTunnel = async (): Promise<void> => {
  const tunnel = current;
  if (!tunnel?.active) return;
  await tunnel.finish();
  if (current === tunnel) current = undefined;
};

/** Corte seco — para o shutdown de uma cena que morreu no meio da viagem. */
export const destroyPortalTunnel = (): void => {
  current?.destroy();
  current = undefined;
};
