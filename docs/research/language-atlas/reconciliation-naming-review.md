# Directional naming review

Reviewed 2026-09-07 against the current 54,532-record admin index. This is an independent naming/scope review, not an applied decision list. Existing work was preserved. No code, source snapshot, or decision file changed.

## Approved Kyrgyz naming equivalences

- `rolv:12042` Kyrgyz: Northern ↔ `glottolog:nort2693` Northern Kirghiz.
- `rolv:26797` Kyrgyz: Southern ↔ `glottolog:sout2702` Southern Kirghiz.

Both are dialect records immediately under `iso:kir`. The primary labels preserve the same direction; Kyrgyz/Kirghiz is source-attested parent nomenclature, not fuzzy spelling inference. [GRN Northern](https://globalrecordings.net/en/language/12042) explicitly binds the label, Northern Kyrgyz alias, ISO Kirghiz `kir`, and ROLV 12042; [GRN Southern](https://globalrecordings.net/en/language/26797) does likewise for Southern Kyrgyz and 26797. Both specify Kyrgyzstan and separately list China as a sibling. [Glottolog Northern](https://glottolog.org/resource/languoid/id/nort2693) and [Southern](https://glottolog.org/resource/languoid/id/sout2702) independently identify the corresponding directional dialects. Retrieved pages label themselves Glottolog 5.3; GRN search-cache crawl dates vary, so these are observed pages, not an assertion of a same-day live upstream export.

## Representative source checks

| Region / cohort | Naming evidence | Review consequence |
|---|---|---|
| Central Asia, Kyrgyz | GRN and Glottolog pages above | Approve the two primary-label equivalences only. |
| Philippines, Adasen | [GRN 06678](https://globalrecordings.net/en/language/6678) explicitly lists Eastern Addasen as alternate name of Adasen: Eastern, with ISO `tiu` and Philippines. | Source attests exact dialect alias, beyond merely inferring Adasen/Addasen similarity. Local target is `glottolog:east2476`. Target-specific Glottolog web retrieval failed, so this check is alias support, not a complete new merge approval. |
| West Africa, Bokyi | [GRN 02279](https://globalrecordings.net/en/language/2279) binds Boki: Eastern to ISO Bokyi `bky`, explicitly listing Eastern Bokyi and East Boki. [Glottolog classification](https://glottolog.org/resource/languoid/id/atla1278) lists Eastern Bokyi beneath Bokyi. | Attested parent-name and full dialect-label equivalence; current local target is `glottolog:east2399`. Full identity gates still apply. |
| North America, Tlingit | Local `rolv:26459` Thlinget: Northern explicitly aliases Northern Tlingit, matching `glottolog:nort3355`. | GRN web retrieval failed; retain as a source-snapshot lead, not web-confirmed. |
| Europe, Belarusian | Local `rolv:07934` Belarusian: Central and `glottolog:cent1954` Central Belarusan exhibit the spelling-parent pattern. | GRN web retrieval failed. Do not invent an alias because the spelling looks close. |
| Europe, Welsh | Local `rolv:18266` Welsh: Northern and `glottolog:nort2668` Northern Welsh exhibit literal reordering. | GRN web retrieval failed. Pure label equivalence is a candidate; scope/uniqueness gates remain required. |

## Concrete misleading pairs and scope traps

1. **China is not the Northern merge.** `rolv:12041` Kyrgyz: China includes Northern Kyrgyz/Kirgiz in alternate names. [GRN China](https://globalrecordings.net/en/language/12041) explicitly preserves China in Xinjiang as a distinct sibling of Northern and Southern. Its aliases are true source assertions but do not override the primary geographic distinction. The broad Glottolog Northern country set is inherited parent geography, not independent evidence that China and Northern are the same record.
2. **Parent aliases may contain child labels.** Current `iso:kir` aliases include both Kyrgyz and Kyrgyz: China. The latter must not become a global interchangeable parent token. Every Language enrichment and aggregated aliases require scope-aware provenance; being stored on a parent does not prove a language-wide synonym.
3. **Same words can belong to another parent.** `glottolog:fuyu1243` Fuyu Kirghiz belongs to `iso:kjh` Khakas, not `iso:kir`. No suffix/name similarity can override that distinction.
4. **Nested directions are meaningful.** `rolv:24261` Albanian, Tosk: Northern / Northern Tosk must not collapse into `glottolog:korc1239` Eastern Northern Tosk or `glottolog:west2895` Western Northern Tosk. Dropping Eastern/Western changes scope.
5. **Generic group labels can conceal hierarchy.** `glottolog:west2765` Western Group under `iso:aii` has five current children. `rolv:24225` Assyrian Neo-Aramaic: Western has none. Same parent plus Western is insufficient; do not strip Group and manufacture equivalence.
6. **Direction in the parent is not the leaf direction.** `rolv:30431` Tamazight, Central Atlas: Northern cannot match `glottolog:cent2195` Central Atlas merely because both contain Central. The relevant leaf qualifier is Northern. Similar parent-only triggers affected 453 of the 574 generic-label rows documented in `reconciliation-pass2-conflicts.md`.
7. **Do not erase lexical differences as generic noise.** Eastern Nonmetafonetica, Southern Calabro, and Western Sicilian coexist under Sicilian in the current index. A shared directional token is not a substitute for the remaining leaf identity.

## Acceptance boundary

Allow literal reordering of an exact full label, or substitution of an independently attested parent-language alias while preserving the exact leaf qualifier. Require matching immediate parent and kind, one-to-one ownership, no contradictory direct geography, and retention of all source assertions and original IDs. Check children and differing hierarchy before approval. Existing same-ISO association alone is not enough because classification can be flattened upstream. Do not expand Northern to North, Central to Standard, or Western to a named subregion without explicit source evidence. Generic qualifiers are not automatically invalid, but neither are they identity proof.

Prior-pass generic flags were a screening mechanism, not a permanent rejection of directional names. Reconsider the exact-label cohorts consistently while retaining ambiguous aliases and scope differences as explicit holds. Scripture status must stay at its asserted scope; merging name-equivalent rows must not elevate inherited language-level availability to verified dialect availability.

## Candidate-file independent review

Reviewed the generated candidate file with source hash `71642836fe73063bebafe8ba5548f1463557ff4f03c79ca2ca7772f3275e28aa`: {'candidateCount': 867, 'languageDialectRecords': 38061, 'normalizedPairCount': 3644, 'totalRecords': 54532, 'withoutImmediateParent': 9352}. Checked all candidates against current index child counts, kind, immediate parent, review flags, and raw Glottolog Parent Glottocode evidence. There were zero failures in those checks and zero raw Glottolog parent mismatches against the canonical parent glottocode. This matters because matching only a flattened ISO association would have concealed scope differences.

Stratified manual label/context inspection covered 40 pairs: ten each from EL/Glottolog directional, EL/Glottolog other leaf-format, ROLV/Glottolog directional, and ROLV/Glottolog other leaf-format cohorts. No concrete false positive was found in this sample. These pass the naming/scope review; the lead retains final approval ownership. Parent-language location equality is not treated as independent direct geography.

| Cohort | Pair | Naming/context assessment |
|---|---|---|
| EL/other | `el:015986a0-5d2d-4aca-b492-d8f6b0e2d398` Ngwo: Zang ↔ `glottolog:zang1251` Zang | Exact retained leaf or directional qualifier under `iso:ngn`; no scope-changing word removed. |
| EL/other | `el:01a221e3-37c2-4799-9b42-c9d065354b06` Muong: Thang ↔ `glottolog:than1254` Thang | Exact retained leaf or directional qualifier under `iso:mtq`; no scope-changing word removed. |
| EL/other | `el:0271c48d-95f1-46d6-8cd4-9d00a898968d` Muong: Mual ↔ `glottolog:mual1240` Mual | Exact retained leaf or directional qualifier under `iso:mtq`; no scope-changing word removed. |
| EL/other | `el:02896aa9-dbad-4f38-a04c-7f1a80bef062` Mongo-Nkundu: Bukala ↔ `glottolog:buka1255` Bukala | Exact retained leaf or directional qualifier under `iso:lol`; no scope-changing word removed. |
| EL/other | `el:03178562-1dd6-47dc-9397-a522c4d2bc76` Kalanga: Nyai ↔ `glottolog:nyai1238` Nyai | Exact retained leaf or directional qualifier under `iso:kck`; no scope-changing word removed. |
| EL/other | `el:032d7699-fa3c-42b3-b6f6-64e5138101a7` Cofan: Aguarico ↔ `glottolog:agua1254` Aguarico | Exact retained leaf or directional qualifier under `iso:con`; no scope-changing word removed. |
| EL/other | `el:0370236d-9130-472c-9377-ac06512fef0f` Tikar: Gambai ↔ `glottolog:gamb1253` Gambai | Exact retained leaf or directional qualifier under `iso:tik`; no scope-changing word removed. |
| EL/other | `el:0431bcd9-dcb3-456d-a1b0-1305218a7635` Parachi: Nijrau ↔ `glottolog:nijr1238` Nijrau | Exact retained leaf or directional qualifier under `iso:prc`; no scope-changing word removed. |
| EL/other | `el:04db5334-743f-440f-8eff-75f25dc469d9` Makaa: Sekunda ↔ `glottolog:seku1238` Sekunda | Exact retained leaf or directional qualifier under `iso:mcp`; no scope-changing word removed. |
| EL/other | `el:05cfd5b4-dbd3-408c-98fe-02f0b3ca10d1` Amahai: Soahuku ↔ `glottolog:soah1237` Soahuku | Exact retained leaf or directional qualifier under `iso:amq`; no scope-changing word removed. |
| EL/direction | `el:111f4e48-2dce-4407-8a4a-9cbe56c2bd46` Shuswap: Eastern ↔ `glottolog:east2536` Eastern Shuswap | Exact retained leaf or directional qualifier under `iso:shs`; no scope-changing word removed. |
| EL/direction | `el:1964d2d0-b5dc-41f7-92b0-cbb780c856a1` Kacipo-Balesi: Western Suri ↔ `glottolog:west2496` Western Suri | Exact retained leaf or directional qualifier under `iso:koe`; no scope-changing word removed. |
| EL/direction | `el:1e0a84ab-2d22-460c-94b8-6f0c02536140` Veps: Southern ↔ `glottolog:sout2680` Southern Veps | Exact retained leaf or directional qualifier under `iso:vep`; no scope-changing word removed. |
| EL/direction | `el:21fd974a-a387-4347-88d1-a21fc4bf6d52` Tay: Eastern ↔ `glottolog:east2364` Eastern Tày | Exact retained leaf or directional qualifier under `iso:tyz`; no scope-changing word removed. |
| EL/direction | `el:23aa5ab1-2649-4543-a1c9-e4a2b2a7bddd` Munji: Central Munji ↔ `glottolog:cent1974` Central Munji | Exact retained leaf or directional qualifier under `iso:mnj`; no scope-changing word removed. |
| EL/direction | `el:2ea40d50-5ecc-409c-ad60-e624d3bed62f` Fania: Northern Fania ↔ `glottolog:nort2772` Northern Fania | Exact retained leaf or directional qualifier under `iso:fni`; no scope-changing word removed. |
| EL/direction | `el:30323da6-c1a2-465a-9768-ffc9ccb57847` Tay: Southern ↔ `glottolog:sout2747` Southern Tày | Exact retained leaf or directional qualifier under `iso:tyz`; no scope-changing word removed. |
| EL/direction | `el:3553c74a-712f-4e91-9555-01c05e1823c2` Songe: Eastern Kalebwe ↔ `glottolog:east2408` Eastern Kalebwe | Exact retained leaf or directional qualifier under `iso:sop`; no scope-changing word removed. |
| EL/direction | `el:37a56dd8-311f-4ec4-8d79-3e19962c09c6` Tay: Northern ↔ `glottolog:nort2743` Northern Tày | Exact retained leaf or directional qualifier under `iso:tyz`; no scope-changing word removed. |
| EL/direction | `el:4f44b99c-e8e8-47ff-8881-9eb72ae89543` Kele: Western Kele ↔ `glottolog:west2479` Western Kele | Exact retained leaf or directional qualifier under `iso:keb`; no scope-changing word removed. |
| ROLV/other | `glottolog:aboo1241` Abo (Bokyi) ↔ `rolv:08247` Bokyi: Abo | Exact retained leaf or directional qualifier under `iso:bky`; no scope-changing word removed. |
| ROLV/other | `glottolog:adan1250` Adang (Lundayeh) ↔ `rolv:13129` Lundayeh: Adang | Exact retained leaf or directional qualifier under `iso:lnd`; no scope-changing word removed. |
| ROLV/other | `glottolog:addi1234` Addis Ababa Ethiopian Sign Language ↔ `rolv:24140` Ethiopian Sign Language: Addis Ababa | Exact retained leaf or directional qualifier under `iso:eth`; no scope-changing word removed. |
| ROLV/other | `glottolog:addi1235` Addis Ababa ↔ `rolv:30534` Amharic: Addis Ababa | Exact retained leaf or directional qualifier under `iso:amh`; no scope-changing word removed. |
| ROLV/other | `glottolog:agii1244` Agi (Moru) ↔ `rolv:14306` Moru: Agi | Exact retained leaf or directional qualifier under `iso:mgd`; no scope-changing word removed. |
| ROLV/other | `glottolog:agoi1244` Agoi (Gen) ↔ `rolv:24973` Gen: Agoi | Exact retained leaf or directional qualifier under `iso:gej`; no scope-changing word removed. |
| ROLV/other | `glottolog:aguu1242` Agu (Ewe) ↔ `rolv:24151` Ewe: Agu | Exact retained leaf or directional qualifier under `iso:ewe`; no scope-changing word removed. |
| ROLV/other | `glottolog:amba1268` Ambasi ↔ `rolv:20770` Binandere: Ambasi | Exact retained leaf or directional qualifier under `iso:bhg`; no scope-changing word removed. |
| ROLV/other | `glottolog:ambo1248` Ambo (Lala-Bisa) ↔ `rolv:12706` Lala-Bisa: Ambo | Exact retained leaf or directional qualifier under `iso:leb`; no scope-changing word removed. |
| ROLV/other | `glottolog:atis1238` Atisa ↔ `rolv:20803` Epie: Atisa | Exact retained leaf or directional qualifier under `iso:epi`; no scope-changing word removed. |
| ROLV/direction | `glottolog:cent2017` Central ↔ `rolv:12957` Limba, West-Central: Central | Exact retained leaf or directional qualifier under `iso:lia`; no scope-changing word removed. |
| ROLV/direction | `glottolog:cent2332` Central Marind ↔ `rolv:31131` Marind: Central | Exact retained leaf or directional qualifier under `iso:mrz`; no scope-changing word removed. |
| ROLV/direction | `glottolog:east2376` Eastern Ngarinman ↔ `rolv:31175` Ngarinyman: Eastern | Exact retained leaf or directional qualifier under `iso:nbj`; no scope-changing word removed. |
| ROLV/direction | `glottolog:east2392` Eastern Koromfe ↔ `rolv:26863` Koromfé: Eastern | Exact retained leaf or directional qualifier under `iso:kfz`; no scope-changing word removed. |
| ROLV/direction | `glottolog:east2888` Eastern Nggem ↔ `rolv:31178` Nggem: Eastern | Exact retained leaf or directional qualifier under `iso:nbq`; no scope-changing word removed. |
| ROLV/direction | `glottolog:nort2693` Northern Kirghiz ↔ `rolv:12042` Kyrgyz: Northern | Exact retained leaf or directional qualifier under `iso:kir`; no scope-changing word removed. |
| ROLV/direction | `glottolog:nucl1413` Central Bafut ↔ `rolv:30749` Bafut: Central | Exact retained leaf or directional qualifier under `iso:bfd`; no scope-changing word removed. |
| ROLV/direction | `glottolog:sout2669` Southern Chitral Kalasha ↔ `rolv:11394` Kalasha: Southern | Exact retained leaf or directional qualifier under `iso:kls`; no scope-changing word removed. |
| ROLV/direction | `glottolog:sout2702` Southern Kirghiz ↔ `rolv:26797` Kyrgyz: Southern | Exact retained leaf or directional qualifier under `iso:kir`; no scope-changing word removed. |
| ROLV/direction | `glottolog:west2989` Western Nggem ↔ `rolv:31179` Nggem: Western | Exact retained leaf or directional qualifier under `iso:nbq`; no scope-changing word removed. |

Special sample checks: Kacipo-Balesi: Western Suri retains the entire leaf Western Suri; Songe: Eastern Kalebwe retains Eastern Kalebwe; neither is reduced to a bare direction. Kalasha: Southern uses the parent alias Chitral Kalasha without importing the contaminated Kalasha: Northern parent alias. Central Bafut is named Central in both sources; its nucl-prefixed identifier is opaque and not grounds to reinterpret it as Standard/Nuclear.

## Required normalization correction

The refreshed candidate file removed the prior-pass ownership exclusion after the 867-pair review above. A targeted lexical-symbol inspection then found a concrete overbroad normalization hazard: `el:2aa25f11-cdb6-4a2f-84f7-2cfa525eb3c1` !Xoo: Ng|u||en versus `rolv:18367` !Xoo: Ng|u|en becomes the same key after stripping vertical bars. Click-bar multiplicity must not be discarded as layout punctuation. This pair requires independent alias evidence or a hold, not automatic naming equivalence.

Other newly visible symbol-loss candidates are `el:1dc40861-4010-4a6e-9149-93727bf8cb62` Narom: Miri versus `rolv:28975` Narom: Miri'; `glottolog:puaa1234` Pua' versus `rolv:31155` Murik: Pua; and `glottolog:ulua1243` Ulu Ai' versus `rolv:09366` Ot Danum: Ulu Ai. These may be genuine spelling equivalents, but lost apostrophes can encode sounds, so they require source alias support or explicit review. Conversely Nu: ||ng!ke versus ||Ng!ke retains identical lexical symbols and needs no blanket exclusion.

Require lexical-symbol parity on the transformed raw leaf names, allowing typography-equivalent apostrophe glyphs if explicitly normalized, but preserving presence, count and position of click/glottal symbols. Keep punctuation separating parent and leaf distinct from phonemic punctuation inside leaf names. The earlier 40-pair sample passing does not approve these newly discovered cases or the refreshed full set wholesale.

## Expanded direct-overlap review

The 3,046-pair refreshed file observed at execution contains 2,179 direct-label/alias-overlap and 867 newly reordered candidates. Repeated all-candidate structural and raw Glottolog parent checks: zero child/kind/immediate-parent/review-flag failures; zero raw Glottolog parent mismatches. Manually reviewed the following 20 newly enabled direct-overlap examples, sampled evenly through EL and ROLV groups. No additional scope defect was found in these examples. The lexical-symbol correction has reduced the earlier 3,061 candidates by 15; the earlier listed hazards remain regression requirements.

| Pair | Scope assessment |
|---|---|
| `el:010ac79a-252f-465b-86f0-ad6bde01aa98` Ningye ↔ `rolv:23878` Numana: Ningye | Same exact retained leaf under `iso:nbr`. |
| `el:2828b2ef-5efe-433d-aa3a-205c74df6089` Iban: Ketungau ↔ `rolv:03797` Ketungau | Same exact retained leaf under `iso:iba`. |
| `el:6c6f9998-b8c0-40c5-bc42-f60d03cf6a56` Walungge: Thudam ↔ `rolv:17453` Thudam | Same exact retained leaf under `iso:ola`. |
| `el:782d83ae-6daa-465c-bcf9-44a833ad8656` Panjabi, Eastern: Doab ↔ `rolv:03110` Panjabi, Eastern: Doab | Same exact retained leaf under `iso:pan`. |
| `el:8c0ada20-2cf4-47e1-949c-e602df866eac` Dalu ↔ `rolv:25727` Hajong: Dalu | Same exact retained leaf under `iso:haj`. |
| `el:92373c27-ef90-47d6-9225-a0cb9d6c918d` Tswana Rolong ↔ `rolv:17699` Tswana: Rolong | Same exact retained leaf under `iso:tsn`. |
| `el:9e9ff546-9fec-4c77-858a-24e06e1df5c2` Akha: Akha Eupa ↔ `rolv:29817` Akha: Eupa | Same exact retained leaf under `iso:ahk`. |
| `el:adf5b4a9-15d6-4c19-9f92-5208cfcc15bb` Mainstream Kenyah: Lepo' Tau ↔ `rolv:04137` Kenyah, Mainstream: Lepo' Tau | Same exact retained leaf under `iso:xkl`. |
| `el:b65f07c0-31fc-4db8-bc4a-a948191b29c5` Ngam: Gir Bor ↔ `glottolog:ngam1271` Ngam Gir Bor | Same exact retained leaf under `iso:nmc`. |
| `el:e74e8d1c-89a7-4a3c-bed0-c16c2ff47bad` Ilafuri ↔ `rolv:22624` Venda: Ilafuri | Same exact retained leaf under `iso:ven`. |
| `glottolog:aant1238` Aantantara ↔ `rolv:17070` Tairora, North: Aantantara | Same exact retained leaf under `iso:tbg`. |
| `glottolog:bomb1258` Bombali ↔ `rolv:17441` Themne: Bombali | Same exact retained leaf under `iso:tem`. |
| `glottolog:east2276` Eastern Lombard ↔ `rolv:13068` Lombard: Eastern | Same exact retained leaf under `iso:lmo`. |
| `glottolog:haru1243` Harua ↔ `rolv:08260` Bola: Harua | Same exact retained leaf under `iso:bnp`. |
| `glottolog:kono1266` Konobo ↔ `rolv:00784` Krahn, Eastern: Konobo | Same exact retained leaf under `iso:kqo`. |
| `glottolog:maut1237` Maututu ↔ `rolv:01498` Nakanai: Maututu | Same exact retained leaf under `iso:nak`. |
| `glottolog:nort2850` North Mekeo ↔ `rolv:13967` Mekeo: North | Same exact retained leaf under `iso:mek`. |
| `glottolog:rofi1238` Rofia ↔ `rolv:08980` Cishingini: Rofia | Same exact retained leaf under `iso:asg`. |
| `glottolog:sout2902` South Karakelong ↔ `rolv:17104` Talaud: South Karakelong | Same exact retained leaf under `iso:tld`. |
| `glottolog:uppe1429` Upper August River ↔ `rolv:14056` Mian: Upper August River | Same exact retained leaf under `iso:mpt`. |

## Controlled directional adjective correspondence

A separate inferred-correspondence rule may equate north/northern, south/southern, east/eastern, west/western and their explicitly enumerated intercardinal counterparts only when the entire residual leaf equals that single direction. Preserve all existing source-parent, unique-graph, competing-alias, child, direct-country, scalar and Scripture gates. This is not a global token rewrite: Eastern Northern is not eligible, and Upper, Proper, Standard and Group have no directional mapping. Recompute competitors using the same rule.

Useful current examples include East Kasem (`east2396` / ROLV 11656), West Kasem (`west2463` / 11661), North/South Nuk (`nort2911` / 15099 and `sout2935` / 15100), North/South Tabasaran (`nort3393` / 17006 and `sout2752` / 17007), North/South Tuvaluan (`nort2844` / 17858 and `sout2865` / 17859), North Udmurt (`nort2676` / EL af451e53-41fe-41d0-915c-b1ac7f23d308), Southern Vietnamese (`sout2687` / 00002), and West Tatar (`west2405` / 17246). These are candidate leads, not individual final approvals. Russian, Wano, and South Udmurt examples have Glottolog children and remain held. GRN web attempts for East Kasem/North Nuk failed and Vietnamese returned a security challenge; no web proof is claimed.
