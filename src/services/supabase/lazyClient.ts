export function createLazyClientAccessor<T>({ createClient }: { createClient: () => T }) {
  let client: T | null = null;

  return () => {
    if (!client) {
      client = createClient();
    }

    return client;
  };
}
