import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { formatMonthLabel } from '../../utils/navigation';
import { spring } from '../../theme/motion';

interface BreadcrumbTrailProps {
  className?: string;
}

function formatEyebrow(monthStr?: string): { full: string; compact: string } {
  if (!monthStr || monthStr === 'all') {
    return {
      full: 'All Time',
      compact: 'All Time',
    };
  }
  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    const [yStr, mStr] = monthStr.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const label = formatMonthLabel(monthStr);
    const now = new Date();
    const currKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (monthStr === currKey) {
      const daysInMonth = new Date(y, m, 0).getDate();
      const daysLeft = Math.max(0, daysInMonth - now.getDate());
      if (daysLeft === 0) {
        return {
          full: `${label} · Last day`,
          compact: 'Overview · Last day',
        };
      }
      return {
        full: `${label} · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
        compact: `Overview · ${daysLeft}d left`,
      };
    }
    if (monthStr > currKey) {
      return {
        full: `${label} · Upcoming`,
        compact: 'Upcoming',
      };
    }
    return {
      full: label,
      compact: 'Overview',
    };
  }
  return {
    full: monthStr,
    compact: 'Overview',
  };
}

export const BreadcrumbTrail: React.FC<BreadcrumbTrailProps> = ({ className = '' }) => {
  const { currentRoute, breadcrumbs, navigate, goBack, canGoBack } = useNavigation();

  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="breadcrumb-trail"
      className={`flex items-center gap-1 lg:gap-1.5 text-label lg:text-body min-w-0 ${className}`}
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
            className="w-7 h-7 sm:w-8 sm:h-8 -ml-1 rounded-[10px] inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background shrink-0"
            title="Go back (Escape or Alt + Left Arrow)"
            aria-label="Go back one level"
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <ol className="flex items-center flex-nowrap gap-1 lg:gap-1.5 list-none p-0 m-0 min-w-0 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const isOverviewRoot = currentRoute.view === 'overview' && item.id === 'month-overview';
            const eyebrow = isOverviewRoot ? formatEyebrow(currentRoute.month) : null;
            const hideMobileRoot =
              breadcrumbs.length >= 2 && breadcrumbs[0]?.id === 'month-root';
            const isMobileHiddenRoot = index === 0 && hideMobileRoot;
            const isPostHiddenRootSlash = index === 1 && hideMobileRoot;

            return (
              <motion.li
                key={item.id}
                data-testid={`breadcrumb-item-${item.id}`}
                layout
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className={`${
                  isMobileHiddenRoot ? 'hidden md:flex' : 'flex'
                } items-center gap-1 lg:gap-1.5 min-w-0`}
              >
                {index > 0 && (
                  <span
                    className={`${
                      isPostHiddenRootSlash ? 'hidden md:inline ' : ''
                    }text-faint select-none px-0.5 shrink-0`}
                    aria-hidden="true"
                  >
                    /
                  </span>
                )}
                {isOverviewRoot && eyebrow ? (
                  <motion.span
                    layoutId="page-title"
                    layout="position"
                    transition={spring}
                    aria-current="page"
                    className="text-eyebrow uppercase text-muted-foreground truncate tabular-nums num"
                  >
                    <span className="sm:hidden">{eyebrow.compact}</span>
                    <span className="hidden sm:inline">{eyebrow.full}</span>
                  </motion.span>
                ) : isLast ? (
                  <motion.span
                    layoutId="page-title"
                    layout="position"
                    transition={spring}
                    aria-current="page"
                    className="font-medium text-foreground text-label lg:text-body truncate"
                  >
                    {item.label}
                  </motion.span>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(item.route)}
                    className="text-muted-foreground hover:text-foreground text-label lg:text-body transition-colors focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background rounded px-1 -mx-1 truncate"
                  >
                    {item.label}
                  </button>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </nav>
  );
};
