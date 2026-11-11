import React, { useEffect } from 'react';
import { Toaster } from 'sonner';
import { showToast } from '../../utils/toast';

export function AppLayout({
  children,
  toastMessage,
}: {
  children: React.ReactNode;
  toastMessage?: string | null;
}) {
  useEffect(() => {
    if (toastMessage) {
      showToast(toastMessage);
    }
  }, [toastMessage]);

  return (
    <div className="relative h-screen h-[100dvh] overflow-hidden bg-background text-foreground flex flex-col font-sans selection:bg-primary selection:text-primary-foreground">
      {/* Main Content Wrapper */}
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {children}
      </div>

      {/* Global Modern Toaster */}
      <Toaster
        visibleToasts={1}
        position="bottom-right"
        className="toaster-wrapper"
        toastOptions={{
          className: 'notification-toast',
        }}
      />
    </div>
  );
}
