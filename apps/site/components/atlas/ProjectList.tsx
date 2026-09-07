import type { AtlasProject } from '../../lib/public-atlas-projects';
import { projectPercentage, projectSnapshot } from '../../lib/public-atlas-projects';

export function ProjectList({
  projects,
  onSelect,
  onClose,
  onShowAll,
}: {
  projects: AtlasProject[];
  onSelect: (project: AtlasProject) => void;
  onClose: () => void;
  onShowAll: () => void;
}) {
  return (
    <section className="pa-records pa-project-list" aria-label="EL Translations">
      <div className="pa-section-top">
        <h2>EL Translations</h2>
        <button type="button" aria-label="Close projects" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="pa-result-count" role="status">
        {projects.length === projectSnapshot.projects.length
          ? projects.length
          : `${projects.length} of ${projectSnapshot.projects.length}`}{' '}
        active projects · Sep 7, 2026
      </p>
      <p className="pa-project-note">Select a language to explore recording progress.</p>
      <div className="pa-record-list">
        {projects.map((project) => (
          <button type="button" key={project.name} onClick={() => onSelect(project)}>
            <span className="pa-project-row-name">
              {project.name}
              <small>
                {project.recordId
                  ? `${project.chaptersRecorded.toLocaleString('en-US')} chapters recorded`
                  : 'Map location awaiting confirmation'}
              </small>
            </span>
            <span className="pa-project-row-value">
              {projectPercentage(project)}
              {project.recordedPercentage !== null && '%'}
              <small>recorded</small>
            </span>
          </button>
        ))}
      </div>
      {!projects.length && <p className="pa-empty">No projects match your filters.</p>}
      <button className="pa-browse" type="button" onClick={onShowAll}>
        Show all 23 translations
      </button>
    </section>
  );
}
