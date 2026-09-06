"""Enrich atlas records using explicit Every Language identifiers and public facts."""
import collections
import re
from urllib.parse import urlsplit

from source_rules import normalize_rolv, scripture_status, text, valid_coordinates

MAP_URL = "https://map.everylanguage.com/map"


def add_location(builder, record, latitude, longitude, precision, label, country=None, source="everylanguage", reference=None):
    if not valid_coordinates(latitude, longitude):
        return
    location = {
        "latitude": round(float(latitude), 6), "longitude": round(float(longitude), 6),
        "precision": precision, "sourceId": source, "label": label, "countryCode": country,
    }
    if reference:
        location["sourceRecordId"] = reference
    existing = record.get("locations") or ([record["location"]] if record["location"] else [])
    if location not in existing:
        existing.append(location)
    record["location"] = record["location"] or location
    if len(existing) > 1:
        record["locations"] = existing


def enrich_everylanguage(builder, bundle):
    entities = {row["id"]: row for row in bundle.get("language-entities", []) if not row.get("deleted_at")}
    external = collections.defaultdict(list)
    grn_entities = collections.defaultdict(set)
    orphan_links = []
    for row in bundle.get("language-entity-sources", []):
        if not row.get("deleted_at"):
            external[row["language_entity_id"]].append(row)
            if row.get("source", "").casefold() == "grn" and row.get("external_id_type") == "grn_language_id":
                grn_id = normalize_rolv(row.get("external_id"))
                if grn_id:
                    grn_entities[grn_id].add(row["language_entity_id"])
            if row["language_entity_id"] not in entities:
                orphan_links.append({key: row[key] for key in ["language_entity_id", "source", "external_id_type", "external_id"]})
    builder.report["orphanEveryLanguageSourceLinks"] = orphan_links
    ambiguous_grn_ids = [{"grnLanguageId": grn_id, "languageEntityIds": sorted(entity_ids)}
                         for grn_id, entity_ids in sorted(grn_entities.items()) if len(entity_ids) > 1]
    builder.report["ambiguousEveryLanguageGrnIdentifiers"] = ambiguous_grn_ids
    stats = {row["language_entity_id"]: row for row in bundle.get("language-stats", [])}
    region_country = {row["region_id"]: row["iso2"] for row in bundle.get("region-stats", []) if row.get("iso2")}
    joshua_region_codes = collections.defaultdict(set)
    for row in bundle.get("people-groups-regions", []):
        key = text(row.get("people_id3_rog3"))
        if re.fullmatch(r"\d{5}[A-Z]{2}", key):
            iso_country = builder.rog_to_iso.get(key[5:])
            if iso_country:
                joshua_region_codes[row["region_id"]].add(iso_country)
    region_conflicts = {}
    for region_id, codes in joshua_region_codes.items():
        if len(codes) != 1:
            raise ValueError(f"Ambiguous people-group country crosswalk for region: {region_id}")
        iso_country = next(iter(codes))
        previous = region_country.get(region_id)
        if previous and previous != iso_country:
            region_conflicts[region_id] = {"everyLanguageIso2": previous, "joshuaIso2": iso_country}
        region_country[region_id] = iso_country
    builder.report["countryConflicts"] = region_conflicts

    def retain_country_conflict(record_id, region_id):
        conflict = region_conflicts.get(region_id)
        if conflict:
            builder.records[record_id]["needsReview"] = True
            builder.evidence(record_id, "Country code from Every Language region", conflict["everyLanguageIso2"], "everylanguage", MAP_URL)
            builder.evidence(record_id, "Country code from explicit Joshua Project ROG crosswalk", conflict["joshuaIso2"], "joshua", "https://joshuaproject.net/resources/datasets")
            builder.details[record_id]["notes"].append("Country sources differ. Placement follows the direct Joshua Project country crosswalk; the Every Language region code is retained for review.")

    def explicit_parent_iso_ids(entity_id):
        visited = set()
        parent_id = entities[entity_id].get("parent_id")
        while parent_id in entities and parent_id not in visited:
            visited.add(parent_id)
            parent_iso_ids = {text(item["external_id"]) for item in external[parent_id]
                              if item["external_id_type"] in {"iso-639-3", "iso639_3"}}
            parent_iso_ids = {code for code in parent_iso_ids if re.fullmatch(r"[a-z]{3}", code) and code != "xxx"}
            if parent_iso_ids:
                return parent_iso_ids
            parent_id = entities[parent_id].get("parent_id")
        return set()

    matched, added, excluded = 0, 0, 0
    matched_by_grn, conflicting_grn_rolv = 0, 0
    same_entity_grn_rolv_confirmations = 0
    grn_entities_with_multiple_ids = 0
    grn_only_entities_without_retained_rolv = 0
    unresolved_ambiguous_grn_entities = 0
    parent_iso_conflicts = []
    ambiguous_parent_iso_matches = []
    for entity_id, row in entities.items():
        identifiers = external[entity_id]
        iso_ids = {text(item["external_id"]) for item in identifiers if item["external_id_type"] in {"iso-639-3", "iso639_3"}}
        rolv_ids = {normalize_rolv(item["external_id"]) for item in identifiers if item["external_id_type"] == "rolv_code"}
        rolv_ids.discard(None)
        grn_ids = {normalize_rolv(item["external_id"]) for item in identifiers
                   if item.get("source", "").casefold() == "grn" and item.get("external_id_type") == "grn_language_id"}
        grn_ids.discard(None)
        same_entity_grn_rolv_confirmations += int(bool(grn_ids & rolv_ids))
        hierarchy_only = row["level"] == "family"
        if row["level"] not in {"language", "dialect", "mother_tongue", "family"}:
            raise ValueError(f'Unexpected Every Language classification: {row["level"]}')
        kind = "language" if row["level"] in {"language", "family"} else "dialect"
        if kind == "dialect":
            rolv_candidates = {f"rolv:{code}" for code in rolv_ids if f"rolv:{code}" in builder.records}
            grn_candidates = set()
            parent_iso_conflict = None
            ambiguous_parent_iso_match = None
            grn_rolv_conflict = len(grn_ids) == 1 and len(rolv_ids) == 1 and grn_ids != rolv_ids
            conflicting_grn_rolv += int(grn_rolv_conflict)
            if len(grn_ids) > 1:
                grn_entities_with_multiple_ids += 1
            elif len(grn_ids) == 1:
                grn_id = next(iter(grn_ids))
                target_id = f"rolv:{grn_id}"
                if target_id not in builder.records:
                    grn_only_entities_without_retained_rolv += int(not rolv_candidates)
                elif len(grn_entities[grn_id]) == 1:
                    parent_iso_ids = explicit_parent_iso_ids(entity_id) if not rolv_candidates else set()
                    target_iso = builder.records[target_id]["iso6393"]
                    if target_iso and parent_iso_ids and target_iso not in parent_iso_ids:
                        parent_iso_conflict = {"languageEntityId": entity_id, "grnLanguageId": grn_id,
                                               "parentIso6393": sorted(parent_iso_ids), "rolvIso6393": target_iso}
                        parent_iso_conflicts.append(parent_iso_conflict)
                    elif grn_rolv_conflict and not rolv_candidates:
                        pass
                    else:
                        grn_candidates.add(target_id)
                        if target_iso and len(parent_iso_ids) > 1:
                            ambiguous_parent_iso_match = {"languageEntityId": entity_id, "grnLanguageId": grn_id,
                                                          "parentIso6393": sorted(parent_iso_ids), "rolvIso6393": target_iso}
                            ambiguous_parent_iso_matches.append(ambiguous_parent_iso_match)
            candidates = rolv_candidates | grn_candidates
            matched_from_grn = bool(grn_candidates and not rolv_candidates)
        else:
            candidates = {builder.iso_ids[code] for code in iso_ids if code in builder.iso_ids}
            matched_from_grn = False
        if hierarchy_only:
            excluded += 1
            if len(candidates) != 1:
                continue
        if len(candidates) == 1:
            record_id = next(iter(candidates))
            matched += 1
            matched_by_grn += int(matched_from_grn)
        else:
            record_id = f"el:{entity_id}"
            added += 1
        record = builder.add(record_id, row["name"], kind, "everylanguage")
        if len(candidates) > 1:
            record["needsReview"] = True
            builder.details[record_id]["notes"].append("Conflicting external identifiers; kept as a separate Every Language record for review.")
        elif kind == "dialect" and parent_iso_conflict:
            record["needsReview"] = True
            builder.details[record_id]["notes"].append("The explicit Every Language parent ISO and the ROLV language code differ; kept as a separate record for review.")
        elif kind == "dialect" and grn_rolv_conflict:
            record["needsReview"] = True
            builder.details[record_id]["notes"].append("The Every Language GRN language identifier and ROLV code differ. Both source values are retained for review.")
        elif kind == "dialect" and ambiguous_parent_iso_match:
            record["needsReview"] = True
            builder.details[record_id]["notes"].append("The Every Language parent has multiple explicit ISO identifiers. The exact GRN/ROLV identity is retained and the parent evidence remains flagged for review.")
        elif kind == "dialect" and not rolv_candidates and grn_ids and (
                len(grn_ids) > 1 or any(len(grn_entities[grn_id]) > 1 for grn_id in grn_ids)):
            record["needsReview"] = True
            builder.details[record_id]["notes"].append("The GRN language identifier is ambiguous in the retained Every Language crosswalk; kept as a separate record for review.")
            unresolved_ambiguous_grn_entities += 1
        builder.el_ids[entity_id] = record_id
        data = stats.get(entity_id, {})
        iso = next(iter(iso_ids)) if len(iso_ids) == 1 else text(data.get("iso639_3"))
        if re.fullmatch(r"[a-z]{3}", iso) and iso != "xxx":
            record["iso6393"] = record["iso6393"] or iso
        if kind == "dialect" and len(rolv_ids) == 1:
            record["rolvCode"] = record["rolvCode"] or next(iter(rolv_ids))
        builder.evidence(record_id, "Every Language entity", entity_id, "everylanguage", MAP_URL)
        builder.evidence(record_id, "Every Language classification", row["level"], "everylanguage", MAP_URL)
        if hierarchy_only:
            builder.details[record_id]["notes"].append("Every Language classifies this explicit ISO record as a family/hierarchy node. Its original classification and reference points are retained alongside the language registry; it is not counted as an additional language.")
        builder.evidence(record_id, "Profile computed at", data.get("computed_at"), "everylanguage", MAP_URL, "computation time, not an upstream verification date")
        for item in identifiers:
            builder.evidence(record_id, f'{item["source"]} · {item["external_id_type"]}', item["external_id"], "everylanguage", MAP_URL, f'Source version: {item.get("version") or "not specified"}')
        bible = data.get("bible_status")
        status = scripture_status(bible)
        if bible is not None:
            builder.evidence(record_id, "Every Language Bible status code", bible, "everylanguage", MAP_URL, "computed source claim; dialect-specific verification not established")
            if hierarchy_only:
                pass
            elif kind == "language" and record["scriptureStatus"] == "unknown" and "joshua" not in record["sourceIds"]:
                record["scriptureStatus"], record["scriptureScope"] = status, "language"
            elif kind == "dialect":
                record["languageContextStatus"] = record["languageContextStatus"] or status
            elif record["scriptureStatus"] != status:
                record["needsReview"] = True
                builder.details[record_id]["notes"].append("Scripture sources differ. The displayed language status follows the direct Joshua Project language export; the Every Language claim is retained below.")
        for label, field in [("Whole Bible flag", "has_whole_bible"), ("Full audio Bible flag", "has_full_audio_bible"),
                             ("New Testament flag", "has_new_testament"), ("Portions flag", "has_portions"),
                             ("Audio recordings flag", "has_audio_recordings"), ("Audio portions flag", "has_audio_portions"),
                             ("Jesus Film flag", "has_jesus_film"), ("Population (source aggregate)", "population"),
                             ("Source Bible year", "bible_year"), ("Source NT year", "nt_year"), ("Source portions year", "portions_year")]:
            value = data.get(field)
            if value is not None:
                builder.evidence(record_id, label, "Yes" if value is True else "Not flagged" if value is False else value, "everylanguage", MAP_URL, "source aggregate; not independent variety evidence")
        for field, label in [("grn_url", "GRN resources"), ("fcbh_url", "Audio resources"), ("jf_url", "Jesus Film resources")]:
            url = text(data.get(field))
            parsed = urlsplit(url)
            if parsed.scheme in {"https", "http"} and parsed.netloc and not parsed.username and not parsed.password:
                builder.details[record_id]["links"].append({"label": label, "url": url, "sourceId": "everylanguage"})
        builder.details[record_id]["links"].append({"label": "Every Language profile", "url": f"{MAP_URL}/language/{entity_id}", "sourceId": "everylanguage"})

    for entity_id, record_id in builder.el_ids.items():
        record = builder.records[record_id]
        parent_id = builder.el_ids.get(entities[entity_id]["parent_id"])
        if parent_id and parent_id != record_id:
            if not record["parentId"]:
                record["parentId"] = parent_id
            builder.link(record_id, parent_id, "Every Language parent", "Every Language child variety")
        parent_entity = entities.get(entities[entity_id]["parent_id"])
        if parent_entity and parent_entity["level"] == "family" and not record["family"]:
            record["family"] = parent_entity["name"]

    for row in bundle.get("language-entities-regions", []):
        record_id = builder.el_ids.get(row["language_entity_id"])
        country = region_country.get(row["region_id"])
        if record_id and country:
            builder.records[record_id]["countryCodes"].append(country)
            retain_country_conflict(record_id, row["region_id"])
    coordinates = bundle.get("language-coordinates", [])
    mapped_coordinates = 0
    for row in coordinates:
        record_id = builder.el_ids.get(row["language_entity_id"])
        if record_id:
            record = builder.records[record_id]
            country = region_country.get(row["region_id"])
            if country:
                record["countryCodes"].append(country)
            add_location(builder, record, row["latitude"], row["longitude"], f'{record["kind"]}-area',
                         f'Every Language / {row.get("location_source") or "source unspecified"}: {row["region_name"]}', country,
                         reference=f'{row["language_entity_id"]}:{row["region_id"]}')
            mapped_coordinates += int(valid_coordinates(row["latitude"], row["longitude"]))
            if row.get("bible_status") is not None:
                builder.evidence(record_id, "Map-location Bible status", row["bible_status"], "everylanguage", MAP_URL, f'{row["region_name"]}; location-level computed claim')

    # Explicit people_id3_rog3 links establish country-specific identity.
    people_region_keys = {(row["people_group_id"], row["region_id"]): text(row.get("people_id3_rog3")) for row in bundle.get("people-groups-regions", [])}
    people_matched, people_added = 0, 0
    for row in bundle.get("people-coordinates", []):
        raw_key = people_region_keys.get((row["people_group_id"], row["region_id"]), "")
        record_id = f"jp:{raw_key[:5]}:{raw_key[5:]}" if re.fullmatch(r"\d{5}[A-Z]{2}", raw_key) else None
        country = region_country.get(row["region_id"])
        if record_id and record_id in builder.records:
            record = builder.records[record_id]
            people_matched += 1
        else:
            record_id = record_id or f'el-pg:{row["people_group_id"]}:{row["region_id"]}'
            record = builder.add(record_id, row.get("peop_name_in_country") or row["people_group_name"], "people-group", "everylanguage",
                                 countryCodes=[country] if country else [], population=row.get("population"), needsReview=True)
            record["scriptureStatus"] = scripture_status(row.get("primary_language_bible_status"))
            record["scriptureScope"] = "primary-language"
            code = text(row.get("primary_language_rol3"))
            record["parentId"] = builder.iso_ids.get(code)
            record["iso6393"] = code if re.fullmatch(r"[a-z]{3}", code) and code != "xxx" else None
            record["summary"] = f'{record["name"]} is a people group reported by Every Language in {row["region_name"]}. The source reports {row.get("primary_language_name") or "an unspecified language"} as its primary language.'
            builder.details[record_id]["notes"].append("Not present under the same explicit country/people ID in the current Joshua Project export. Retained as an Every Language source record for review.")
            people_added += 1
        record["sourceIds"].append("everylanguage")
        retain_country_conflict(record_id, row["region_id"])
        add_location(builder, record, row["latitude"], row["longitude"], "people-group-area", f'Every Language people-group location: {row["region_name"]}', country,
                     reference=f'{row["people_group_id"]}:{row["region_id"]}')
        builder.evidence(record_id, "Every Language people group", row["people_group_id"], "everylanguage", MAP_URL)
        for label, field in [("Every Language country population", "population"), ("Every Language primary religion", "primary_religion"), ("Every Language primary language", "primary_language_name")]:
            builder.evidence(record_id, label, row.get(field), "everylanguage", MAP_URL, "people group in country")
        builder.details[record_id]["links"].append({"label": "Every Language map", "url": MAP_URL, "sourceId": "everylanguage"})
        if record["parentId"]:
            builder.link(record_id, record["parentId"], "Primary language", "People group using this language")

    for row in bundle.get("active-project-links", []):
        record_id = builder.el_ids.get(row.get("target_language_entity_id"))
        if record_id:
            builder.evidence(record_id, "Every Language active project", row["project_name"], "everylanguage", MAP_URL, "project progress does not establish Scripture publication")
            builder.evidence(record_id, "Project chapters completed", f'{row["completed_chapters"]} / {row["total_chapters"]}', "everylanguage", MAP_URL)

    for record_id in builder.el_ids.values():
        record = builder.records[record_id]
        if record["kind"] != "dialect":
            continue
        visited = {record_id}
        parent_id = record["parentId"]
        while parent_id in builder.records and parent_id not in visited:
            visited.add(parent_id)
            parent = builder.records[parent_id]
            record["iso6393"] = record["iso6393"] or parent["iso6393"]
            record["family"] = record["family"] or parent["family"]
            if not record["countryCodes"]:
                record["countryCodes"] = parent["countryCodes"][:]
            if parent["kind"] == "language":
                record["languageContextStatus"] = parent["scriptureStatus"]
                break
            parent_id = parent["parentId"]

    builder.report["inputs"]["everyLanguageEntities"] = len(entities)
    builder.report["inputs"]["everyLanguageCoordinates"] = len(coordinates)
    builder.report["parentIsoConflictingEveryLanguageGrnMatches"] = parent_iso_conflicts
    builder.report["ambiguousParentIsoEveryLanguageGrnMatches"] = ambiguous_parent_iso_matches
    builder.report["matches"].update({"everyLanguageMatchedByIdentifier": matched, "everyLanguageAdditionalRecords": added,
                                     "everyLanguageMatchedByGrnLanguageId": matched_by_grn,
                                     "everyLanguageGrnRolvSameEntityConfirmations": same_entity_grn_rolv_confirmations,
                                     "everyLanguageAmbiguousGrnIdentifiers": len(ambiguous_grn_ids),
                                     "everyLanguageEntitiesWithMultipleGrnIdentifiers": grn_entities_with_multiple_ids,
                                     "everyLanguageGrnOnlyEntitiesWithoutRetainedRolv": grn_only_entities_without_retained_rolv,
                                     "everyLanguageUnresolvedAmbiguousGrnEntities": unresolved_ambiguous_grn_entities,
                                     "everyLanguageConflictingGrnRolvIdentifiers": conflicting_grn_rolv,
                                     "everyLanguageParentIsoConflictingGrnMatches": len(parent_iso_conflicts),
                                     "everyLanguageAmbiguousParentIsoGrnMatches": len(ambiguous_parent_iso_matches),
                                     "everyLanguageHierarchyOnly": excluded, "everyLanguageCoordinatesImported": mapped_coordinates,
                                     "everyLanguagePeopleMatched": people_matched, "everyLanguagePeopleAdditional": people_added})
