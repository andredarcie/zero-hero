import { afterEach, describe, expect, it } from 'vitest';
import { advanceTimeOfDay, getTimeOfDay, isNightTime, isSlowClock, setTimeOfDay, setTimeScale } from './timeOfDay';

// O PASSO DO RELÓGIO: devagar do fim da madrugada ao fim da hora azul (os dois crepúsculos têm de durar o bastante para
// serem vistos), depressa só na noite fechada. `isNightTime` continua sendo 18h–6h: ele não diz a pressa do relógio.

describe('o passo do relógio', () => {
  afterEach(() => {
    setTimeScale(1);
    setTimeOfDay(0);
  });

  /** Quanto do mostrador anda em um segundo de jogo, a partir da hora dada. */
  const perSecond = (hour: number): number => {
    setTimeOfDay(hour / 24);
    advanceTimeOfDay(1000);
    return getTimeOfDay() - hour / 24;
  };

  it('o dia inteiro anda no passo lento: doze horas em oito minutos', () => {
    expect(perSecond(12)).toBeCloseTo(0.5 / (8 * 60), 9);
    expect(perSecond(7)).toBeCloseTo(perSecond(16), 9);
  });

  it('a aurora, o arrebol e a hora azul andam no passo do dia, mesmo sendo noite para os vizinhos', () => {
    const day = perSecond(12);
    for (const hour of [5, 5.75, 18.2, 19.2]) {
      setTimeOfDay(hour / 24);
      expect(isNightTime()).toBe(true);
      expect(isSlowClock()).toBe(true);
      expect(perSecond(hour)).toBeCloseTo(day, 9);
    }
  });

  it('a noite fechada corre: doze horas em três minutos', () => {
    for (const hour of [20, 23, 1, 4]) {
      setTimeOfDay(hour / 24);
      expect(isSlowClock()).toBe(false);
      expect(perSecond(hour)).toBeCloseTo(0.5 / (3 * 60), 9);
    }
  });

  it('o descanso acelera os dois passos na mesma proporção', () => {
    const base = perSecond(12);
    setTimeScale(24);
    expect(perSecond(12)).toBeCloseTo(base * 24, 9);
  });
});
