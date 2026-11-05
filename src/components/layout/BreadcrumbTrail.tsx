import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';

interface BreadcrumbTrailProps {
  className?: string;
}

function formatEyebrow(monthStr?: string): string {
  if (!monthStr || monthStr === 'all') return 'ALL TIME';
  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    const [yStr, mStr] = monthStr.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const date = new Date(Date.UTC(y, m - 1, 1));
    const label = date
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .toUpperCase();
    const now = new Date();
    const currKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (monthStr === currKey) {
      const daysInMonth = new Date(y, m, 0).getDate();
      const daysLeft = Math.max(0, daysInMonth - now.getDate());
      return `${label} · ${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT`;
    }
    return label;
  }
  return monthStr.toUpperCase();
}

export const BreadcrumbTrail: React.FC<BreadcrumbTrailProps> = ({ className = '' }) => {
  const { currentRoute, breadcrumbs, navigate, goBack, canGoBack } = useNavigation();

  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="breadcrumb-trail"
      className={`flex items-center gap-1.5 text-body min-w-0 ${className}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {canGoBack && (
          <motion.button
            key="back-button"
            type="button"
            data-testid="breadcrumb-back-btn"
            onClick={goBack}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15 }}
            className="w-8 h-8 -ml-1 rounded-[10px] inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40 shrink-0"
            title="Go back (Escape or Alt + Left Arrow)"
            aria-label="Go back one level"
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <ol className="flex items-center flex-wrap gap-1.5 list-none p-0 m-0 min-w-0">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const isOverviewRoot = currentRoute.view === 'overview' && item.id === 'month-overview';

          return (
            <React.Fragment key={item.id}>
              {index > 0 && (
                <span className="text-faint select-none px-0.5" aria-hidden="true">
                  /
                </span>
              )}
              <motion.li
                data-testid={`breadcrumb-item-${item.id}`}
                layout
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
                className="flex items-center min-w-0"
              >
                {isOverviewRoot ? (
                  <span
                    aria-current="page"
                    className="text-eyebrow uppercase text-muted-foreground truncate"
                  >
                    {formatEyebrow(currentRoute.month)}
                    <span className="sr-only"> ({item.label})</span>
                  </span>
                ) : isLast ? (
                  <span
                    aria-current="page"
                    className="font-medium text-foreground text-body truncate"
                  >
                    {item.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(item.route)}
                    className="text-muted-foreground hover:text-foreground text-body transition-colors focus-visible:ring-2 ring-ring/40 rounded px-1 -mx-1 truncate"
                  >
                    {item.label}
                  </button>
                )}
              </motion.li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};
