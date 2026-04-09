import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SkillCard } from "../components/platform/SkillCard";
import { ScannedSkill } from "../types";

// Mock navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const symlinkSkill: ScannedSkill = {
  id: "frontend-design",
  name: "frontend-design",
  description: "Build distinctive, production-grade frontend interfaces with high design quality.",
  file_path: "~/.claude/skills/frontend-design/SKILL.md",
  dir_path: "~/.claude/skills/frontend-design",
  link_type: "symlink",
  symlink_target: "~/.agents/skills/frontend-design",
  is_central: true,
};

const copySkill: ScannedSkill = {
  id: "code-reviewer",
  name: "code-reviewer",
  description: "Review code changes and identify high-confidence, actionable bugs.",
  file_path: "~/.claude/skills/code-reviewer/SKILL.md",
  dir_path: "~/.claude/skills/code-reviewer",
  link_type: "copy",
  is_central: false,
};

const noDescriptionSkill: ScannedSkill = {
  id: "no-desc",
  name: "no-desc",
  file_path: "~/.claude/skills/no-desc/SKILL.md",
  dir_path: "~/.claude/skills/no-desc",
  link_type: "copy",
  is_central: false,
};

function renderSkillCard(skill: ScannedSkill) {
  return render(
    <MemoryRouter>
      <SkillCard skill={skill} />
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SkillCard", () => {
  // ── Rendering ─────────────────────────────────────────────────────────────

  it("renders skill name", () => {
    renderSkillCard(symlinkSkill);
    expect(screen.getByText("frontend-design")).toBeInTheDocument();
  });

  it("renders skill description", () => {
    renderSkillCard(symlinkSkill);
    expect(
      screen.getByText(/Build distinctive, production-grade/)
    ).toBeInTheDocument();
  });

  it("renders without description gracefully", () => {
    renderSkillCard(noDescriptionSkill);
    expect(screen.getByText("no-desc")).toBeInTheDocument();
    // Should not throw or crash
  });

  // ── Source Indicators ─────────────────────────────────────────────────────

  it("shows 'Central Skills · symlink' for symlinked skills", () => {
    renderSkillCard(symlinkSkill);
    expect(screen.getByText("Central Skills · symlink")).toBeInTheDocument();
  });

  it("shows '独立安装 · copy' for copied skills", () => {
    renderSkillCard(copySkill);
    expect(screen.getByText("独立安装 · copy")).toBeInTheDocument();
  });

  it("shows '独立安装 · copy' for non-central skills", () => {
    renderSkillCard(copySkill);
    const indicator = screen.getByText("独立安装 · copy");
    expect(indicator).toBeInTheDocument();
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  it("navigates to /skill/:skillId on click", () => {
    renderSkillCard(symlinkSkill);
    const card = screen.getByRole("button");
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith("/skill/frontend-design");
  });

  it("navigates to correct skill ID for copy skill", () => {
    renderSkillCard(copySkill);
    const card = screen.getByRole("button");
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith("/skill/code-reviewer");
  });
});
