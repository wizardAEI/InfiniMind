import { FolderOpen, Layers3, Plus, Settings, Trash2 } from "lucide-react";
import { getCardPreview } from "../lib/workspaceModel.js";
import { formatProjectDate } from "../lib/dateFormat.js";

function ProjectList({ projects, activeProjectId, onCreateProject, onOpenProject, onDeleteProject, onOpenSettings }) {
  return (
    <section className="project-list-screen" aria-label="Project list">
      <div className="window-drag-region" aria-hidden="true" />
      <header className="project-list-heading">
        <div>
          <p>InfiniMind</p>
          <h1>Projects</h1>
        </div>
        <div className="project-heading-actions">
          <button className="settings-button" type="button" title="Settings" aria-label="Open settings" onClick={onOpenSettings}>
            <Settings size={18} />
          </button>
          <button className="new-project-button" type="button" onClick={onCreateProject}>
            <Plus size={18} />
            <span>New Project</span>
          </button>
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="project-empty-state">
          <span>00</span>
          <p>No projects</p>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project, index) => {
            const sets = project.field?.sets || [];
            const cardCount = sets.reduce((total, set) => total + set.cards.length, 0);
            const previewSet = sets.find((set) => set.id === project.field?.activeSetId) || sets[0];
            const previewCard =
              previewSet?.cards.find((card) => card.id === previewSet.activeId) || previewSet?.cards[0];

            return (
              <article
                className={`project-tile ${project.id === activeProjectId ? "is-current-project" : ""}`}
                key={project.id}
              >
                <button
                  className="project-open-button"
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  aria-label={`Open ${project.name}`}
                >
                  <span className="project-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="project-title">{project.name || "Untitled"}</span>
                  <span className="project-preview">{getCardPreview(previewCard)}</span>
                  <span className="project-meta">
                    <span>
                      <Layers3 size={14} />
                      {sets.length}
                    </span>
                    <span>{String(cardCount).padStart(2, "0")} cards</span>
                  </span>
                </button>
                <footer className="project-tile-actions">
                  <span>{formatProjectDate(project.updatedAt)}</span>
                  <div>
                    <button
                      type="button"
                      title="Open project"
                      aria-label={`Open ${project.name} from actions`}
                      onClick={() => onOpenProject(project.id)}
                    >
                      <FolderOpen size={15} />
                    </button>
                    <button
                      type="button"
                      title="Delete project"
                      aria-label={`Delete ${project.name}`}
                      onClick={() => onDeleteProject(project.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ProjectList;
