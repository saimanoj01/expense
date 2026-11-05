import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { softSpring } from '../../theme/motion';

export interface RollingNumberProps {
  value: string;
  srSuffix?: string;
  className?: string;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export const RollingNumber: React.FC<RollingNumberProps> = ({
  value,
  srSuffix,
  className = '',
}) => {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <span className={className}>
        {value}
        {srSuffix && <span className="text-[0.55em] opacity-70 font-normal">{srSuffix}</span>}
      </span>
    );
  }

  const chars = Array.from(value);

  return (
    <span className={`inline-flex items-baseline tabular-nums num ${className}`}>
      {chars.map((char, idx) => {
        const posFromRight = chars.length - 1 - idx;
        if (!/^\d$/.test(char)) {
          return (
            <span key={`sep-${posFromRight}-${char}`} className="inline-block">
              {char}
            </span>
          );
        }

        const digit = parseInt(char, 10);
        return (
          <span
            key={`digit-${posFromRight}`}
            className="inline-block h-[1em] leading-[1em] overflow-hidden align-baseline"
          >
            <motion.span
              initial={false}
              animate={{ y: `${-digit}em` }}
              transition={{
                ...softSpring,
                delay: Math.min(posFromRight * 0.02, 0.12),
              }}
              className="flex flex-col leading-[1em]"
            >
              {DIGITS.map(n =>
                n === digit ? (
                  <span
                    key={n}
                    className="h-[1em] leading-[1em] flex items-center justify-center"
                  >
                    {n}
                  </span>
                ) : (
                  <span
                    key={n}
                    data-digit={n}
                    aria-hidden="true"
                    className="h-[1em] leading-[1em] flex items-center justify-center before:content-[attr(data-digit)] select-none"
                  />
                )
              )}
            </motion.span>
          </span>
        );
      })}
      {srSuffix && <span className="text-[0.55em] opacity-70 font-normal">{srSuffix}</span>}
    </span>
  );
};
