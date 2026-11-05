import { toast as sonnerToast } from 'sonner';

export type ToastType = 'success' | 'error' | 'info';

/**
 * Global Sonner toast dispatcher conforming to design system tokens and testid contracts.
 */
export function showToast(message: string, type: ToastType = 'info') {
  const isError = type === 'error' || /fail|error|denied|offline|exceeded|cannot|invalid/i.test(message);

  sonnerToast.custom(
    (id) => (
      <div
        data-testid="notification-toast"
        className={`${
          isError
            ? 'notification-error bg-rose-500/95 border-rose-400/40 text-white'
            : 'notification-success bg-emerald-500/95 border-emerald-400/40 text-white'
        } py-3 px-6 rounded-2xl glass-card border font-medium shadow-xl shadow-black/25 flex items-center gap-3 backdrop-blur-md cursor-pointer`}
        onClick={() => sonnerToast.dismiss(id)}
      >
        <div className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
        <span className="text-sm font-semibold">{message}</span>
      </div>
    ),
    {
      duration: 4000,
    }
  );
}

export { sonnerToast };
