EveryBible marketing site source of truth lives in this directory on the `main` branch.

Production rules:
- `apps/site` on `main` is the only deploy source for `everybible.app`.
- Do not ship production website changes from feature branches or dirty local trees.
- If the live site ever differs from `main`, treat that as drift and reconcile back into `main` immediately.
- Use `/download` as the canonical smart CTA and QR target so phones land in the correct app store automatically.

The homepage and About copy connect EveryBible to Every Language's vision and
helping people engage with Scripture in their heart language. Atlas copy describes
red as no documented Scripture in the sources, not confirmed absence. App download
copy refers to available Scripture rather than promising every translation or format.

Giving: `/give` links to Every Language's PayPal donation form and official ACH/wire
instructions, sourced from https://everylanguage.com/give/. Keep giving in the
primary navigation; app help stays at `/support` via the small footer button.
