# Other identity reconciliation audit

Generated 2026-09-07 from the checked-in source snapshots and current admin atlas index. This report is read-only audit output; it does not alter builders or generated snapshots.

## Scope

This pass covers Every Language language-language duplicate IDs and names, Every Language dialects against explicit GRN/ROLV identifiers, GRN saved/current/change history, and same-source ambiguities. The separate Glottolog-versus-ROLV dialect-pair audit is excluded. No merge is proposed from names, ISO parent, country, coordinates, or aliases alone.

## Coverage

- Current atlas language varieties: **40,581** (9,795 languages + 30,786 dialects/varieties); total records **57,052**.
- Every Language: **35,348** active entities and **70,232** active external-ID rows.
- Shared EL ISO groups: **4,289** groups / **8,578** entities; exact-name duplicate groups are tracked separately and are never auto-merged.
- Current ROLV: **12,400** rows; saved ROLV: **12,406** rows; removed saved-only codes: **7**.
- GRN changes: **50,614** events over **22,411** codes, including **2,521** retirement events.
- Explicit current EL links: **22,882** compact rows; all candidate rows: **12,302**.
- Candidate output state: **2,722** unresolved current-output rows, **9,573** already reconciled current-output rows, and **7** historical/source-only rows.
- Current EL GRN identifiers with historical R events: **1,095**; **1,094** retain the same parent ISO and are canonical-current-ROLV continuity links, while **1** require review.
- Language/dialect duplicate keys: ISO-639-3 **4,148** groups / **34,083** records, Glottocode **0**, ROLV **0**; cross-namespace exact collisions: **0**.
- Full-output key audit including people groups: ISO-639-3 **6,633** groups; this broader count is retained separately from the language/dialect metric.

## Strongest decisions

- Preserve the Jumleli EL UUID `el:18230236-977a-4f37-a433-fdcf36c72804` under parent `iso:jml` / EL parent UUID `809f4144-328b-44ba-8f5f-cf14c367665f`. GRN identifies language 4160 as Jumleli with ISO parent Jumli (`jml`), and ROLV history records `04160` as retired / not a dialect. This is a parent-child no-merge case.
- Keep six EL dialect records whose GRN IDs are present only in the saved 2026-08-22 ROLV snapshot as historical source records; the current delta provides no replacement key.
- Keep EL records with one UUID carrying multiple current GRN/ROLV identifiers and EL UUIDs sharing a GRN identifier as same-source ambiguities. These need provider confirmation before any merge or canonical reassignment.
- No new merge proposal is made from the whole-output duplicate ISO groups: those groups include expected parent/variety and Scripture project records, while every ROLV and Glottocode key is unique in the output. Exact namespace links are retained as evidence.

## Review candidate sample

- `el-jumleli-4160-parent-jumli-jml` — preserve-parent-child-no-merge (high): GRN explicitly identifies 4160 as Jumleli under ISO parent Jumli jml; the current ROLV history marks 04160 retired and not a dialect. Synonym/alias overlap must never merge the dialect record into iso:jml.
- `el-dialect-multi-id:02e3d5f6-4114-476c-945e-8965a09c8b78` — preserve-same-source-ambiguity (medium): One EL dialect UUID carries multiple GRN or ROLV identifiers; no single canonical variety can be selected without provider confirmation.
- `el-grn-shared:00023:1fd668d7-2398-4466-8422-cd81db39e644-4b98f90d-bd08-435e-a571-203b0b88694c` — already-reconciled-preserve-source-evidence (high): A GRN language identifier is attached to more than one EL UUID. Shared GRN number alone cannot decide whether these are duplicate records, a parent/variety relationship, or a provider collision.
- `el-dialect-history:00b6ce37-3041-4d67-bab3-e6a96bc1a5ae:14459` — preserve-retired-history (high): The EL dialect carries a GRN/ROLV code absent from the current code list but present in a saved or historical registry source; preserve the source record and do not map it to a current variety without an explicit replacement.
- `el-rolv-name:02fdc2af-ca64-4b2f-8630-af34a2ccc928:07615` — review-primary-source-no-merge (low): Exact normalized variety name and compatible ISO parent produce a lead, but no explicit EL ROLV/GRN identifier links the records.
- `el-glottolog-name:015580c9-071e-4c5b-a8d0-80649da1f1e3:kru:kuru1301` — review-primary-source-no-merge (low): Exact normalized name and ISO parent match a Glottolog node, but the EL snapshot has no Glottocode external identifier. This is a lead for review only and is excluded from the separate Glottolog↔ROLV dialect-pair audit.
- `el-language-iso:aaa:6817826b-3530-4343-b9f1-77348b5d3890-91e2e72e-cb85-4510-b224-29564d7d65f7` — already-reconciled-preserve-source-evidence (high): Shared ISO is an explicit parent-language identifier, but EL source UUIDs and names can represent varieties or source records.
- `el-name:dialect:abidji enyembe:6848002d-9def-49d2-ac6c-3a9540be2ef9-bac3f5f6-7898-46b5-aa26-a7fa991e458c` — already-reconciled-preserve-source-evidence (high): Exact normalized name collision is a review signal only; source UUIDs, level, parentage, and provider identifiers remain authoritative.

The machine-readable report contains every candidate ID, evidence fields, confidence, disposition, explicit current-link coverage, source hashes, and the excluded Glottolog↔ROLV scope.

## Source anchors

- GRN ROLV documentation: https://globalrecordings.net/en/rolv
- Official GRN Jumleli profile (language 4160): https://globalrecordings.net/en/language/4160
- ISO 639-3 data: https://iso639-3.sil.org/code_tables/639/data
