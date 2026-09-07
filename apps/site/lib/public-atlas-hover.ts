import type { AtlasIndex, AtlasLocation, AtlasRecord } from '../../admin/lib/language-atlas/types';
import {
  profileCountries,
  profileDisplayName,
  profileIdentity,
  profileScriptureLabel,
} from './public-atlas-profile';

/** Text nodes keep provider names safe; hover is a preview of the dot's profile. */
export function publicAtlasHover(
  record: AtlasRecord,
  location: AtlasLocation | undefined,
  index: AtlasIndex
): HTMLElement {
  const node = document.createElement('div');
  node.className = 'pa-hover-card';
  const append = (tag: string, text: string, className = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    node.append(element);
  };
  append('strong', profileDisplayName(record, index));
  const countries = profileCountries(record, index);
  const geography = countries
    .slice(0, 3)
    .map(({ flag, name }) => `${flag} ${name}`.trim())
    .join(' · ');
  append(
    'small',
    [
      geography,
      countries.length > 3 ? `+${countries.length - 3} countries` : '',
      profileIdentity(record, index).replace(/\.$/, ''),
    ]
      .filter(Boolean)
      .join(' · ')
  );
  append('p', profileScriptureLabel(record, index), 'pa-hover-status');
  if (location) {
    append(
      'small',
      ['parent-language', 'country', 'related-people-group'].includes(location.precision)
        ? 'Approximate map location'
        : 'Mapped reference area'
    );
  }
  append('small', 'Click the dot to explore →', 'pa-hover-explore');
  return node;
}
