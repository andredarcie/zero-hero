/**
 * O VENTO DO VALE: uma brisa que vai e vem, com rajadas por cima. Uma conta só, sobre o relógio do navegador, que a
 * chuva (ValleyWeather) e a natureza (objects/nature) leem juntas: a chuva inclina para o mesmo lado em que as
 * sementes voam e as margaridas balançam.
 *
 * Devolve tiles por milissegundo, para o leste (sempre positivo: o vento do vale sopra do oeste).
 */
export const windAt = (nowMs: number): number => {
  const t = nowMs / 1000;
  const gust = Math.max(0, Math.sin(t * 0.37) * Math.sin(t * 0.11 + 1.3));
  return 0.0007 + 0.0005 * Math.sin(t * 0.21) + 0.0016 * gust * gust;
};

/** A rajada agora, de 0 (calmaria) a 1 (o auge de uma rajada). */
export const gustAt = (nowMs: number): number => Math.min(1, Math.max(0, (windAt(nowMs) - 0.0004) / 0.0024));
