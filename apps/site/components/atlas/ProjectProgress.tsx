import { useEffect, useRef } from 'react';
import {
  projectPercentage,
  projectsForRecord,
  projectSnapshot,
  type AtlasProject,
} from '../../lib/public-atlas-projects';

export function ProjectProgress({
  recordId,
  projectName,
}: {
  recordId?: string;
  projectName?: string;
}) {
  const projects = recordId
    ? projectsForRecord(recordId)
    : projectSnapshot.projects.filter((p) => p.name === projectName);
  if (!projects.length) return null;
  return (
    <section className="pa-project-progress" aria-label="Every Language project progress">
      <p className="pa-eyebrow">Every Language project</p>
      {projects.map((project) => (
        <div className="pa-project" key={project.name}>
          <h3>{project.name}</h3>
          {project.languageName !== project.name && <p>Project language: {project.languageName}</p>}
          <div className="pa-project-total">
            <strong>
              {projectPercentage(project)}
              {project.recordedPercentage !== null && '%'}
            </strong>
            <span>of Bible chapters recorded</span>
          </div>
          {project.recordedPercentage !== null && (
            <progress
              aria-label={`${project.name} Bible chapters recorded`}
              value={project.recordedPercentage}
              max={100}
            />
          )}
          <p>{project.chaptersRecorded.toLocaleString('en-US')} chapters recorded</p>
          <div className="pa-project-sections">
            {(
              [
                ['Gospels', project.gospelPercentage],
                ['New Testament', project.ntPercentage],
                ['Old Testament', project.otPercentage],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value === null ? 'Not reported' : `${value}%`}</strong>
                {value !== null && (
                  <progress
                    aria-label={`${project.name} ${label} recorded`}
                    value={value}
                    max={100}
                  />
                )}
              </div>
            ))}
          </div>
          <details className="pa-project-activity">
            <summary>Recording activity</summary>
            <p>
              {project.recordings.toLocaleString('en-US')} recordings · {project.totalBooks} books
              tracked
            </p>
            <p>{project.totalChapters.toLocaleString('en-US')} chapters listed in the project</p>
            <p>
              Last active{' '}
              {project.lastActivityDaysAgo === 0
                ? 'on the snapshot date'
                : `${project.lastActivityDaysAgo} ${project.lastActivityDaysAgo === 1 ? 'day' : 'days'} before the snapshot`}
              .
            </p>
          </details>
        </div>
      ))}
      <p className="pa-project-note">
        Recording progress is separate from review, approval, and Scripture publication.
      </p>
      <small className="pa-project-source">
        LangQuest dashboard · Unaudited snapshot {projectSnapshot.asOf}
      </small>
    </section>
  );
}

export function UnmappedProjectProfile({
  project,
  onClose,
}: {
  project: AtlasProject;
  onClose: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [project.name]);
  return (
    <article className="pa-profile" aria-label={`${project.name} project`}>
      <div className="pa-section-top">
        <span className="pa-eyebrow">Our languages</span>
        <button type="button" aria-label="Close project" onClick={onClose}>
          ×
        </button>
      </div>
      <h2 tabIndex={-1} ref={title}>
        {project.name}
      </h2>
      <p className="pa-project-note">Map location awaiting confirmation.</p>
      <ProjectProgress projectName={project.name} />
    </article>
  );
}
