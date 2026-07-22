import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function AppLayout({ children, toastMessage }: { children: React.ReactNode, toastMessage: string | null }) {
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

      {/* Global Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            data-testid="notification-toast"
            className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 py-3 px-6 rounded-2xl glass-card border border-primary/30 text-white font-medium shadow-glow-cyan flex items-center gap-3 bg-emerald-500/90 backdrop-blur-md"
          >
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
