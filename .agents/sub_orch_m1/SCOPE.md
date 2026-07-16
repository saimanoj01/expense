# Scope: Milestone 1: Project Initialization & Infrastructure Setup

## Architecture
- React Single Page Application (SPA) using Vite, TypeScript, and Tailwind CSS.
- Storage Service (`src/services/storage.ts`) with a pluggable `StorageAdapter` interface.
- `LocalStorageAdapter` for mock/demo mode that uses browser `localStorage`.
- Basic application providers: `AuthContext` and `AppContext`.
- Routing setup to navigate between Project Selector and Dashboard.

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------------|--------|-----------------|
| 1 | Scaffolding | Initialize Vite + TS + Tailwind React SPA, configure Tailwind & PostCSS. | None | PLANNED | TBD |
| 2 | Codebase Layout | Create folders for components, services, context, hooks, utils, styles. | Scaffolding | PLANNED | TBD |
| 3 | Storage Adapter | Implement storage.ts with StorageAdapter interface, LocalStorageAdapter, and mock data pre-seeding. | Codebase Layout | PLANNED | TBD |
| 4 | Context & Providers | Implement AuthContext, AppContext, and basic routing / page navigation. | Storage Adapter | PLANNED | TBD |
| 5 | Verify & Build | Run build/test to verify compilation success. | Context & Providers | PLANNED | TBD |

## Interface Contracts
- See PROJECT.md for Transaction, Budget, Project, MonthlyLock, StorageAdapter.
