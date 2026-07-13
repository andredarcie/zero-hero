// Player-facing graphics settings (the pause menu writes them, the renderer reads them).
//
// Only one so far: the tilt-shift depth of field. It is the signature of the HD-2D look, but a
// permanently blurred screen edge gives some players eye strain or motion sickness — so it is an
// accessibility knob, not a fixed style. 0 turns the blur off entirely and the diorama stays
// crisp end to end; 1 is the authored look.

const DOF_KEY = 'zh.dof';

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

let dofIntensity = read(DOF_KEY, 1);

export const getDofIntensity = (): number => dofIntensity;

export const setDofIntensity = (value: number): void => {
  dofIntensity = clamp01(value);
  try {
    window.localStorage.setItem(DOF_KEY, String(dofIntensity));
  } catch {
    // ignore: the session still honours the setting, it just won't survive a reload
  }
};
