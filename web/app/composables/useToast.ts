export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

let nextId = 1;

export function useToast() {
  const toasts = useState<Toast[]>('xv:toasts', () => []);

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function push(message: string, tone: ToastTone = 'info', ttl = 4200): number {
    const id = nextId++;
    toasts.value = [...toasts.value, { id, message, tone }];
    if (import.meta.client) window.setTimeout(() => dismiss(id), ttl);
    return id;
  }

  return {
    toasts,
    dismiss,
    push,
    success: (message: string) => push(message, 'success'),
    error: (message: string) => push(message, 'error', 6000),
    info: (message: string) => push(message, 'info'),
  };
}
