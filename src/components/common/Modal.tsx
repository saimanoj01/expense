import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  ariaLabel?: string;
  dataTestId?: string;
  variant?: 'dialog' | 'sheet';
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
  overlayClassName?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  ariaLabel,
  dataTestId,
  variant = 'dialog',
  children,
  maxWidth = 'max-w-md',
  className = '',
  overlayClassName = '',
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const timer = setTimeout(() => {
      if (!modalRef.current) return;
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        modalRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => el.offsetParent !== null);

        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElementRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const isSheet = variant === 'sheet';

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title || 'Dialog'}
      data-testid={dataTestId}
      onClick={handleBackdropClick}
      tabIndex={-1}
      className={
        isSheet
          ? `fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end bg-background/60 backdrop-blur-sm ${overlayClassName}`
          : `fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm ${overlayClassName}`
      }
    >
      <motion.div
        initial={isSheet ? { opacity: 0, x: 24 } : { opacity: 0, scale: 0.95, y: 10 }}
        animate={isSheet ? { opacity: 1, x: 0 } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className={
          isSheet
            ? `w-full sm:w-[420px] sm:h-full max-h-[90vh] sm:max-h-screen rounded-t-[18px] sm:rounded-none sm:border-l border-t sm:border-t-0 border-border bg-popover p-6 shadow-2xl relative overflow-y-auto custom-scrollbar ${className}`
            : `bg-popover text-popover-foreground w-full ${maxWidth} rounded-[14px] p-6 shadow-2xl border border-border relative overflow-hidden ${className}`
        }
        onClick={e => e.stopPropagation()}
      >
        {isSheet && (
          <div className="sm:hidden w-10 h-1 rounded-full bg-border mx-auto mb-4" />
        )}
        {children}
      </motion.div>
    </div>
  );
}
