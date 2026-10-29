import { browserStore, clearSave, defaultSave, loadSave, writeSave, type SaveData } from '../core/save';

/** Progresso do jogador em memória. Toda alteração deve chamar persist(). */
export const state: { save: SaveData } = { save: loadSave(browserStore()) };

export function persist(): void {
  writeSave(browserStore(), state.save);
}

export function resetProgress(): void {
  clearSave(browserStore());
  state.save = defaultSave();
  persist();
}
