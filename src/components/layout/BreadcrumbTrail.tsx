import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';

interface BreadcrumbTrailProps {
  className?: string;
}

export const BreadcrumbTrail: React.FC<BreadcrumbTrailProps> = ({ className = '' }) => {
  const { breadcrumbs, navigate, goBack, canGoBack } = useNavigation();

  // If we are at Level 1 Overview with only 1 breadcrumb item, we still show the month indicator or a calm header
  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="breadcrumb-trail"
      className={`flex items-center flex-wrap gap-1.5 text-sm font-medium ${className}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {canGoBack && (
          <motion.button
            key="back-button"
            type="button"
            data-testid="breadcrumb-back-btn"
            onClick={goBack}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="inline-flex items-center gap-1 px-2.5 py-1 mr-1 rounded-lg text-xs font-semibold bg-secondary/80 hover:bg-secondary text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm active:scale-95"
            title="Go back (Escape or Alt + Left Arrow)"
            aria-label="Go back one level"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back</span>
          </motion.button>
        )}
      </AnimatePresence>

      <ol className="flex items-center flex-wrap gap-1.5 list-none p-0 m-0">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <React.Fragment key={item.id}>
              {index > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" aria-hidden="true" />
              )}
              <motion.li
                data-testid={`breadcrumb-item-${item.id}`}
                layout
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 2 }}
                transition={{ duration: 0.15 }}
                className="flex items-center"
              >
                {isLast ? (
                  <span
                    aria-current="page"
                    className="px-2 py-0.5 rounded-md font-semibold text-foreground bg-primary/10 text-primary border border-primary/20 text-xs sm:text-sm tracking-tight"
                  >
                    {item.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(item.route)}
                    className="px-2 py-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent text-xs sm:text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
