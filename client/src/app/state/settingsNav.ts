import { atom, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { SettingsPages } from '../features/settings';

const settingsPageAtom = atom<SettingsPages | null>(null);

export const useOpenSettingsPage = () => {
  const setSettingsPage = useSetAtom(settingsPageAtom);

  return useCallback((page: SettingsPages) => setSettingsPage(page), [setSettingsPage]);
};

export { settingsPageAtom };
