import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface ToastItem {
  id: string;
  message: string;
  tone?: 'info' | 'success' | 'danger' | 'xp';
}


interface ToastContextValue {
  toasts: ToastItem[];
  push: (message: string, tone?: ToastItem['tone']) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastItem['tone'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'pointer-events-auto rounded-2xl border px-3 py-2 text-sm shadow-lg backdrop-blur',
              t.tone === 'xp'
                ? 'border-moss/50 bg-ink-2/95 text-moss pulse-moss'
                : t.tone === 'success'
                  ? 'border-moss/40 bg-ink-2/95 text-moss'
                  : t.tone === 'danger'
                    ? 'border-danger/40 bg-ink-2/95 text-danger'
                    : 'border-pine-soft/50 bg-ink-2/95 text-mist',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <p>{t.message}</p>
              <button
                type="button"
                className="text-fog hover:text-mist text-xs"
                onClick={() => dismiss(t.id)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast requires ToastProvider');
  return ctx;
}
