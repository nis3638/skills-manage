import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentWithStatus, BuiltinAgentPathsPatch } from "@/types";
import { formatPathForDisplay } from "@/lib/path";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BuiltinAgentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentWithStatus | null;
  /** Submit handler — receives the patch to apply. */
  onSubmit: (patch: BuiltinAgentPathsPatch) => Promise<void>;
  /** Reset handler — restores code defaults. */
  onReset: () => Promise<void>;
}

/**
 * Information-maintenance dialog for built-in agents.
 *
 * Only `install_path` and `config_path` are editable. All other fields
 * (display_name, category, icon, global_skills_dir, ...) are immutable for
 * built-in agents and are not exposed here.
 */
export function BuiltinAgentEditDialog({
  open,
  onOpenChange,
  agent,
  onSubmit,
  onReset,
}: BuiltinAgentEditDialogProps) {
  const { t } = useTranslation();

  const [installPath, setInstallPath] = useState("");
  const [configPath, setConfigPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the dialog opens or the agent changes.
  useEffect(() => {
    if (open && agent) {
      setInstallPath(formatPathForDisplay(agent.install_path ?? ""));
      setConfigPath(formatPathForDisplay(agent.config_path ?? ""));
      setError(null);
    }
  }, [open, agent]);

  if (!agent) return null;

  const trimmedInstall = installPath.trim();
  const trimmedConfig = configPath.trim();
  const initialInstall = formatPathForDisplay(agent.install_path ?? "");
  const initialConfig = formatPathForDisplay(agent.config_path ?? "");
  const installDirty = trimmedInstall !== initialInstall.trim();
  const configDirty = trimmedConfig !== initialConfig.trim();
  const dirty = installDirty || configDirty;

  function validate(p: string): boolean {
    if (!p) return true; // empty == clear
    return p.startsWith("/") || p.startsWith("~/") || p === "~";
  }

  async function handleSubmit() {
    if (!validate(trimmedInstall) || !validate(trimmedConfig)) {
      setError(t("settings.builtinAgent.errorAbsolutePath"));
      return;
    }
    const patch: BuiltinAgentPathsPatch = {};
    if (installDirty) {
      patch.install_path_provided = true;
      patch.install_path = trimmedInstall || null;
    }
    if (configDirty) {
      patch.config_path_provided = true;
      patch.config_path = trimmedConfig || null;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(patch);
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset() {
    if (!confirm(t("settings.builtinAgent.resetConfirm", { name: agent!.display_name }))) {
      return;
    }
    setIsResetting(true);
    setError(null);
    try {
      await onReset();
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("settings.builtinAgent.editDialogTitle", { name: agent.display_name })}
          </DialogTitle>
          <DialogClose />
        </DialogHeader>

        <DialogBody className="space-y-5">
          <DialogDescription>
            {t("settings.builtinAgent.editDialogDesc")}
          </DialogDescription>

          {/* Install path */}
          <div className="space-y-1.5">
            <label htmlFor="bia-install" className="text-sm font-medium">
              {t("settings.builtinAgent.installPath")}
            </label>
            <Input
              id="bia-install"
              placeholder="/Applications/Cursor.app"
              value={installPath}
              onChange={(e) => setInstallPath(e.target.value)}
              disabled={isSubmitting || isResetting}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.builtinAgent.installPathHint")}
            </p>
          </div>

          {/* Config path */}
          <div className="space-y-1.5">
            <label htmlFor="bia-config" className="text-sm font-medium">
              {t("settings.builtinAgent.configPath")}
            </label>
            <Input
              id="bia-config"
              placeholder="~/.claude/CLAUDE.md"
              value={configPath}
              onChange={(e) => setConfigPath(e.target.value)}
              disabled={isSubmitting || isResetting}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.builtinAgent.configPathHint")}
            </p>
          </div>

          {/* Read-only metadata, for context */}
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
            <div>
              <span className="font-medium">ID:</span> {agent.id}
            </div>
            <div>
              <span className="font-medium">{t("settings.builtinAgent.categoryCoding").replace(/[ a-zA-Z]+/, "")}:</span>{" "}
              {agent.category}
            </div>
            <div>
              <span className="font-medium">global_skills_dir:</span>{" "}
              {formatPathForDisplay(agent.global_skills_dir)}
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isSubmitting || isResetting || !agent.is_overridden}
            title={
              !agent.is_overridden
                ? undefined
                : t("settings.builtinAgent.resetConfirm", { name: agent.display_name })
            }
          >
            {isResetting ? <Loader2 className="size-3.5 animate-spin" /> : null}
            <span>{t("settings.builtinAgent.reset")}</span>
          </Button>
          <div className="grow" />
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isResetting}
          >
            {t("settings.builtinAgent.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || isResetting || !dirty}>
            {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
            <span>{t("settings.builtinAgent.save")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
