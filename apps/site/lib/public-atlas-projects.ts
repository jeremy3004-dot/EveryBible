import snapshot from '../data/language-atlas/projects.json';
import { filterRecords } from '../../admin/lib/language-atlas/model';
import type { AtlasFilters, AtlasRecord } from '../../admin/lib/language-atlas/types';

export type AtlasProject = (typeof snapshot.projects)[number];
export const projectSnapshot = snapshot;
export const projectRecordIds: ReadonlySet<string> = new Set(
  snapshot.projects.flatMap((p) => (p.recordId ? [p.recordId] : []))
);
export function projectsForRecord(id: string): AtlasProject[] {
  return snapshot.projects.filter((project) => project.recordId === id);
}
export function projectPercentage(project: Pick<AtlasProject, 'recordedPercentage'>): string {
  return project.recordedPercentage === null ? 'Not reported' : String(project.recordedPercentage);
}
export function filterProjects(records: AtlasRecord[], filters: AtlasFilters): AtlasProject[] {
  const eligible = new Map(filterRecords(records, { ...filters, query: '' }).map((r) => [r.id, r]));
  const query = filters.query.trim().toLocaleLowerCase();
  const hasRecordFilter =
    filters.country ||
    !['all', 'varieties'].includes(filters.kind) ||
    filters.scripture !== 'all' ||
    filters.placement !== 'all' ||
    filters.source;
  return snapshot.projects.filter((project) => {
    const record = project.recordId ? eligible.get(project.recordId) : undefined;
    if (hasRecordFilter && !record) return false;
    return (
      !query ||
      [project.name, project.languageName, record?.name, ...(record?.aliases ?? [])].some((value) =>
        value?.toLocaleLowerCase().includes(query)
      )
    );
  });
}
