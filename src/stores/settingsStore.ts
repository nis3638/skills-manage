import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  ScanDirectory,
  AgentWithStatus,
  CustomAgentConfig,
  UpdateCustomAgentConfig,
  BuiltinAgentPathsPatch,
} from "@/types";

// ─── State ────────────────────────────────────────────────────────────────────

interface SettingsState {
  scanDirectories: ScanDirectory[];
  isLoadingScanDirs: boolean;
  error: string | null;
  githubPat: string;
  isLoadingGitHubPat: boolean;
  isSavingGitHubPat: boolean;

  // Actions — scan directories
  loadScanDirectories: () => Promise<void>;
  addScanDirectory: (path: string, label?: string) => Promise<ScanDirectory>;
  removeScanDirectory: (id: number) => Promise<void>;
  toggleScanDirectory: (id: number, active: boolean) => Promise<void>;
  updateScanDirectoryPath: (id: number, newPath: string) => Promise<string>;

  // Actions — GitHub PAT
  loadGitHubPat: () => Promise<void>;
  saveGitHubPat: (value: string) => Promise<void>;
  clearGitHubPat: () => Promise<void>;

  // Actions — custom agents
  addCustomAgent: (config: CustomAgentConfig) => Promise<AgentWithStatus>;
  updateCustomAgent: (agentId: string, config: UpdateCustomAgentConfig) => Promise<AgentWithStatus>;
  removeCustomAgent: (agentId: string) => Promise<void>;

  // Actions — builtin agents (info maintenance: install_path / config_path)
  updateBuiltinAgentPaths: (
    agentId: string,
    patch: BuiltinAgentPathsPatch,
  ) => Promise<AgentWithStatus>;
  resetBuiltinAgentPaths: (agentId: string) => Promise<AgentWithStatus>;
  setAgentEnabled: (agentId: string, enabled: boolean) => Promise<AgentWithStatus>;

  clearError: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>((set) => ({
  scanDirectories: [],
  isLoadingScanDirs: false,
  error: null,
  githubPat: "",
  isLoadingGitHubPat: false,
  isSavingGitHubPat: false,

  // ── Scan Directories ───────────────────────────────────────────────────────

  /**
   * Load all scan directories from the backend.
   */
  loadScanDirectories: async () => {
    set({ isLoadingScanDirs: true, error: null });
    try {
      const dirs = await invoke<ScanDirectory[]>("get_scan_directories");
      set({ scanDirectories: dirs, isLoadingScanDirs: false });
    } catch (err) {
      set({ error: String(err), isLoadingScanDirs: false });
    }
  },

  /**
   * Add a new custom scan directory.
   * Returns the created ScanDirectory or throws on error.
   */
  addScanDirectory: async (path: string, label?: string) => {
    const dir = await invoke<ScanDirectory>("add_scan_directory", {
      path,
      label: label || null,
    });
    // Refresh the list
    set((state) => ({
      scanDirectories: [...state.scanDirectories, dir],
    }));
    return dir;
  },

  /**
   * Remove a custom scan directory by id.
   */
  removeScanDirectory: async (id: number) => {
    await invoke<void>("remove_scan_directory", { id });
    set((state) => ({
      scanDirectories: state.scanDirectories.filter((d) => d.id !== id),
    }));
  },

  /**
   * Toggle the active state of a scan directory (built-in or custom).
   * Persists the change to the backend database.
   */
  toggleScanDirectory: async (id: number, active: boolean) => {
    await invoke<void>("set_scan_directory_active", { id, isActive: active });
    set((state) => ({
      scanDirectories: state.scanDirectories.map((d) =>
        d.id === id ? { ...d, is_active: active } : d
      ),
    }));
  },

  /**
   * Update the `path` of a scan directory (built-in or custom) by id.
   * Returns the persisted (expanded) path.
   */
  updateScanDirectoryPath: async (id: number, newPath: string) => {
    const persistedPath = await invoke<string>("update_scan_directory_path", {
      id,
      newPath,
    });
    set((state) => ({
      scanDirectories: state.scanDirectories.map((d) =>
        d.id === id ? { ...d, path: persistedPath } : d
      ),
    }));
    return persistedPath;
  },

  // ── GitHub PAT ────────────────────────────────────────────────────────────

  loadGitHubPat: async () => {
    set({ isLoadingGitHubPat: true, error: null });
    try {
      const value = await invoke<string | null>("get_setting", { key: "github_pat" });
      set({
        githubPat: value ?? "",
        isLoadingGitHubPat: false,
      });
    } catch (err) {
      set({
        error: String(err),
        isLoadingGitHubPat: false,
      });
    }
  },

  saveGitHubPat: async (value: string) => {
    set({ isSavingGitHubPat: true, error: null });
    try {
      await invoke("set_setting", { key: "github_pat", value });
      set({
        githubPat: value.trim(),
        isSavingGitHubPat: false,
      });
    } catch (err) {
      set({
        error: String(err),
        isSavingGitHubPat: false,
      });
      throw err;
    }
  },

  clearGitHubPat: async () => {
    set({ isSavingGitHubPat: true, error: null });
    try {
      await invoke("set_setting", { key: "github_pat", value: "" });
      set({
        githubPat: "",
        isSavingGitHubPat: false,
      });
    } catch (err) {
      set({
        error: String(err),
        isSavingGitHubPat: false,
      });
      throw err;
    }
  },

  // ── Custom Agents ──────────────────────────────────────────────────────────

  /**
   * Register a new user-defined agent.
   * Returns the created AgentWithStatus or throws on error.
   */
  addCustomAgent: async (config: CustomAgentConfig) => {
    const agent = await invoke<AgentWithStatus>("add_custom_agent", { config });
    return agent;
  },

  /**
   * Update an existing user-defined agent.
   * Returns the updated AgentWithStatus or throws on error.
   */
  updateCustomAgent: async (agentId: string, config: UpdateCustomAgentConfig) => {
    const agent = await invoke<AgentWithStatus>("update_custom_agent", {
      agentId,
      config,
    });
    return agent;
  },

  /**
   * Remove a user-defined agent by ID.
   */
  removeCustomAgent: async (agentId: string) => {
    await invoke<void>("remove_custom_agent", { agentId });
  },

  // ── Builtin Agents (info maintenance) ──────────────────────────────────────

  /**
   * Update a builtin agent's program path (`install_path`) and/or
   * configuration path (`config_path`). Marks the agent as overridden so
   * future re-seeds preserve the user's values.
   */
  updateBuiltinAgentPaths: async (agentId, patch) => {
    return await invoke<AgentWithStatus>("update_builtin_agent_paths", {
      agentId,
      patch,
    });
  },

  /**
   * Reset a builtin agent's path fields back to the code-defined defaults
   * and clear `is_overridden`.
   */
  resetBuiltinAgentPaths: async (agentId) => {
    return await invoke<AgentWithStatus>("reset_builtin_agent_paths", {
      agentId,
    });
  },

  /**
   * Enable or disable an agent (works for both builtin and custom).
   */
  setAgentEnabled: async (agentId, enabled) => {
    return await invoke<AgentWithStatus>("set_agent_enabled", {
      agentId,
      enabled,
    });
  },

  // ── Misc ───────────────────────────────────────────────────────────────────

  clearError: () => set({ error: null }),
}));
