// Player-facing graphics settings (the pause menu writes them, the renderer reads them).
//
// · The tilt-shift depth of field. It is the signature of the HD-2D look, but a permanently
//   blurred screen edge gives some players eye strain or motion sickness — so it is an
//   accessibility knob, not a fixed style. 0 turns the blur off entirely and the diorama stays
//   crisp end to end; 1 is the authored look.
// · A HORA DO DIA (0 = a noite autorada, 1 = o dia de sol). Ver render3d/skyPreset.ts.

const DOF_KEY = 'zh.dof';
const DAYLIGHT_KEY = 'zh.daylight';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const read = (key: string, fallback: number): number => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? clamp01(value) : fallback;
  } catch {
    return fallback; // private mode / storage disabled — the setting just doesn't persist
  }
};

const write = (key: string, value: number): void => {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore: the session still honours the setting, it just won't survive a reload
  }
};

let dofIntensity = read(DOF_KEY, 1);

export const getDofIntensity = (): number => dofIntensity;

export const setDofIntensity = (value: number): void => {
  dofIntensity = clamp01(value);
  write(DOF_KEY, dofIntensity);
};

/**
 * `?day` / `?night` na URL MANDAM na preferência guardada — só nesta carga, sem gravar.
 *
 * O renderizador nasce de novo a cada `scene.restart()` (a morte é um), então a hora do dia tem de
 * viver FORA dele: se ela morasse só no World3D, morrer devolveria o jogador à noite. E a URL tem
 * de vencer o localStorage, senão `?day` num navegador que já escolheu a noite não faria nada — é
 * a mesma regra do `?level=N`: o endereço é uma ordem, não uma sugestão.
 */
const seedDaylight = (): number => {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return read(DAYLIGHT_KEY, 0);
  }
  if (params.has('day')) return 1;
  if (params.has('night')) return 0;
  return read(DAYLIGHT_KEY, 0);
};

let daylight = seedDaylight();

/** 0 = a noite autorada (o padrão do jogo), 1 = o dia de sol. */
export const getDaylight = (): number => daylight;

export const setDaylight = (value: number): void => {
  daylight = clamp01(value) >= 0.5 ? 1 : 0;
  write(DAYLIGHT_KEY, daylight);
};
