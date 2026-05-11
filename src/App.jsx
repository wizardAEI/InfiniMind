import { MotionConfig } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import CardField from "./components/CardField.jsx";
import ProjectList from "./components/ProjectList.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import { usePersistentWorkspaceState } from "./hooks/usePersistentWorkspaceState.js";
import { useThemePreference } from "./hooks/useThemePreference.js";
import { createMarkdownFilename, projectToMarkdown } from "./lib/projectMarkdown.js";
import { createDefaultState, createProject } from "./lib/workspaceModel.js";


function App() {
  const { workspaceState, setWorkspaceState, ready } = usePersistentWorkspaceState();
  const [theme, setTheme] = useThemePreference();
  const [view, setView] = useState("projects");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const activeProject =
    workspaceState.projects.find((project) => project.id === workspaceState.activeProjectId) ||
    workspaceState.projects[0];
  const fieldState = activeProject?.field || createDefaultState();
  const activeSetId = fieldState.sets.some((set) => set.id === fieldState.activeSetId)
    ? fieldState.activeSetId
    : fieldState.sets[0]?.id;

  useEffect(() => {
    return window.infinimindStorage?.onExportMarkdownRequest?.(() => {
      exportProjectMarkdown(activeProject);
    });
  }, [activeProject]);

  function patchFieldState(patch) {
    if (!activeProject) {
      return;
    }

    setWorkspaceState((current) => ({
      ...current,
      projects: current.projects.map((project) => {
        if (project.id !== activeProject.id) {
          return project;
        }

        const nextField = {
          ...project.field,
          ...(typeof patch === "function" ? patch(project.field) : patch),
        };
        const nextTitle = nextField.fieldTitle?.trim();

        return {
          ...project,
          name: nextTitle || project.name,
          updatedAt: new Date().toISOString(),
          field: nextField,
        };
      }),
    }));
  }

  function setFieldTitle(fieldTitle) {
    patchFieldState({ fieldTitle });
  }

  function createNewProject() {
    setWorkspaceState((current) => {
      const nextProject = createProject(current.projects.length);

      return {
        ...current,
        projects: [...current.projects, nextProject],
        activeProjectId: nextProject.id,
      };
    });
    setView("field");
  }

  function openProject(projectId) {
    setWorkspaceState((current) => ({
      ...current,
      activeProjectId: projectId,
    }));
    setView("field");
  }

  function deleteProject(projectId) {
    const project = workspaceState.projects.find((item) => item.id === projectId);
    if (!window.confirm(`Delete "${project?.name || "this project"}"?`)) {
      return;
    }

    setWorkspaceState((current) => {
      const projects = current.projects.filter((item) => item.id !== projectId);
      const activeProjectId = projects.some((item) => item.id === current.activeProjectId)
        ? current.activeProjectId
        : projects[0]?.id || null;

      return {
        ...current,
        projects,
        activeProjectId,
      };
    });
  }

  return (
    <MotionConfig transition={{ type: "spring", stiffness: 180, damping: 24, mass: 0.9 }}>
      <main className={`app-shell ${ready ? "is-ready" : ""}`} data-theme={theme}>
        {view === "projects" ? (
          <ProjectList
            projects={workspaceState.projects}
            activeProjectId={activeProject?.id}
            onCreateProject={createNewProject}
            onOpenProject={openProject}
            onDeleteProject={deleteProject}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        ) : (
          <section className="editorial-frame" aria-label="InfiniMind card field">
            <div className="window-drag-region" aria-hidden="true" />
            <header className="field-heading">
              <button
                className="back-to-projects"
                type="button"
                title="Project list"
                aria-label="Back to project list"
                onClick={() => setView("projects")}
              >
                <ChevronLeft size={18} />
              </button>
              <input
                className="field-title-input"
                aria-label="Field title"
                value={fieldState.fieldTitle}
                onChange={(event) => setFieldTitle(event.target.value)}
                onFocus={(event) => event.target.select()}
                spellCheck="false"
              />
            </header>

            <CardField
              fieldTitle={fieldState.fieldTitle}
              sets={fieldState.sets}
              organizations={fieldState.organizations}
              activeSetId={activeSetId}
              connections={fieldState.connections}
              trash={fieldState.trash}
              pan={fieldState.pan}
              zoom={fieldState.zoom}
              onChange={patchFieldState}
            />
          </section>
        )}
        {isSettingsOpen && (
          <SettingsModal theme={theme} onThemeChange={setTheme} onClose={() => setIsSettingsOpen(false)} />
        )}
      </main>
    </MotionConfig>
  );
}

async function exportProjectMarkdown(project) {
  if (!project) {
    return { ok: false, error: "No active project." };
  }

  const markdown = `${projectToMarkdown(project, { includeCards: true, includeTrash: true })}\n`;
  const suggestedFilename = createMarkdownFilename(project.name || project.field?.fieldTitle);

  try {
    if (window.infinimindStorage?.exportMarkdown) {
      return await window.infinimindStorage.exportMarkdown({ suggestedFilename, markdown });
    }

    downloadMarkdownFile(suggestedFilename, markdown);
    return { ok: true, path: null };
  } catch (error) {
    console.error("Failed to export Markdown", error);
    window.alert?.("Could not export Markdown.");
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function downloadMarkdownFile(filename, markdown) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default App;
