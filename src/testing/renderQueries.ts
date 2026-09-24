/**
 * Queries over a react-test-renderer tree, in the spirit of Testing Library.
 *
 * Only host elements (string types such as `View`, `Text`, `Pressable`) are
 * searched: those are what reaches the screen and the accessibility tree, and
 * searching composites too would return every match twice.
 */
import type { ReactTestInstance } from 'react-test-renderer';

export type TextMatch = string | RegExp;

export interface RoleQueryOptions {
  /** Matched against the accessibility label, falling back to the text content. */
  name?: TextMatch;
  selected?: boolean;
  checked?: boolean | 'mixed';
  disabled?: boolean;
  expanded?: boolean;
  busy?: boolean;
}

export interface QueryOptions {
  /** Include elements a screen reader cannot reach (default false for role/label). */
  includeHidden?: boolean;
}

type Props = Record<string, unknown>;

const isHost = (node: ReactTestInstance) => typeof node.type === 'string';

function matches(value: string | undefined | null, match: TextMatch): boolean {
  if (value == null) return false;
  return typeof match === 'string' ? value === match : match.test(value);
}

/** Every string rendered inside `node`, concatenated in order. */
export function textContent(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

/**
 * A failed `assert.equal(view.queryByText('x'), null)` makes node:assert print
 * the element it got, walking its `_fiber` into the entire React tree: building
 * that message takes minutes and the file looks hung. Hiding the field from
 * enumeration keeps failure messages to the element's props.
 */
function hideFiber(node: ReactTestInstance) {
  const descriptor = Object.getOwnPropertyDescriptor(node, '_fiber');
  if (descriptor?.enumerable) {
    Object.defineProperty(node, '_fiber', { ...descriptor, enumerable: false });
  }
}

function hostDescendants(root: ReactTestInstance): ReactTestInstance[] {
  const found: ReactTestInstance[] = [];
  const visit = (node: ReactTestInstance) => {
    hideFiber(node);
    if (isHost(node)) found.push(node);
    for (const child of node.children) {
      if (typeof child !== 'string') visit(child);
    }
  };
  visit(root);
  return found;
}

function ancestorsAndSelf(node: ReactTestInstance): ReactTestInstance[] {
  const chain: ReactTestInstance[] = [];
  let current: ReactTestInstance | null = node;
  while (current) {
    chain.push(current);
    current = current.parent;
  }
  return chain;
}

/**
 * The host elements enclosing `node`, nearest first. `node.parent` alternates
 * between host elements and the component wrappers that rendered them, so walk
 * this list rather than counting `.parent` hops.
 */
export function hostAncestors(node: ReactTestInstance): ReactTestInstance[] {
  return ancestorsAndSelf(node).slice(1).filter(isHost);
}

/**
 * True when a screen reader cannot reach `node`: it or an ancestor is hidden
 * with `importantForAccessibility="no-hide-descendants"`,
 * `accessibilityElementsHidden` or `aria-hidden`.
 */
export function isHiddenFromAccessibility(node: ReactTestInstance): boolean {
  return ancestorsAndSelf(node).some((entry) => {
    if (!isHost(entry)) return false;
    const props = entry.props as Props;
    return (
      props.importantForAccessibility === 'no-hide-descendants' ||
      props.accessibilityElementsHidden === true ||
      props['aria-hidden'] === true
    );
  });
}

export function accessibilityLabelOf(node: ReactTestInstance): string | undefined {
  const props = node.props as Props;
  const label = props.accessibilityLabel ?? props['aria-label'];
  return typeof label === 'string' ? label : undefined;
}

function roleOf(node: ReactTestInstance): string | undefined {
  const props = node.props as Props;
  const role = props.accessibilityRole ?? props.role;
  return typeof role === 'string' ? role : undefined;
}

function stateOf(node: ReactTestInstance): Props {
  const props = node.props as Props;
  const state = (props.accessibilityState as Props | undefined) ?? {};
  return {
    selected: state.selected ?? props['aria-selected'],
    checked: state.checked ?? props['aria-checked'],
    disabled: state.disabled ?? props['aria-disabled'] ?? props.disabled,
    expanded: state.expanded ?? props['aria-expanded'],
    busy: state.busy ?? props['aria-busy'],
  };
}

function describe(node: ReactTestInstance, depth = 0, lines: string[] = []): string[] {
  if (lines.length > 200) return lines;
  if (isHost(node)) {
    const props = node.props as Props;
    const bits = [String(node.type)];
    for (const key of ['testID', 'accessibilityRole', 'role', 'accessibilityLabel']) {
      if (props[key] != null) bits.push(`${key}=${JSON.stringify(props[key])}`);
    }
    const ownText = node.children.filter((child) => typeof child === 'string').join('');
    if (ownText) bits.push(JSON.stringify(ownText));
    lines.push(`${'  '.repeat(depth)}${bits.join(' ')}`);
  }
  for (const child of node.children) {
    if (typeof child !== 'string') describe(child, isHost(node) ? depth + 1 : depth, lines);
  }
  return lines;
}

/** An indented outline of the host tree, used in query failure messages. */
export function debugTree(root: ReactTestInstance): string {
  return describe(root).join('\n');
}

export function createQueries(getRoot: () => ReactTestInstance) {
  const all = () => hostDescendants(getRoot());

  const single = (kind: string, found: ReactTestInstance[], required: boolean) => {
    if (found.length > 1) {
      throw new Error(`Found ${found.length} elements for ${kind}\n\n${debugTree(getRoot())}`);
    }
    if (found.length === 0 && required) {
      throw new Error(`Unable to find an element for ${kind}\n\n${debugTree(getRoot())}`);
    }
    return found[0] ?? null;
  };

  const plural = (kind: string, found: ReactTestInstance[]) => {
    if (found.length === 0) {
      throw new Error(`Unable to find any element for ${kind}\n\n${debugTree(getRoot())}`);
    }
    return found;
  };

  const findText = (match: TextMatch) => {
    const texts = all().filter(
      (node) => (node.type as unknown) === 'Text' && matches(textContent(node), match)
    );
    // Nested <Text> repeats its parent's content; keep the innermost match.
    return texts.filter(
      (node) => !texts.some((other) => other !== node && isAncestor(node, other))
    );
  };

  const findLabel = (match: TextMatch, options: QueryOptions = {}) =>
    all().filter(
      (node) =>
        matches(accessibilityLabelOf(node), match) &&
        (options.includeHidden || !isHiddenFromAccessibility(node))
    );

  const findRole = (role: string, options: RoleQueryOptions & QueryOptions = {}) =>
    all().filter((node) => {
      if (roleOf(node) !== role) return false;
      if (!options.includeHidden && isHiddenFromAccessibility(node)) return false;
      if (options.name !== undefined) {
        const name = accessibilityLabelOf(node) ?? textContent(node);
        if (!matches(name, options.name)) return false;
      }
      const state = stateOf(node);
      for (const key of ['selected', 'checked', 'disabled', 'expanded', 'busy'] as const) {
        if (options[key] !== undefined && Boolean(state[key]) !== Boolean(options[key])) {
          if (!(key === 'checked' && state[key] === options[key])) return false;
        }
      }
      return true;
    });

  const findTestId = (id: TextMatch) =>
    all().filter((node) => matches((node.props as Props).testID as string | undefined, id));

  const describeText = (m: TextMatch) => `text ${String(m)}`;
  const describeLabel = (m: TextMatch) => `accessibility label ${String(m)}`;
  const describeRole = (role: string, o?: RoleQueryOptions) =>
    `role "${role}"${o?.name !== undefined ? ` named ${String(o.name)}` : ''}`;

  return {
    getByText: (m: TextMatch) => single(describeText(m), findText(m), true) as ReactTestInstance,
    queryByText: (m: TextMatch) => single(describeText(m), findText(m), false),
    getAllByText: (m: TextMatch) => plural(describeText(m), findText(m)),
    queryAllByText: (m: TextMatch) => findText(m),
    getByLabelText: (m: TextMatch, o?: QueryOptions) =>
      single(describeLabel(m), findLabel(m, o), true) as ReactTestInstance,
    queryByLabelText: (m: TextMatch, o?: QueryOptions) =>
      single(describeLabel(m), findLabel(m, o), false),
    getAllByLabelText: (m: TextMatch, o?: QueryOptions) =>
      plural(describeLabel(m), findLabel(m, o)),
    queryAllByLabelText: (m: TextMatch, o?: QueryOptions) => findLabel(m, o),
    getByRole: (role: string, o?: RoleQueryOptions & QueryOptions) =>
      single(describeRole(role, o), findRole(role, o), true) as ReactTestInstance,
    queryByRole: (role: string, o?: RoleQueryOptions & QueryOptions) =>
      single(describeRole(role, o), findRole(role, o), false),
    getAllByRole: (role: string, o?: RoleQueryOptions & QueryOptions) =>
      plural(describeRole(role, o), findRole(role, o)),
    queryAllByRole: (role: string, o?: RoleQueryOptions & QueryOptions) => findRole(role, o),
    getByTestId: (id: TextMatch) =>
      single(`testID ${String(id)}`, findTestId(id), true) as ReactTestInstance,
    queryByTestId: (id: TextMatch) => single(`testID ${String(id)}`, findTestId(id), false),
    /** Every host element of a type (`'Switch'`, `'Modal'`, `'LucideIcon'`, ...). */
    queryAllByType: (type: string) => all().filter((node) => (node.type as unknown) === type),
    debug: () => debugTree(getRoot()),
  };
}

function isAncestor(ancestor: ReactTestInstance, node: ReactTestInstance): boolean {
  let current = node.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

export type Queries = ReturnType<typeof createQueries>;

/** The nearest host element (self or ancestor) that carries `handler`. */
export function findHandlerHost(node: ReactTestInstance, handler: string): ReactTestInstance {
  const host = ancestorsAndSelf(node).find(
    (entry) => isHost(entry) && typeof (entry.props as Props)[handler] === 'function'
  );
  if (!host) {
    throw new Error(`No element at or above <${String(node.type)}> handles ${handler}`);
  }
  return host;
}

/**
 * RN touchables ignore presses when `disabled` is set, falling back to
 * `accessibilityState.disabled` when `disabled` is not given.
 */
export function isPressDisabled(host: ReactTestInstance): boolean {
  const props = host.props as Props;
  const state = props.accessibilityState as Props | undefined;
  return Boolean(props.disabled ?? state?.disabled ?? props['aria-disabled']);
}
