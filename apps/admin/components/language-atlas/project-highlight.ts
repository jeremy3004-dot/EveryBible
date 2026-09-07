import { scriptureStatus } from '../../lib/language-atlas/model';
import { SCRIPTURE_COLORS, scriptureVisualCategory } from '../../lib/language-atlas/presentation';
import type { AtlasRecord } from '../../lib/language-atlas/types';

/** Animate only the small ring; never redraw the atlas to animate a project. */
export function createProjectHighlight(record: AtlasRecord, onSelect: (id: string) => void) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'la-project-marker';
  element.dataset.recordId = record.id;
  element.setAttribute('aria-label', `${record.name}: Every Language project. View progress`);
  element.title = `${record.name} · View project progress`;
  element.style.setProperty(
    '--project-dot',
    SCRIPTURE_COLORS.dark[scriptureVisualCategory(scriptureStatus(record))]
  );
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    onSelect(record.id);
  });
  return element;
}
