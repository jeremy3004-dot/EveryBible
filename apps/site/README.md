EveryBible marketing site source of truth lives in this directory on the `main` branch.

Production rules:
- `apps/site` on `main` is the only deploy source for `everybible.app`.
- Do not ship production website changes from feature branches or dirty local trees.
- If the live site ever differs from `main`, treat that as drift and reconcile back into `main` immediately.
