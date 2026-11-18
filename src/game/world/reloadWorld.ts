import { platform } from '@/game/platform/platform';
import { setWorldData } from '@/game/world/WorldData';

/**
 * O `world.json` DE NOVO DO DISCO, antes de toda entrada no vale (o Continue do título, o acordar depois dos créditos):
 * o mundo em memória pode estar mexido (árvores derrubadas, canteiros cavados), e tudo o que merece viver mora no save,
 * que reaplica os próprios diffs no create. Sem rede ou com o arquivo ruim, fica o mundo que já está carregado.
 */
export const reloadWorldData = (): Promise<void> =>
  platform().fetch(`${import.meta.env.BASE_URL}world.json`, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : undefined))
    .then((json) => { if (json) setWorldData(json); })
    .catch(() => undefined);
