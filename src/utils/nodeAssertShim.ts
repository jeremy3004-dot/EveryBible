/**
 * Stand-in for Node's `assert`, resolved by metro.config.js for @ide/backoff only
 * (pulled in by expo-notifications). That package calls nothing but
 * `assert(condition, message)`, and the browserify `assert` polyfill drags in `util`
 * and ~70 helper modules (~150 KB of source) to support it.
 */
class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export default function assert(value: unknown, message?: string): asserts value {
  if (!value) {
    throw new AssertionError(message ?? 'The expression evaluated to a falsy value');
  }
}
