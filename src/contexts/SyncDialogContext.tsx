import { createContext, useContext } from 'solid-js';

export type SyncDialogContextValue = {
  openSyncDialog: () => void;
};

const SyncDialogContext = createContext<SyncDialogContextValue>({
  openSyncDialog: () => {},
});

export function useSyncDialog(): SyncDialogContextValue {
  const value = useContext(SyncDialogContext);

  return value ?? { openSyncDialog: () => {} };
}

export { SyncDialogContext };
