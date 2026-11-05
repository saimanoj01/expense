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
    <div className="relative min-h-screen bg-background text-foreground flex flex-col font-sans overflow-x-hidden selection:bg-primary selection:text-primary-foreground">
      {/* Dynamic Background Mesh */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/10 blur-[120px]" />
      </div>

      {/* Main Content Wrapper */}
      <div className="relative z-10 flex flex-col min-h-screen">
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
