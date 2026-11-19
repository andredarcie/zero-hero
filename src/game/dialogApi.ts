import type { DialogFiles, DialogLang } from '@/game/editor/dialogDraft';
import { platform } from '@/game/platform/platform';

// O lado do editor da API das falas do dev server (vite.config.ts → /api/dialogos): os dois arquivos de
// src/game/i18n/dialogos. Só existe onde o editor roda, no dev server.

/** Onde as falas moram — é o que o toast do Salvar das falas anuncia. */
export const DIALOG_FILES_PATH = 'src/game/i18n/dialogos/{pt-br,en}.json';

const apiUrl = (): string => `${import.meta.env.BASE_URL}api/dialogos`;

export const loadDialogFiles = async (): Promise<DialogFiles> => {
  const response = await platform().fetch(apiUrl());
  if (!response.ok) throw new Error('Falha ao carregar as falas');
  return response.json() as Promise<DialogFiles>;
};

/** Grava os dois arquivos, cada um no texto já formatado (editor/dialogDraft.formatDialogJson). */
export const saveDialogFiles = async (texts: Record<DialogLang, string>): Promise<void> => {
  const response = await platform().fetch(apiUrl(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(texts),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? 'Falha ao salvar as falas');
  }
};
