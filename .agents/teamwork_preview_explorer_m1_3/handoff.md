# Handoff Report: Context Providers & Routing Strategy Design

## 1. Observation
We observed the following parameters and requirements across the input files and workspace:
- **Workspace State**: Search via `find_by_name` returned only `ORIGINAL_REQUEST.md`, confirming that no code files (`src/`) have been implemented yet for this subtask.
- **Mock Mode trigger**: `ORIGINAL_REQUEST.md` (lines 39-41) states:
  > "The application must support a Mock/Demo Mode that activates when no valid Google Client ID is configured in `.env.local` (or via a "Mock Login" toggle)."
- **Default Project creation requirement**: `ORIGINAL_REQUEST.md` (lines 14-15) states:
  > "Newly logged-in users must be prompted to create a default project if none exist."
- **Storage Contract**: `PROJECT.md` (lines 57-67) defines the `StorageAdapter` interface, specifying standard methods like `getProjects()` and `createProject(name: string)`.
- **Infrastructure Scope**: `SCOPE.md` (lines 5-8) outlines:
  > "- Basic application providers: `AuthContext` and `AppContext`.\n- Routing setup to navigate between Project Selector and Dashboard."

---

## 2. Logic Chain
1. **Client ID Dependency**: To determine whether real or mock mode runs, the frontend must inspect the environment variables on initialization. This configuration check is best isolated within `AuthContext` using `import.meta.env.VITE_GOOGLE_CLIENT_ID`.
2. **Storage Separation**: Because the system has two storage modes (local storage vs. Google sheets), `AppContext` should rely on a common `StorageAdapter` interface. By subscribing to the `isMockMode` boolean from `AuthContext`, the `AppContext` can dynamically instantiate the correct storage adapter subclass (e.g. `LocalStorageAdapter` or `GoogleSheetsAdapter`).
3. **Empty Project Handling**: R1 requires prompting users to create a default project when none exist. During the initialization phase of `AppContext`, checking if the loaded projects array is empty (`projects.length === 0`) allows the context to prompt user interaction on the Project Selector view.
4. **GitHub Pages Routing**: Standard browser routers trigger 404 errors on page refreshes in serverless deployments like GitHub Pages unless URL rewrites are configured. A custom state-based router (mapping `currentView` to `project-selector` or `dashboard`) synced with `window.location.hash` resolves this constraint cleanly with zero dependencies.

---

## 3. Caveats
- **Google SDK Load State**: The proposed `AuthContext` template assumes the external Google Identity Services script will be loaded globally. We have not fully scoped how the GIS client lifecycle or token expiry interacts with context state, which must be detailed when real Google OAuth is integrated in Milestone 4.
- **URL Parameter Parsing**: The state-to-hash synchronization script relies on basic search parameter parsing. If complex routes are introduced later (e.g. nested dashboard layouts), switching to `react-router-dom`'s `HashRouter` will be required.

---

## 4. Conclusion
We recommend:
1. **AuthContext**: Initialize `isMockMode` based on the existence of `import.meta.env.VITE_GOOGLE_CLIENT_ID` combined with the persisted configuration in `localStorage`.
2. **AppContext**: Implement a factory layout to swap between local storage and real sheets storage, and detect `projects.length === 0` to trigger the "create a default project" logic.
3. **Routing**: Employ a custom state-based router (`currentView` property in `AppContext`) coupled with a window hash listener for deep link compatibility on GitHub Pages.

---

## 5. Verification Method
1. Check the existence of `/Users/saimanojb/github/Expense Tracker and Budget Planning/.agents/teamwork_preview_explorer_m1_3/analysis.md` and confirm it contains the TS interface designs and detailed routing tables.
2. Confirm there are no source files written to any folders outside of the `.agents/teamwork_preview_explorer_m1_3` directory.
