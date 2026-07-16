# Project Scaffolding Analysis & Recommendations

This analysis outlines the recommended configuration and scaffolding files for initializing the Vite, React, TypeScript, and Tailwind CSS project. It follows a dark-first, glassmorphism-based UI design and integrates the necessary structures to support the E2E testing harness, local storage mock database, and Google OAuth integrations.

---

## 1. Setup & Scaffolding Commands

Since the project directory is already initialized with `.agents/` and other files, we must set up the project without using tools that assume an empty folder, or clean/proceed carefully. We recommend the **Manual File Writing approach** as the most stable and deterministic method:

1. Create directory paths:
   ```bash
   mkdir -p src/components src/services src/context src/hooks src/utils src/styles tests/pages tests/specs public
   ```
2. Write the configuration files (`package.json`, `tsconfig.json`, `vite.config.ts`, `postcss.config.js`, `tailwind.config.js`, `.eslintrc.cjs`, `playwright.config.ts`) directly into the root directory.
3. Execute dependency installation:
   ```bash
   npm install
   ```

Alternatively, using the Vite CLI utility:
```bash
# This will warn about non-empty directory. Choose to proceed and merge.
npm create vite@latest . -- --template react-ts
npm install -D tailwindcss postcss autoprefixer @types/node @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint eslint-plugin-react-hooks eslint-plugin-react-refresh @playwright/test
npm install lucide-react
npx tailwindcss init -p
```

---

## 2. Directory Layout Recommendations

To support all milestones of the roadmap, the application folder structure must follow this format:

```text
/Users/saimanojb/github/Expense Tracker and Budget Planning/
├── .agents/                 # AI agent metadata
├── public/                  # Static assets
│   └── vite.svg
├── src/
│   ├── components/          # React components
│   │   ├── Common/          # Shared components (buttons, modals, tooltips)
│   │   ├── Dashboard/       # Dashboard shell and layout elements
│   │   ├── Charts/          # Native SVG charts (Pie, Trend, Budget bars)
│   │   ├── Forms/           # Transaction entry and configuration panels
│   │   └── CSVWizard/       # CSV column mapper and verification controls
│   ├── services/            # API & external layers
│   │   ├── storage.ts       # Storage interface and LocalStorageAdapter
│   │   ├── googleApi.ts     # Google Drive, Sheets, Gmail API wrapper
│   │   └── llm.ts           # Gemini and Claude API stubs
│   ├── context/             # React state context providers
│   │   ├── AppContext.tsx   # Global project state, active selection
│   │   └── AuthContext.tsx  # Auth state, login checks, mock mode toggles
│   ├── hooks/               # React custom hooks
│   ├── utils/               # Utilities (CSV parser, SHA-256 hash, Date utilities)
│   ├── styles/              # Animations and global layout definitions
│   ├── main.tsx             # React SPA mounting point
│   ├── App.tsx              # Root component & page router
│   └── index.css            # Tailwind directives and custom variables/glass styles
├── tests/                   # Playwright E2E tests
│   ├── pages/               # Page Object Models (POMs) for tests
│   └── specs/               # Test suites (Tiers 1-4)
├── index.html               # Main index document
├── package.json             # NPM package scripts & dependencies
├── vite.config.ts           # Vite bundler parameters
├── tsconfig.json            # Unified TypeScript configuration
├── tailwind.config.js       # Tailwind theme and custom gradient declarations
├── postcss.config.js        # PostCSS configurations
├── .eslintrc.cjs            # Linting constraints
└── playwright.config.ts     # E2E runner configuration
```

---

## 3. Recommended Configuration Files

### 3.1. `package.json`
Specifies clean, locked dependencies compatible with React 18, TypeScript, Tailwind CSS, and Playwright.

```json
{
  "name": "expense-tracker-budget-planning",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 3000",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.395.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.1",
    "@types/node": "^20.12.12",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^7.10.0",
    "@typescript-eslint/parser": "^7.10.0",
    "@vitejs/plugin-react": "^5.1.1",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-plugin-react-hooks": "^4.6.2",
    "eslint-plugin-react-refresh": "^0.4.7",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.2.2",
    "vite": "^5.2.11"
  }
}
```

### 3.2. `vite.config.ts`
Enables React, defines the server port (3000), and creates path aliases (`@/` mapping to `src/`).

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

### 3.3. `tsconfig.json`
A unified TypeScript config file ensuring correct type assertions, module resolution for bundlers, strict compiler parameters, and matching path aliases.

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Path Aliases */
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "vite.config.ts", "playwright.config.ts", "tests"]
}
```

### 3.4. `postcss.config.js`
Standard configuration for Tailwind preprocessing.

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### 3.5. `tailwind.config.js`
Optimized for custom HSL color definitions, dark-first premium styles, glow highlights, glassmorphic box shadows, and keyframe animations.

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        glow: {
          cyan: "#00f3ff",
          purple: "#d300ff",
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-glow': '0 0 15px rgba(0, 243, 255, 0.15)',
        'glass-glow-purple': '0 0 15px rgba(211, 0, 255, 0.15)',
        'glow-cyan': '0 0 10px rgba(0, 243, 255, 0.5)',
        'glow-purple': '0 0 10px rgba(211, 0, 255, 0.5)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
```

### 3.6. `.eslintrc.cjs`
Adheres strictly to the "Zero-Error Build" requirement, enforcing standard rules for React and TypeScript.

```javascript
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
}
```

### 3.7. `playwright.config.ts`
Specifies E2E configuration to spin up the dev server on port 3000 and run tests against Desktop Chrome, Firefox, and WebKit (Safari).

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

---

## 4. Initial Scaffolding Source Files

### 4.1. `index.html`
Responsive viewport settings optimized for 320px screens up to large monitors, default-enabling dark mode styling via the `dark` class on the `<html>` element.

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0" />
    <meta name="description" content="Decentralized Expense Tracker & Budget Planning app running serverless with Google Workspace integration." />
    <title>Expense Tracker & Budget Planning</title>
  </head>
  <body class="bg-background text-foreground min-h-screen font-sans selection:bg-primary selection:text-primary-foreground custom-scrollbar overflow-x-hidden">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 4.2. `src/main.tsx`
Standard bootstrapper rendering App component in StrictMode.

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

### 4.3. `src/index.css`
Declares the Tailwind directives, HSL variables for dark/light mode toggle support, and helper utility classes for glassmorphic elements, glow text effects, and custom webkit scrollbars.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Base configuration defaults to Dark-First HSL variables */
    --background: 224 71% 4%;
    --foreground: 213 31% 91%;
    --card: 224 71% 4%;
    --card-foreground: 213 31% 91%;
    --popover: 224 71% 4%;
    --popover-foreground: 213 31% 91%;
    --primary: 180 100% 50%; /* Cyan neon accent */
    --primary-foreground: 222.2 47.4% 1.2%;
    --secondary: 270 100% 60%; /* Purple neon accent */
    --secondary-foreground: 210 40% 98%;
    --muted: 223 47% 11%;
    --muted-foreground: 215.4 16.3% 56.9%;
    --accent: 216 34% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 210 40% 98%;
    --border: 216 34% 17%;
    --input: 216 34% 17%;
    --ring: 180 100% 50%;
    --radius: 0.75rem;
  }

  /* Optional class to support Light Mode override */
  .light {
    --background: 210 20% 98%;
    --foreground: 224 71% 4%;
    --card: 0 0% 100%;
    --card-foreground: 224 71% 4%;
    --popover: 0 0% 100%;
    --popover-foreground: 224 71% 4%;
    --primary: 180 100% 35%;
    --primary-foreground: 210 40% 98%;
    --secondary: 270 100% 50%;
    --secondary-foreground: 210 40% 98%;
    --muted: 220 14.3% 95.9%;
    --muted-foreground: 220 8.9% 46.1%;
    --accent: 220 14.3% 95.9%;
    --accent-foreground: 224 71% 4%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 180 100% 35%;
  }
}

@layer utilities {
  /* Glassmorphism layouts */
  .glass-panel {
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .glass-panel-light {
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(0, 0, 0, 0.08);
  }

  .glass-card {
    background: rgba(30, 41, 59, 0.3);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
  }

  /* Neon text-shadow styles */
  .text-glow-cyan {
    text-shadow: 0 0 10px rgba(0, 243, 255, 0.4);
  }

  .text-glow-purple {
    text-shadow: 0 0 10px rgba(211, 0, 255, 0.4);
  }

  /* Compact customized scrollbar for cyberpunk look */
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(15, 23, 42, 0.5);
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(0, 243, 255, 0.3);
    border-radius: 3px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 243, 255, 0.6);
  }
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 4.4. `src/App.tsx`
This implementation hooks directly into both potential layout views: the Project Selector and the main dashboard view. It uses `lucide-react` icons and embeds key standard `data-testid` handles (e.g., `create-project-btn`, `google-login-btn`, `chart-svg-budget`) so E2E test scripts can run seamlessly.

```typescript
import React, { useState } from 'react';
import { Shield, Sparkles, FolderOpen, Sun, Moon } from 'lucide-react';

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [currentView, setCurrentView] = useState<'project-selector' | 'dashboard'>('project-selector');

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    const root = window.document.documentElement;
    if (nextTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  };

  return (
    <div className="min-h-screen transition-colors duration-300 bg-background text-foreground flex flex-col">
      {/* Header Panel */}
      <header className="glass-panel sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-glass">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/30">
            <Sparkles className="h-6 w-6 text-primary animate-pulse-glow" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-glow-cyan">NEBULA EXPENSE</h1>
            <p className="text-xs text-muted-foreground">Decentralized Budget Planning</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full border border-border bg-accent/20 hover:bg-accent/40 transition-colors"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5 text-yellow-400" /> : <Moon className="h-5 w-5 text-indigo-500" />}
          </button>
          
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
            <Shield className="h-4 w-4" />
            <span>Mock/Demo Mode</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-7xl mx-auto w-full">
        {currentView === 'project-selector' ? (
          <div className="glass-card max-w-lg w-full p-8 rounded-2xl flex flex-col gap-6 text-center animate-slide-up">
            <div className="mx-auto p-4 rounded-full bg-secondary/10 border border-secondary/30 text-secondary w-fit">
              <FolderOpen className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-glow-purple mb-2">Select or Create a Project</h2>
              <p className="text-sm text-muted-foreground">
                Get started by initializing a new local project or connect your Google Workspace.
              </p>
            </div>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-95 transition-all shadow-glow-cyan"
                data-testid="create-project-btn"
              >
                Create Default Mock Project
              </button>
              
              <button 
                className="w-full py-3 px-4 rounded-xl border border-border bg-accent/10 hover:bg-accent/20 transition-all text-sm font-medium"
                data-testid="google-login-btn"
              >
                Sign In with Google
              </button>
            </div>
          </div>
        ) : (
          <div className="glass-card w-full p-8 rounded-2xl flex flex-col gap-6 animate-slide-up">
            <div className="flex justify-between items-center border-b border-border pb-4">
              <div>
                <h2 className="text-2xl font-extrabold text-glow-cyan">Project: Default Mock Project</h2>
                <p className="text-xs text-muted-foreground">Local Storage DB Session</p>
              </div>
              <button 
                onClick={() => setCurrentView('project-selector')}
                className="py-1.5 px-3 rounded-lg border border-border text-sm hover:bg-accent/20 transition-all"
              >
                Back to Selector
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* KPI Cards */}
              <div className="p-5 rounded-xl border border-border bg-accent/5">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Total Budget</p>
                <p className="text-3xl font-extrabold mt-1 text-glow-purple">$0.00</p>
              </div>
              <div className="p-5 rounded-xl border border-border bg-accent/5">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Expenses</p>
                <p className="text-3xl font-extrabold mt-1 text-rose-500">$0.00</p>
              </div>
              <div className="p-5 rounded-xl border border-border bg-accent/5">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Remaining</p>
                <p className="text-3xl font-extrabold mt-1 text-emerald-500">$0.00</p>
              </div>
            </div>

            {/* Dashboard SVG Chart Placeholder */}
            <div className="p-6 rounded-xl border border-border bg-accent/5 flex flex-col items-center gap-4">
              <span className="text-sm text-muted-foreground font-semibold">SVG Chart Visualization Placeholder</span>
              <svg className="w-full max-w-md h-32" data-testid="chart-svg-budget">
                <rect width="100%" height="100%" fill="rgba(255,255,255,0.02)" rx="8" />
                <text x="50%" y="55%" textAnchor="middle" fill="currentColor" className="text-muted-foreground text-xs">
                  Chart Will Be Drawn Natively with SVG
                </text>
              </svg>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="glass-panel mt-auto py-4 text-center border-t border-border/40 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Nebula Expense. All data stored locally in browser session.
      </footer>
    </div>
  );
}

export default App;
```
