import { describe, expect, it } from 'vitest';

import { memoryArcStore, RunArc, type ArcStore, type Milestone } from './RunArc';

/** Um lugar de mentira que anota cada marca, na ordem. */
const recordingStore = (start: Milestone[] = []): ArcStore & { marks: Milestone[] } => {
  const set = new Set(start);
  const marks: Milestone[] = [];
  return { marks, reached: (m) => set.has(m), mark: (m) => { set.add(m); marks.push(m); } };
};

describe('a jornada (RunArc)', () => {
  it('nasce sem marco nenhum', () => {
    const arc = new RunArc();
    arc.load(memoryArcStore());
    expect(arc.has('intro')).toBe(false);
    expect(arc.has('ending')).toBe(false);
  });

  it('alcançar um marco é ter passado pelos anteriores, e eles vão para o lugar dele', () => {
    const store = recordingStore();
    const arc = new RunArc();
    arc.load(store);
    expect(arc.reach('gate')).toBe(true);
    expect(store.marks).toEqual(['intro', 'gardenKey', 'gate']);
    expect(arc.has('gardenKey')).toBe(true);
    expect(arc.has('mist')).toBe(false);
  });

  it('alcançar de novo (ou um marco de trás) não anda nem grava', () => {
    const store = recordingStore();
    const arc = new RunArc();
    arc.load(store);
    arc.reach('mist');
    store.marks.length = 0;
    expect(arc.reach('mist')).toBe(false);
    expect(arc.reach('intro')).toBe(false);
    expect(store.marks).toEqual([]);
  });

  it('lê do lugar até onde a jornada já foi: o marco mais adiante vale pelos de antes', () => {
    // Um save antigo com o fim visto e sem o campo da névoa (ele não existia): o jardim não pode voltar coberto.
    const arc = new RunArc();
    arc.load(memoryArcStore('intro', 'ending'));
    expect(arc.has('mist')).toBe(true);
    expect(arc.has('hearth')).toBe(true);
    expect(arc.snapshot()).toEqual({ intro: true, gardenKey: true, gate: true, mist: true, hearth: true, ending: true });
  });

  it('o playtest do editor nasce com a abertura vista e nada além', () => {
    const arc = new RunArc();
    arc.load(memoryArcStore('intro'));
    expect(arc.has('intro')).toBe(true);
    expect(arc.has('gardenKey')).toBe(false);
  });
});
