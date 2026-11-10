import { describe, expect, it } from 'vitest';

import { rhyme, scan } from './metrica';

describe('as sílabas poéticas', () => {
  it('contam até a última tônica', () => {
    expect(scan('Um herói. Que novidade.')).toEqual({ min: 7, max: 7 });
    expect(scan('Torna-te quem você é.')).toEqual({ min: 7, max: 7 });
    expect(scan('Última noite. Depois')).toEqual({ min: 7, max: 7 });
  });

  it('a vogal do fim de uma palavra pode se fundir com a do começo da seguinte (sinalefa)', () => {
    expect(scan('na guerra, desde o começo.')).toEqual({ min: 7, max: 8 });
    expect(scan('dá à luz a estrela que dança.')).toEqual({ min: 7, max: 9 });
  });

  it('duas tônicas encostadas não se fundem, e consoante no meio impede a fusão', () => {
    expect(scan('Não há mais o que combater.')).toEqual({ min: 8, max: 8 });
    expect(scan('Hoje dorme sob as estrelas,')).toEqual({ min: 8, max: 8 });
  });

  it('o hiato pode virar uma sílaba (sinérese): fora da tônica, ou com "i"/"u" de semivogal', () => {
    // (O "-ria" do fim fica depois da última tônica: não entra na conta.)
    expect(scan('você me amaldiçoaria,')).toEqual({ min: 7, max: 9 });
    expect(scan('criar é viver duas vezes.')).toEqual({ min: 6, max: 8 });
    // Duas vogais fortes com a tônica no meio não se juntam: "le-ão", "ca-os".
    expect(scan('Só quem tem caos por dentro')).toEqual({ min: 7, max: 7 });
  });

  it('o ditongo depois da tônica pode se abrir (diérese)', () => {
    expect(scan('a honra, a vitória. Morreram.')).toEqual({ min: 7, max: 10 });
  });

  it('o "u" de "que" e "guerra" não é sílaba, o de "igual" se cola na vogal', () => {
    expect(scan('Ninguém te diz o que vale.')).toEqual({ min: 7, max: 7 });
    expect(scan('voltasse, igual, sem fim?')).toEqual({ min: 6, max: 7 });
  });
});

describe('a rima', () => {
  it('é o som da última palavra tônica, a partir da vogal tônica', () => {
    expect(rhyme('te buscar. Eu te conheço:').key).toBe(rhyme('na guerra, desde o começo.').key);
    expect(rhyme('desta, não volto. Promessa.').key).toBe(rhyme('brinca, esquece e recomeça.').key);
    expect(rhyme('vira leão, e diz: não.').key).toBe(rhyme('mas tem garras, não tem mão.').key);
    expect(rhyme('a honra, a vitória. Morreram.').key).toBe(rhyme('e outros deuses não nasceram.').key);
  });

  it('som diferente não rima', () => {
    expect(rhyme('Já nada vale mais nada,').key).not.toBe(rhyme('a honra, a vitória. Morreram.').key);
    expect(rhyme('a mão').key).not.toBe(rhyme('o mar').key);
  });

  it('diz qual é a palavra, para a rima com a mesma palavra ser recusada', () => {
    expect(rhyme('ou diria: “Sim, eu quero”?').word).toBe('quero');
  });
});
