import { describe, expect, it } from 'vitest';

import { CYCLE_S, EXHALE_S, INHALE_S, MeditationSession, QUIET_S, THOUGHT_CATCH, guideAt, syncOf } from './meditation';

// A MEDITAÇÃO NA PEDRA DA COLINA: a regra, sem tela. O fôlego segue um guia de seis por minuto; os pensamentos chegam
// sozinhos; perceber um deles é uma volta, e conta a favor; o fundo é a quietude.

const DT = 1 / 60;
/** Segura enquanto o guia sobe e solta enquanto desce: o jogador perfeito. */
const followGuide = (s: MeditationSession): boolean => s.guide.inhaling;
/** Uma sorte fixa: o mesmo número sempre. */
const fixed = (v: number) => () => v;

const run = (s: MeditationSession, seconds: number, hold: (s: MeditationSession) => boolean, onTick?: () => void) => {
  const events = [];
  for (let t = 0; t < seconds; t += DT) {
    events.push(...s.step(DT, hold(s)));
    onTick?.();
  }
  return events;
};

describe('o fôlego', () => {
  it('é de seis por minuto: sobe em 4 s e desce em 6 s', () => {
    expect(CYCLE_S).toBe(10);
    expect(guideAt(0).level).toBeCloseTo(0);
    expect(guideAt(INHALE_S).level).toBeCloseTo(1);
    expect(guideAt(INHALE_S + EXHALE_S / 2).level).toBeCloseTo(0.5);
    expect(guideAt(1).inhaling).toBe(true);
    expect(guideAt(5).inhaling).toBe(false);
  });

  it('quem segue o guia fica em sintonia o tempo todo; quem não respira, não', () => {
    const good = new MeditationSession(fixed(0.5));
    const events = run(good, CYCLE_S * 2 - 0.5, followGuide);
    const breaths = events.filter((e) => e.type === 'breath');
    expect(breaths.every((e) => e.type === 'breath' && e.quality > 0.95)).toBe(true);
    expect(good.breaths).toBe(1);
    const still = new MeditationSession(fixed(0.5));
    run(still, CYCLE_S + 0.1, () => false);
    expect(still.breaths).toBe(0);
    expect(syncOf(0, 1)).toBe(0);
    expect(syncOf(0.5, 0.5)).toBe(1);
  });

  it('avisa quando o guia vira (o som da inspiração e da expiração)', () => {
    const s = new MeditationSession(fixed(0.5));
    const kinds = run(s, CYCLE_S + 0.1, followGuide).map((e) => e.type);
    expect(kinds.filter((k) => k === 'exhale')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'inhale')).toHaveLength(1);
  });
});

describe('os pensamentos', () => {
  it('os dois primeiros fôlegos são só fôlego; depois a mente divaga sozinha', () => {
    const s = new MeditationSession(fixed(0.5));
    const early = run(s, CYCLE_S * 2 - 0.1, followGuide);
    expect(early.some((e) => e.type === 'thought')).toBe(false);
    const later = run(s, 1, followGuide);
    expect(later.some((e) => e.type === 'thought')).toBe(true);
  });

  it('um pensamento não percebido alcança o herói, apaga o fôlego e depois some num lapso', () => {
    const s = new MeditationSession(fixed(0.5));
    run(s, CYCLE_S * 2 + 0.1, followGuide);
    const caught = run(s, 8, followGuide);
    expect(caught.some((e) => e.type === 'caught')).toBe(true);
    expect(s.focused).toBe(false);
    expect(s.sync).toBe(0);
    const lapse = run(s, 8, followGuide);
    expect(lapse.some((e) => e.type === 'lapse')).toBe(true);
    expect(s.lapses).toBe(1);
  });

  it('perceber é uma volta: conta a favor, aprofunda, e o fôlego volta', () => {
    const s = new MeditationSession(fixed(0.5));
    run(s, CYCLE_S * 2 + 0.1, followGuide);
    run(s, 8, followGuide);
    const before = s.depth;
    const noticed = s.notice();
    expect(noticed?.state).toBe('noticed');
    expect(s.returns).toBe(1);
    expect(s.depth).toBeGreaterThan(before);
    expect(s.focused).toBe(true);
    // Perceber sem pensamento nenhum não faz nada.
    run(s, 2, followGuide);
    expect(s.notice()).toBeNull();
  });

  it('nunca vêm de baixo (onde cobririam o herói) e chegam até a beira dele, não em cima', () => {
    for (const v of [0, 0.25, 0.5, 0.75, 0.999]) {
      const s = new MeditationSession(fixed(v));
      run(s, CYCLE_S * 2 + 0.1, followGuide);
      for (const t of s.thoughts) expect(Math.sin(t.angle)).toBeLessThanOrEqual(Math.sin(20 * (Math.PI / 180)) + 1e-9);
      run(s, 10, followGuide);
      for (const t of s.thoughts) expect(t.dist).toBeGreaterThanOrEqual(THOUGHT_CATCH);
    }
  });
});

describe('a profundidade', () => {
  it('quem respira junto e percebe chega à quietude em poucos minutos, e nela nenhum pensamento chega', () => {
    const s = new MeditationSession(fixed(0.5));
    let quietAt = -1;
    const events = run(s, 240, followGuide, () => {
      if (s.thoughts.some((t) => t.state === 'caught')) s.notice();
      if (quietAt < 0 && s.quiet) quietAt = s.time;
    });
    expect(events.some((e) => e.type === 'quiet')).toBe(true);
    expect(quietAt).toBeGreaterThan(60);
    expect(quietAt).toBeLessThan(200);
    expect(s.lapses).toBe(0);
    // A mente divagou no caminho (e cada volta ajudou a descer).
    expect(events.filter((e) => e.type === 'thought').length).toBeGreaterThan(2);
    expect(s.returns).toBeGreaterThan(2);
    const s2 = new MeditationSession(fixed(0.5));
    let thoughtsInQuiet = 0;
    run(s2, 240, followGuide, () => {
      if (s2.thoughts.some((t) => t.state === 'caught')) s2.notice();
      if (s2.quiet && s2.thoughts.some((t) => t.state === 'drifting' && t.age === 0)) thoughtsInQuiet += 1;
    });
    expect(thoughtsInQuiet).toBe(0);
    expect(QUIET_S).toBeGreaterThan(10);
  });

  it('a quietude espera a volta: com um pensamento colado no herói, ela não começa', () => {
    const s = new MeditationSession(fixed(0.5));
    run(s, CYCLE_S * 2 + 0.1, followGuide);
    run(s, 8, followGuide);
    expect(s.focused).toBe(false);
    s.depth = 1;
    // O fôlego fecha aos 30 s com o fundo cheio, mas a mente está longe: nada de quietude.
    run(s, CYCLE_S * 3 + 0.5 - s.time, followGuide);
    expect(s.focused).toBe(false);
    expect(s.quiet).toBe(false);
    // Percebido o pensamento, o fôlego seguinte (aos 40 s) abre a quietude.
    expect(s.notice()).not.toBeNull();
    run(s, CYCLE_S * 4 + 0.5 - s.time, followGuide);
    expect(s.quiet).toBe(true);
  });

  it('não há derrota: a profundidade nunca fica negativa nem passa de 1', () => {
    const lazy = new MeditationSession(fixed(0.3));
    run(lazy, 200, () => false);
    expect(lazy.depth).toBeGreaterThanOrEqual(0);
    const keen = new MeditationSession(fixed(0.3));
    run(keen, 400, followGuide, () => { keen.notice(); });
    expect(keen.depth).toBeLessThanOrEqual(1);
  });
});
