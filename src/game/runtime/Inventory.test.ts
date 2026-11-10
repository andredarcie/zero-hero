import { describe, expect, it } from 'vitest';

import { Inventory, isToolKind } from './Inventory';

// AS COSTAS E AS FERRAMENTAS GUARDADAS: material é um de cada vez, ferramenta fica com o herói para sempre, e nas
// costas vai só a última usada.

describe('o inventário do herói', () => {
  it('o exemplo do autor: faca nas costas, ganhou o machado; a árvore traz o machado, o cogumelo traz a faca', () => {
    const inv = new Inventory();
    inv.add('knife');
    // O machado chega e vai às costas; a faca é guardada.
    expect(inv.add('axe')).toBe(true);
    expect(inv.selected).toBe('axe');
    expect(inv.keptTools()).toEqual(['knife']);
    // Diante do cogumelo, a faca volta às costas e o machado é guardado.
    expect(inv.equip('knife')).toBe(true);
    expect(inv.selected).toBe('knife');
    expect(inv.keptTools()).toEqual(['axe']);
    expect(inv.owns('axe') && inv.owns('knife')).toBe(true);
  });

  it('material continua um de cada vez: outro material recusa, e a ferramenta que chega é guardada sem largá-lo', () => {
    const inv = new Inventory();
    inv.add('stone');
    expect(inv.fits('wood')).toBe(false);
    expect(inv.add('wood')).toBe(false);
    expect(inv.add('pickaxe')).toBe(true);
    expect(inv.selected).toBe('stone');
    expect(inv.keptTools()).toEqual(['pickaxe']);
    // Material nas costas: a guardada não vem sem que ele seja largado antes (a cena o põe no chão).
    expect(inv.equip('pickaxe')).toBe(false);
    expect(inv.takeAll()).toEqual({ kind: 'stone', count: 1 });
    expect(inv.equip('pickaxe')).toBe(true);
    // Pegar material com ferramenta nas costas guarda a ferramenta.
    expect(inv.add('wood')).toBe(true);
    expect(inv.selected).toBe('wood');
    expect(inv.keptTools()).toEqual(['pickaxe']);
  });

  it('o pacote soma, e o balde enche e esvazia nas costas ou guardado', () => {
    const inv = new Inventory();
    inv.add('dyeSeeds', 2);
    inv.add('dyeSeeds', 2);
    expect(inv.count('dyeSeeds')).toBe(4);
    inv.add('bucket');
    expect(inv.replace('bucket', 'bucketFull')).toBe(true);
    expect(inv.owns('bucketFull') && !inv.owns('bucket')).toBe(true);
  });

  it('devolver tira das costas ou das guardadas; perguntar como se estivesse nas costas não muda nada', () => {
    const inv = new Inventory();
    inv.add('shovel');
    inv.add('brush');
    expect(inv.remove('shovel')).toBe(true);
    expect(inv.owns('shovel')).toBe(false);
    inv.add('axe');
    inv.add('ore');
    expect(inv.peek('axe', () => inv.selected)).toBe('axe');
    expect(inv.selected).toBe('ore');
    expect(inv.count('ore')).toBe(1);
    expect(() => inv.peek('axe', () => { throw new Error('x'); })).toThrow();
    expect(inv.selected).toBe('ore');
  });

  it('a lista do save leva as costas e as guardadas, e o save volta pelo `keep`', () => {
    const inv = new Inventory();
    inv.add('axe');
    inv.add('knife');
    inv.add('stone');
    expect(inv.list()).toEqual([{ kind: 'stone', count: 1 }, { kind: 'axe', count: 1 }, { kind: 'knife', count: 1 }]);
    const back = new Inventory();
    back.add('stone');
    expect(back.keep('axe')).toBe(true);
    expect(back.keep('ore')).toBe(false);
    expect(back.selected).toBe('stone');
    expect(back.keptTools()).toEqual(['axe']);
    back.clear();
    expect(back.isEmpty && back.keptTools().length === 0).toBe(true);
  });

  it('o que é ferramenta', () => {
    expect(['knife', 'axe', 'pickaxe', 'scythe', 'shovel', 'bucket', 'bucketFull', 'brush', 'key'].every((k) => isToolKind(k as never))).toBe(true);
    expect(['stone', 'wood', 'ore', 'iron', 'telescope', 'dyeSeeds', 'none'].some((k) => isToolKind(k as never))).toBe(false);
  });
});
