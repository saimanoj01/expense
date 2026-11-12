import { toast as sonnerToast } from 'sonner';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
  testId?: string;
}

export interface ToastOptions {
  duration?: number;
  action?: ToastAction;
}

export type ShowToastFn = (
  message: string,
  type?: ToastType,
  options?: ToastOptions
) => void;

/**
 * Global Sonner toast dispatcher conforming to design system tokens and testid contracts.
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  options?: ToastOptions
) {
  const isError =
    type === 'error' ||
    /fail|error|denied|offline|exceeded|cannot|invalid/i.test(message);

  sonnerToast.custom(
    id => (
      <div
        data-testid="notification-toast"
        className={`${
          isError
            ? 'notification-error bg-rose-500/95 border-rose-400/40 text-white'
            : 'notification-success bg-emerald-500/95 border-emerald-400/40 text-white'
        } py-3 px-5 rounded-2xl glass-card border font-medium shadow-xl shadow-black/25 flex items-center gap-3 backdrop-blur-md cursor-pointer`}
        onClick={() => sonnerToast.dismiss(id)}
      >
        <div className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
        <span className="text-sm font-semibold">{message}</span>
        {options?.action && (
          <button
            type="button"
            data-testid={options.action.testId || 'toast-action-btn'}
            onClick={e => {
              e.stopPropagation();
              options.action!.onClick();
              sonnerToast.dismiss(id);
            }}
            className="ml-1.5 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {options.action.label}
          </button>
        )}
      </div>
    ),
    {
      duration: options?.duration ?? (options?.action ? 6000 : 4000),
    }
  );
}

export { sonnerToast };
