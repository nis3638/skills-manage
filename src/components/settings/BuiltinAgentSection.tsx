import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import {
  ExternalLink,
  Pencil,
  Search,
  CheckCircle2,
  Circle,
} from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AgentWithStatus, BuiltinAgentPathsPatch } from "@/types";
import { formatPathForDisplay } from "@/lib/path";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePlatformStore } from "@/stores/platformStore";
import { BuiltinAgentEditDialog } from "./BuiltinAgentEditDialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openLocation(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await invoke("open_in_file_manager", { path });
  } catch {
    /* surface no error — UI shows tooltip */
  }
}

interface RowProps {
  agent: AgentWithStatus;
  onEdit: (agent: AgentWithStatus) => void;
  onToggleEnabled: (agentId: string, enabled: boolean) => Promise<void>;
}

function BuiltinAgentRow({ agent, onEdit, onToggleEnabled }: RowProps) {
  const { t } = useTranslation();

  const installDisplay = agent.install_path ? formatPathForDisplay(agent.install_path) : null;
  const configDisplay = agent.config_path ? formatPathForDisplay(agent.config_path) : null;

  return (
    <div className="border-b border-border last:border-b-0 px-3 py-3 hover:bg-muted/20 transition-colors">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {agent.is_detected ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
          ) : (
            <Circle className="size-4 shrink-0 text-muted-foreground/50" />
          )}
          <span className="font-medium text-sm truncate">{agent.display_name}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5">
            {agent.category}
          </span>
          {agent.is_overridden && (
            <span
              className="text-[10px] text-amber-600 dark:text-amber-400 border border-amber-500/40 rounded px-1.5 py-0.5"
              title={t("settings.builtinAgent.overridden")}
            >
              {t("settings.builtinAgent.overridden")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={agent.is_enabled}
            onCheckedChange={(checked) => onToggleEnabled(agent.id, checked)}
            aria-label={
              agent.is_enabled
                ? t("settings.builtinAgent.disabled")
                : t("settings.builtinAgent.enabled")
            }
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(agent)}
            aria-label={t("settings.builtinAgent.edit")}
          >
            <Pencil className="size-3.5" />
            <span className="ml-1">{t("settings.builtinAgent.edit")}</span>
          </Button>
        </div>
      </div>

      <PathRow
        label={t("settings.builtinAgent.installPath")}
        value={installDisplay}
        onOpen={() => openLocation(agent.install_path)}
      />
      <PathRow
        label={t("settings.builtinAgent.configPath")}
        value={configDisplay}
        onOpen={() => openLocation(agent.config_path)}
      />
    </div>
  );
}

interface PathRowProps {
  label: string;
  value: string | null;
  onOpen: () => void;
}

function PathRow({ label, value, onOpen }: PathRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 ml-6 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      {value ? (
        <>
          <code className="font-mono text-foreground truncate min-w-0 flex-1" title={value}>
            {value}
          </code>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 shrink-0"
            onClick={onOpen}
            aria-label={t("settings.builtinAgent.open")}
          >
            <ExternalLink className="size-3" />
            <span className="ml-1">{t("settings.builtinAgent.open")}</span>
          </Button>
        </>
      ) : (
        <span className="italic text-muted-foreground">
          {t("settings.builtinAgent.unset")}
        </span>
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function BuiltinAgentSection() {
  const { t } = useTranslation();
  const agents = usePlatformStore((s) => s.agents);
  const refreshAgents = usePlatformStore((s) => s.refreshCounts);

  const updateBuiltinAgentPaths = useSettingsStore((s) => s.updateBuiltinAgentPaths);
  const resetBuiltinAgentPaths = useSettingsStore((s) => s.resetBuiltinAgentPaths);
  const setAgentEnabled = useSettingsStore((s) => s.setAgentEnabled);

  const [search, setSearch] = useState("");
  const [detectedOnly, setDetectedOnly] = useState(false);
  const [editing, setEditing] = useState<AgentWithStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const builtin = useMemo(() => agents.filter((a) => a.is_builtin), [agents]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return builtin.filter((a) => {
      if (detectedOnly && !a.is_detected) return false;
      if (!q) return true;
      return (
        a.display_name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
      );
    });
  }, [builtin, search, detectedOnly]);

  // Group by category for visual segmentation.
  const grouped = useMemo(() => {
    const groups: Record<string, AgentWithStatus[]> = {};
    for (const a of filtered) {
      (groups[a.category] ||= []).push(a);
    }
    return groups;
  }, [filtered]);

  const categoryLabel = (cat: string): string => {
    switch (cat) {
      case "coding":
        return t("settings.builtinAgent.categoryCoding");
      case "lobster":
        return t("settings.builtinAgent.categoryLobster");
      case "central":
        return t("settings.builtinAgent.categoryCentral");
      default:
        return cat;
    }
  };

  function handleOpenEdit(agent: AgentWithStatus) {
    setEditing(agent);
    setDialogOpen(true);
    setError(null);
  }

  async function handleSubmit(patch: BuiltinAgentPathsPatch) {
    if (!editing) return;
    await updateBuiltinAgentPaths(editing.id, patch);
    await refreshAgents();
  }

  async function handleReset() {
    if (!editing) return;
    await resetBuiltinAgentPaths(editing.id);
    await refreshAgents();
  }

  async function handleToggleEnabled(agentId: string, enabled: boolean) {
    setError(null);
    try {
      await setAgentEnabled(agentId, enabled);
      await refreshAgents();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.builtinAgent.title")}</CardTitle>
        <CardDescription className="mt-1">
          {t("settings.builtinAgent.subtitle")}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap gap-3 items-center mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("settings.builtinAgent.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
            <input
              type="checkbox"
              className="cursor-pointer"
              checked={detectedOnly}
              onChange={(e) => setDetectedOnly(e.target.checked)}
            />
            {t("settings.builtinAgent.filterDetected")}
          </label>
          <span className="text-xs text-muted-foreground">
            {filtered.length} / {builtin.length}
          </span>
        </div>

        {error && (
          <p className="text-xs text-destructive mb-3" role="alert">
            {error}
          </p>
        )}

        {Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {/* re-use existing key */}
            {t("settings.noPlatforms")}
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-2">
                  <span>{categoryLabel(cat)}</span>
                  <span className="text-muted-foreground/60">({list.length})</span>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  {list.map((agent) => (
                    <BuiltinAgentRow
                      key={agent.id}
                      agent={agent}
                      onEdit={handleOpenEdit}
                      onToggleEnabled={handleToggleEnabled}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <BuiltinAgentEditDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        agent={editing}
        onSubmit={handleSubmit}
        onReset={handleReset}
      />
    </Card>
  );
}
