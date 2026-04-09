# User Testing

## Validation Surface

**Primary surface:** Tauri v2 desktop app webview, accessible at `http://localhost:1420` during `pnpm tauri dev`.

**Testing tool:** `agent-browser` — connects to the Vite dev server URL to interact with the React UI.

**Setup requirements:**
1. `pnpm tauri dev` must be running (starts both Vite and Tauri)
2. Wait for the webview to load at localhost:1420
3. The scanner runs automatically on startup — wait for sidebar to populate before testing

**Known constraints:**
- Tauri file dialogs (import/export) cannot be tested via agent-browser; test the underlying logic via the UI state changes instead.
- Symlink creation requires actual filesystem access — tests should use a controlled test fixture directory.

## Validation Concurrency

**Machine:** macOS, 48 GB RAM, 12 CPU cores.

**agent-browser surface:**
- Tauri dev server: ~200 MB RAM
- Each agent-browser instance: ~300 MB RAM
- Available headroom (70% of free): ~29 GB
- **Max concurrent validators: 5**
