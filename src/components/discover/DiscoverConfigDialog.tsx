import { Radar, Loader2, AlertTriangle, Plus, X, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useDiscoverStore } from "@/stores/discoverStore";
import { usePlatformStore } from "@/stores/platformStore";
import { ScanRoot } from "@/types";
import { describeSkillsPattern } from "@/lib/path";
import { isTauriRuntime } from "@/lib/tauri";

// ─── DiscoverConfigDialog ────────────────────────────────────────────────────

interface DiscoverConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiscoverConfigDialog({ open, onOpenChange }: DiscoverConfigDialogProps) {
  const { t } = useTranslation();

  const scanRoots = useDiscoverStore((s) => s.scanRoots);
  const isLoadingRoots = useDiscoverStore((s) => s.isLoadingRoots);
  const loadScanRoots = useDiscoverStore((s) => s.loadScanRoots);
  const setScanRootEnabled = useDiscoverStore((s) => s.setScanRootEnabled);
  const addScanRoot = useDiscoverStore((s) => s.addScanRoot);
  const removeScanRoot = useDiscoverStore((s) => s.removeScanRoot);
  const startScan = useDiscoverStore((s) => s.startScan);

  const agents = usePlatformStore((s) => s.agents);

  // Load roots when dialog opens.
  const handleOpenChange = (open: boolean) => {
    if (open) {
      loadScanRoots();
    }
    onOpenChange(open);
  };

  // Get platform skill directory patterns for display.
  const platformPatterns = agents
    .filter((a) => a.id !== "central" && a.is_enabled)
    .map((a) => ({
      name: a.display_name,
      pattern: describeSkillsPattern(a.global_skills_dir),
    }));

  const enabledCount = scanRoots.filter((r) => r.enabled && r.exists).length;

  function handleStartScan() {
    // Close the dialog IMMEDIATELY so the user can see the ProgressView
    // with the Stop button. The scan runs asynchronously in the background;
    // errors are captured in the store's error state.
    onOpenChange(false);
    startScan();
  }

  async function handleAddPath() {
    if (!isTauriRuntime()) {
      toast.error(t("discover.addPathUnavailable"));
      return;
    }
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t("discover.pickDirectoryTitle"),
      });
      if (!selected || typeof selected !== "string") return;
      await addScanRoot(selected);
      toast.success(t("discover.addPathSuccess", { path: selected }));
    } catch (err) {
      toast.error(t("discover.addPathError", { error: String(err) }));
    }
  }

  async function handleRemoveRoot(path: string) {
    try {
      await removeScanRoot(path);
    } catch (err) {
      toast.error(t("discover.removePathError", { error: String(err) }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radar className="size-5" />
            {t("discover.title")}
          </DialogTitle>
          <DialogDescription>{t("discover.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0">
          {/* Scan Roots */}
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">{t("discover.scanRoots")}</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddPath}
                className="h-7 px-2 text-xs"
              >
                <Plus className="size-3.5 mr-1" />
                {t("discover.addPath")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {t("discover.scanRootsDesc")}
            </p>

            {isLoadingRoots ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <Loader2 className="size-4 animate-spin" />
                <span>{t("common.loading")}</span>
              </div>
            ) : scanRoots.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">
                No candidate directories found.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto min-w-0">
                {scanRoots.map((root) => (
                  <ScanRootRow
                    key={root.path}
                    root={root}
                    onToggle={(enabled) =>
                      setScanRootEnabled(root.path, enabled)
                    }
                    onRemove={
                      root.is_custom ? () => handleRemoveRoot(root.path) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Platform Patterns */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">
              {t("discover.lookingFor")}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {platformPatterns.slice(0, 6).map((p) => (
                <span
                  key={p.name}
                  className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                >
                  {p.pattern}
                </span>
              ))}
              {platformPatterns.length > 6 && (
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  +{platformPatterns.length - 6}
                </span>
              )}
            </div>
          </div>

          {/* Warning if no roots enabled */}
          {enabledCount === 0 && !isLoadingRoots && (
            <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-md p-2.5">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{t("discover.noRootsEnabled")}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleStartScan}
            disabled={enabledCount === 0}
          >
            <Radar className="size-4 mr-1" />
            {t("discover.startScan")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ScanRootRow ──────────────────────────────────────────────────────────────

function ScanRootRow({
  root,
  onToggle,
  onRemove,
}: {
  root: ScanRoot;
  onToggle: (enabled: boolean) => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  // Split the path into a head (truncatable) and a tail (always-visible
  // basename) so long paths render with a middle ellipsis. Falls back to a
  // single-piece truncate when there's no separator.
  const lastSep = Math.max(root.path.lastIndexOf("/"), root.path.lastIndexOf("\\"));
  const head = lastSep > 0 ? root.path.slice(0, lastSep) : "";
  const sep = lastSep >= 0 ? root.path.charAt(lastSep) : "";
  const tail = lastSep >= 0 ? root.path.slice(lastSep + 1) : root.path;
  const dimmed = !root.exists ? "text-muted-foreground line-through" : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(root.path);
      toast.success(t("discover.pathCopied", { path: root.path }));
    } catch (err) {
      toast.error(t("discover.pathCopyError", { error: String(err) }));
    }
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-hover-bg/20">
      <Checkbox
        checked={root.enabled}
        onCheckedChange={(checked) => onToggle(!!checked)}
        disabled={!root.exists}
        aria-label={root.path}
      />
      <div
        className="flex-1 min-w-0 flex items-center text-sm font-mono"
        title={root.path}
      >
        {head ? (
          <>
            <span
              className={`flex-1 min-w-0 truncate ${dimmed}`}
              // RTL truncation places the ellipsis at the visual start of the
              // head segment, preserving the path tail (which is the most
              // distinguishing part). Combined with the always-visible tail
              // span on the right, this yields a middle-ellipsis effect.
              style={{ direction: "rtl", textAlign: "left" }}
            >
              {/* LRM marker prevents the leading slash/punctuation from being
                  bidi-reordered when direction:rtl is applied to LTR text. */}
              {"\u200E"}
              {head}
            </span>
            <span className={`shrink-0 ${dimmed}`}>
              {sep}
              {tail}
            </span>
          </>
        ) : (
          <span className={`truncate ${dimmed}`}>{tail}</span>
        )}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {root.label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handleCopy}
        aria-label={t("discover.copyPath")}
        title={t("discover.copyPathTooltip", { path: root.path })}
      >
        <Copy className="size-3.5" />
      </Button>
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label={t("discover.removePath")}
          title={t("discover.removePath")}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
