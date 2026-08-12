import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import Modal from './Modal';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ConfirmContextValue = {
  confirmDialog: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirmDialog = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirmDialog }}>
      {children}
      <Modal
        open={!!state}
        title={state?.title || 'Xác nhận'}
        onClose={() => close(false)}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => close(false)}>
              {state?.cancelText || 'Hủy'}
            </button>
            <button
              type="button"
              className={`btn ${state?.danger ? 'btn--danger' : 'btn--primary'}`}
              onClick={() => close(true)}
            >
              {state?.confirmText || 'Xác nhận'}
            </button>
          </>
        }
      >
        <p>{state?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}
