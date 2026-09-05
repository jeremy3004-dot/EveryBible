#!/usr/bin/env python3
"""Build the internal atlas from attributed source snapshots, without network access."""

import argparse
import collections
import gzip
import hashlib
import json
from pathlib import Path
import re
from source_rules import text, normalize_rolv, scripture_status, scoped_scripture, valid_coordinates, country_code, number

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "data/language-atlas/sources"
OUTPUT = ROOT / "apps/admin/data/language-atlas"
STATUS_LABELS = {
    "bible": "Complete Bible", "nt": "New Testament", "portions": "Portions",
    "started": "Translation started", "needed": "Translation needed", "unknown": "Unknown",
}
APPROXIMATE = {"related-people-group", "parent-language", "country"}


def load_json(path):
    data = path.read_bytes()
    if path.suffix == ".gz":
        data = gzip.decompress(data)
    return json.loads(data)


def table_rows(table):
    if isinstance(table, list):
        return table
    return [dict(zip(table["headers"], row)) for row in table["rows"]]


def split_values(value):
    return [part.strip() for part in text(value).split(";") if part.strip()]


def iso_codes(value):
    return sorted(set(re.findall(r"\b[A-Z]{2}\b", text(value))))


class AtlasBuilder:
    def __init__(self, registry, joshua, grn, countries):
        self.registry = registry
        self.jp = joshua
        self.grn = grn
        self.records = {}
        self.details = {}
        self.glottolog_ids = {}
        self.iso_ids = {}
        self.el_ids = {}
        self.report = {"inputs": {}, "matches": {}, "warnings": []}
        self.countries = {row["cca2"]: row["name"]["common"] for row in countries}
        self.centers = {row["cca2"]: row.get("latlng") for row in countries}
        self.rog_to_iso = {row["rog3"]: row["iso2"] for row in joshua["country_records"] if row["iso2"]}
        self.jp_languages = {row["rol3"]: row for row in joshua["language_records"]}
        self.pg_locations_by_rolv = collections.defaultdict(list)
        self.pg_locations_by_iso = collections.defaultdict(list)
        self.rolv_tags = collections.defaultdict(set)

    def add(self, record_id, name, kind, source_id, **values):
        if record_id in self.records:
            record = self.records[record_id]
            if name and name != record["name"]:
                record["aliases"].append(name)
            record["sourceIds"].append(source_id)
            return record
        record = {
            "id": record_id, "kind": kind, "name": name, "aliases": [],
            "iso6393": None, "glottocode": None, "rolvCode": None, "parentId": None,
            "family": None, "countryCodes": [], "population": None,
            "scriptureStatus": "unknown", "scriptureScope": "unknown",
            "languageContextStatus": None, "location": None, "sourceIds": [source_id],
            "summary": "", "needsReview": False,
        }
        record.update(values)
        self.records[record_id] = record
        self.details[record_id] = {"id": record_id, "biography": "", "evidence": [], "related": [], "notes": [], "links": []}
        return record

    def evidence(self, record_id, label, value, source, url, scope=None):
        if value is None or value == "":
            return
        row = {"label": label, "value": text(value), "sourceId": source, "url": url}
        if scope:
            row["scope"] = scope
        self.details[record_id]["evidence"].append(row)

    def link(self, first, second, relationship, reverse):
        if first not in self.records or second not in self.records or first == second:
            return
        for a, b, label in [(first, second, relationship), (second, first, reverse)]:
            record = self.records[b]
            self.details[a]["related"].append({"id": b, "name": record["name"], "kind": record["kind"], "relationship": label})

    def place(self, record, latitude, longitude, precision, source_id, label, country=None):
        if valid_coordinates(latitude, longitude):
            record["location"] = {
                "latitude": round(float(latitude), 6), "longitude": round(float(longitude), 6),
                "precision": precision, "sourceId": source_id, "label": label, "countryCode": country,
            }
            return True
        return False

    def ensure_language(self, code, name=None):
        if not code:
            return None
        if code in self.iso_ids:
            return self.iso_ids[code]
        record_id = f"iso:{code}" if re.fullmatch(r"[a-z]{3}", code) and code != "xxx" else f"jp-language:{code}"
        self.iso_ids[code] = record_id
        iso = code if re.fullmatch(r"[a-z]{3}", code) and code != "xxx" else None
        self.add(record_id, name or code, "language", "joshua", iso6393=iso, needsReview=iso is None)
        return record_id

    def apply_jp_language(self, record, row):
        record["sourceIds"].append("joshua")
        if row["name"] != record["name"]:
            record["aliases"].append(row["name"])
        record["scriptureStatus"], record["scriptureScope"], _ = scoped_scripture("language", row["bible_status"])
        url = f'https://joshuaproject.net/languages/{row["rol3"]}'
        for label, key in [("Scripture status", "bible_status_label"), ("Complete Bible year", "bible_year"),
                           ("New Testament year", "nt_year"), ("Portions year", "portions_year"),
                           ("Language status (JP)", "status"), ("Audio recordings reported", "audio_recordings"),
                           ("Jesus Film reported", "jesus_film"), ("YouVersion identifier", "youversion_id")]:
            self.evidence(record["id"], label, row.get(key), "joshua", url, "language")
        self.details[record["id"]]["links"].append({"label": "Joshua Project language profile", "url": url, "sourceId": "joshua"})

    def add_registry_languages(self):
        rows = table_rows(self.registry["language_crosswalk"])
        self.report["inputs"]["localLanguageRecords"] = len(rows)
        for row in rows:
            code = text(row["Source Join Code"])
            iso = text(row["ISO 639-3 Code"]) or None
            record_id = row["Canonical Entity ID"]
            self.iso_ids[code] = record_id
            record = self.add(record_id, row["Canonical Name"], "language", "registry", iso6393=iso,
                              countryCodes=iso_codes(row["Glottolog Country IDs"]) or iso_codes(row["ROLV Countries"]),
                              needsReview=bool(row["Review Flag"]))
            for key in ["ISO Ref Name", "ROLV Language Name(s)", "JP Language Name", "Glottolog ISO-coded Name(s)"]:
                record["aliases"].extend(split_values(row[key]))
            for label in ["ISO Scope", "ISO Language Type", "ISO Status", "ISO Retirement Reason", "ISO Replacement Code", "Review Flag"]:
                self.evidence(record_id, label, row[label], "registry", "https://iso639-3.sil.org/code_tables/639/data")
            if row["Review Flag"]:
                self.details[record_id]["notes"].append(f'Local registry review: {row["Review Flag"]}')
            jp_row = self.jp_languages.get(code)
            if jp_row:
                self.apply_jp_language(record, jp_row)
            elif text(row["JP Bible Status"]):
                record["scriptureStatus"], record["scriptureScope"], _ = scoped_scripture("language", row["JP Bible Status"])
                self.evidence(record_id, "Saved Scripture status", row["JP Bible Status"], "registry", f"https://joshuaproject.net/languages/{code}", "language; saved 2026-08-22")
        for code, row in self.jp_languages.items():
            if code not in self.iso_ids:
                record_id = self.ensure_language(code, row["name"])
                self.apply_jp_language(self.records[record_id], row)

    def add_glottolog(self):
        rows = [row for row in table_rows(self.registry["raw_glottolog_5_3"]) if row.get("level") in {"language", "dialect", "family"}]
        tree = {row["id"]: row for row in rows}
        self.report["inputs"]["glottolog"] = dict(collections.Counter(row["level"] for row in rows))
        for level in ["language", "dialect"]:
            for row in rows:
                if row["level"] != level:
                    continue
                code = text(row["iso639P3code"])
                record_id = self.iso_ids.get(code) if level == "language" else None
                if not record_id or self.records[record_id]["glottocode"]:
                    record_id = f'glottolog:{row["id"]}'
                record = self.add(record_id, row["name"], level, "glottolog")
                self.glottolog_ids[row["id"]] = record_id
                record["glottocode"] = row["id"]
                record["iso6393"] = record["iso6393"] or code or None
                record["countryCodes"] = sorted(set(record["countryCodes"] + iso_codes(row["country_ids"])))
                root = tree.get(row["family_id"])
                record["family"] = root["name"] if root else None
                primary_country = record["countryCodes"][0] if len(record["countryCodes"]) == 1 else None
                self.place(record, row["latitude"], row["longitude"], f"{level}-area", "glottolog", "Glottolog reference location", primary_country)
                url = f'https://glottolog.org/resource/languoid/id/{row["id"]}'
                self.evidence(record_id, "Glottocode", row["id"], "glottolog", url)
                self.evidence(record_id, "Classification", level, "glottolog", url)
                self.evidence(record_id, "Parent Glottocode", row["parent_id"], "glottolog", url)
                self.details[record_id]["links"].append({"label": "Glottolog profile", "url": url, "sourceId": "glottolog"})
        for row in rows:
            if row["level"] != "dialect":
                continue
            record = self.records[self.glottolog_ids[row["id"]]]
            ancestor = tree.get(row["parent_id"])
            visited = set()
            language = None
            while ancestor and ancestor["id"] not in visited:
                visited.add(ancestor["id"])
                if ancestor["level"] == "language":
                    language = ancestor
                    break
                ancestor = tree.get(ancestor["parent_id"])
            record["parentId"] = self.glottolog_ids.get(row["parent_id"]) or (self.glottolog_ids.get(language["id"]) if language else None)
            if language:
                parent = self.records[self.glottolog_ids[language["id"]]]
                record["iso6393"] = parent["iso6393"]
                record["countryCodes"] = record["countryCodes"] or parent["countryCodes"][:]
                record["languageContextStatus"] = parent["scriptureStatus"]
            if record["parentId"]:
                self.link(record["id"], record["parentId"], "Parent classification", "Glottolog dialect")

    def add_rolv(self):
        local = table_rows(self.registry["raw_rolv"])
        current = self.grn.get("data", {}).get("ROLVCodes", []) if isinstance(self.grn, dict) else self.grn
        saved = {normalize_rolv(row["ROLVCode"]): row for row in local}
        live = {normalize_rolv(row["ROLVCode"]): row for row in current}
        if len(saved) != len(local) or len(live) != len(current):
            raise ValueError("ROLV identifiers are not unique within a source snapshot")
        self.report["inputs"]["rolvSaved"] = len(saved)
        self.report["inputs"]["rolvCurrent"] = len(live)
        self.report["matches"]["rolvAbsentFromCurrent"] = sorted(set(saved) - set(live))
        for code in sorted(set(saved) | set(live)):
            if not code:
                raise ValueError("ROLV source contains an invalid identifier")
            row = live.get(code) or saved[code]
            self.rolv_tags[code].add(row["LanguageTag"])
            if code in saved:
                self.rolv_tags[code].add(saved[code]["LanguageTag"])
            iso = text(row["LanguageCode"])
            parent_id = self.ensure_language(iso, row["LanguageName"])
            record_id = f"rolv:{code}"
            record = self.add(record_id, row["VarietyName"] or row["LanguageName"], "dialect", "grn",
                              iso6393=iso or None, rolvCode=code, parentId=parent_id,
                              countryCodes=iso_codes(row["CountryCode"]), needsReview=code not in live)
            if parent_id:
                parent = self.records[parent_id]
                record["family"] = parent["family"]
                record["languageContextStatus"] = parent["scriptureStatus"]
                self.link(record_id, parent_id, "Associated ISO language", "ROLV variety")
            url = f"https://globalrecordings.net/en/language/{code}"
            for label, key in [("ROLV code", "ROLVCode"), ("Language tag", "LanguageTag"), ("Registry location", "LocationName")]:
                self.evidence(record_id, label, code if key == "ROLVCode" else row[key], "grn", url)
            self.details[record_id]["links"].append({"label": "GRN language variety", "url": url, "sourceId": "grn"})
            if code in saved:
                record["sourceIds"].append("registry")
                if code in live:
                    changed = [key for key in ["LanguageCode", "LanguageName", "LanguageTag", "VarietyName", "CountryCode", "LocationName"] if text(saved[code][key]) != text(live[code][key])]
                    if changed:
                        record["needsReview"] = True
                        self.details[record_id]["notes"].append("Current GRN and saved registry differ in: " + ", ".join(changed) + ". Both values are retained as source evidence.")
                        for key in changed:
                            self.evidence(record_id, f"Saved {key}", saved[code][key], "registry", url, "saved 2026-08-22")
                            self.evidence(record_id, f"Current {key}", live[code][key], "grn", url)
                if saved[code]["VarietyName"] != record["name"]:
                    record["aliases"].append(saved[code]["VarietyName"])
                    self.evidence(record_id, "Saved variety name", saved[code]["VarietyName"], "registry", url, "saved 2026-08-22")
            if code not in live:
                self.details[record_id]["notes"].append("Present in the saved DIALECTS registry; not returned in the current GRN export. Retained for review.")

    def add_people_groups(self):
        self.report["inputs"]["joshuaPeopleGroups"] = len(self.jp["people_group_country_records"])
        for row in self.jp["people_group_country_records"]:
            record_id = f'jp:{row["people_id3"]}:{row["rog3"]}'
            country = country_code(row["rog3"], self.rog_to_iso)
            parent_id = self.ensure_language(row["rol3"], row["primary_language_name"])
            status, scope, _ = scoped_scripture("people-group", row["bible_status"])
            record = self.add(record_id, row["people_name_in_country"], "people-group", "joshua",
                              iso6393=row["rol3"] if re.fullmatch(r"[a-z]{3}", row["rol3"]) and row["rol3"] != "xxx" else None, parentId=parent_id,
                              family=row["language_family"], countryCodes=[country] if country else [],
                              population=row["population"], scriptureStatus=status, scriptureScope=scope)
            record["aliases"].append(row["people_name_across_countries"])
            self.place(record, row["latitude"], row["longitude"], "people-group-area", "joshua", "Joshua Project people-group reference location", country)
            url = f'https://joshuaproject.net/people_groups/{row["people_id3"]}/{row["rog3"]}'
            self.details[record_id]["links"].append({"label": "Joshua Project people profile", "url": url, "sourceId": "joshua"})
            for label, key in [("People ID", "people_id3"), ("Country (Joshua Project)", "country_name"),
                               ("Primary language", "primary_language_name"), ("Population estimate", "population"),
                               ("Primary religion", "primary_religion"), ("People cluster", "people_cluster"),
                               ("Affinity bloc", "affinity_bloc"), ("Primary-language Scripture", "bible_status_label")]:
                self.evidence(record_id, label, row[key], "joshua", url, "people group in country" if key != "bible_status_label" else "primary language; not dialect-specific")
            self.details[record_id]["notes"].append("A people group is a sociocultural community, not necessarily a distinct language. Location is a reference point; population and religion are source estimates.")
            if parent_id:
                self.link(record_id, parent_id, "Primary language", "People group using this language")
                parent = self.records[parent_id]
                if country:
                    parent["countryCodes"].append(country)
                if record["location"]:
                    self.pg_locations_by_iso[row["rol3"]].append(record)
            population = f' An estimated {row["population"]:,} people.' if row["population"] else ""
            religion = f' The reported primary religion is {row["primary_religion"]}.' if row["primary_religion"] else ""
            record["summary"] = f'{record["name"]} is a people group in {row["country_name"]}.{population} Its primary language is {row["primary_language_name"]}.{religion}'
        for row in self.jp["people_language_records"]:
            pg_id = f'jp:{row["people_id3"]}:{row["rog3"]}'
            if pg_id not in self.records:
                continue
            language_id = self.iso_ids.get(row["rol3"])
            if language_id and language_id != self.records[pg_id]["parentId"]:
                self.link(pg_id, language_id, "Additional reported language", "People group using this language")
            rolv = normalize_rolv(row["rol4_raw"])
            if rolv and f"rolv:{rolv}" in self.records and self.records[f"rolv:{rolv}"]["iso6393"] == row["rol3"]:
                self.link(pg_id, f"rolv:{rolv}", "ROL4 + ISO match (reviewable)", "People group linked by ROL4 + ISO")
                if self.records[pg_id]["location"]:
                    self.pg_locations_by_rolv[rolv].append(self.records[pg_id])

    def apply_approximate_locations(self):
        for record in self.records.values():
            if record["location"]:
                continue
            candidates = self.pg_locations_by_rolv.get(record["rolvCode"], []) if record["kind"] == "dialect" else self.pg_locations_by_iso.get(record["iso6393"], [])
            candidates = [candidate for candidate in candidates if not record["countryCodes"] or candidate["location"]["countryCode"] in record["countryCodes"]]
            if candidates:
                candidate = max(candidates, key=lambda row: row["population"] or 0)
                location = candidate["location"]
                self.place(record, location["latitude"], location["longitude"], "related-people-group", location["sourceId"], f'Approximate context: linked people group {candidate["name"]}', location["countryCode"])
        # Resolve parent chains without inventing positions or following cycles.
        for record in self.records.values():
            if record["location"]:
                continue
            parent_id = record["parentId"]
            visited = {record["id"]}
            while parent_id in self.records and parent_id not in visited:
                visited.add(parent_id)
                parent = self.records[parent_id]
                location = parent["location"]
                if location and location["precision"] not in APPROXIMATE:
                    country = location["countryCode"]
                    if not country or not record["countryCodes"] or country in record["countryCodes"]:
                        self.place(record, location["latitude"], location["longitude"], "parent-language", location["sourceId"], f'Approximate context: parent {parent["name"]}', country)
                        break
                parent_id = parent["parentId"]
            if not record["location"]:
                for country in record["countryCodes"]:
                    coordinates = self.centers.get(country)
                    if coordinates and self.place(record, coordinates[0], coordinates[1], "country", "countries", f'Country center only: {self.countries.get(country, country)}', country):
                        break

    def finish(self, sources, generated_at):
        self.apply_approximate_locations()
        for record_id, record in self.records.items():
            locations = record.get("locations") or ([record["location"]] if record["location"] else [])
            evidence_sources = [row["sourceId"] for row in self.details[record_id]["evidence"]]
            record["sourceIds"] = sorted(set(record["sourceIds"] + evidence_sources + [location["sourceId"] for location in locations]))
            record["aliases"] = sorted({alias for alias in record["aliases"] if alias and alias != record["name"]})
            record["countryCodes"] = sorted(set(record["countryCodes"]))
            detail = self.details[record_id]
            detail["related"] = list({(row["id"], row["relationship"]): row for row in detail["related"]}.values())
            detail["links"] = list({row["url"]: row for row in detail["links"]}.values())
            parent = self.records.get(record["parentId"])
            if record["kind"] == "dialect":
                if parent:
                    classification = "ROLV variety" if record["rolvCode"] else "Glottolog dialect" if record["glottocode"] else "language variety"
                    record["summary"] = f'{record["name"]} is a {classification} associated with {parent["name"]}.'
                else:
                    record["summary"] = f'{record["name"]} is a recorded dialect or language variety.'
                record["summary"] += " Scripture availability for this specific variety is unconfirmed."
                detail["notes"].append("A parent language's Scripture or audio resources do not prove coverage for this exact dialect. The same variety can have separate registry records where identity has not been verified.")
            elif record["kind"] == "language" and not record["summary"]:
                family = f' Classified in {record["family"]}.' if record["family"] else ""
                countries = ", ".join(self.countries.get(code, code) for code in record["countryCodes"][:4])
                geography = f' Associated with {countries}{" and other countries" if len(record["countryCodes"]) > 4 else ""}.' if countries else ""
                status = STATUS_LABELS[record["scriptureStatus"]]
                coverage = f' Language-level Scripture status: {status.lower()}.' if record["scriptureStatus"] != "unknown" else " Language-level Scripture status is unreported."
                record["summary"] = f'{record["name"]} is a language record.{family}{geography}{coverage}'
            detail["biography"] = record["summary"]
            detail["notes"] = list(dict.fromkeys(detail["notes"]))
            if record["location"]:
                location = record["location"]
                self.evidence(record_id, "Map placement", location["label"], location["sourceId"], next((source["url"] for source in sources if source["id"] == location["sourceId"]), "https://map.everylanguage.com/map"), location["precision"])
            else:
                detail["notes"].append("No usable coordinates or country placement are available. This record remains in the list.")
            if record["kind"] == "dialect" and record["scriptureStatus"] != "unknown":
                raise ValueError(f"Dialect unexpectedly inherited Scripture status: {record_id}")
            if record["parentId"] and record["parentId"] not in self.records:
                raise ValueError(f"Missing parent: {record_id}")
        records = sorted(self.records.values(), key=lambda record: (record["kind"], record["name"].casefold(), record["id"]))
        counts = {
            "records": len(records), "languages": sum(row["kind"] == "language" for row in records),
            "dialects": sum(row["kind"] == "dialect" for row in records),
            "peopleGroups": sum(row["kind"] == "people-group" for row in records),
            "mapped": sum(row["location"] is not None for row in records),
            "approximate": sum(row["location"] is not None and row["location"]["precision"] in APPROXIMATE for row in records),
            "unmapped": sum(row["location"] is None for row in records),
            "needsReview": sum(row["needsReview"] for row in records),
        }
        self.report["output"] = counts
        index = {"schemaVersion": 1, "generatedAt": generated_at, "records": records, "countries": [{"code": code, "name": name} for code, name in sorted(self.countries.items(), key=lambda item: item[1])], "sources": sources, "counts": counts, "notes": [
            "Counts are registry records, not a definitive count of distinct living languages. Language, dialect, and people-group identities stay separate.",
            "Unknown Scripture availability is not evidence that no Scripture exists. Dialect coverage is not inferred from a parent language.",
            "Dots represent source reference locations or explicitly labelled context. Parent-language and country placements are approximate, not settlement coordinates.",
            "Country filters use source-reported associations; a language's reference point may be in another associated country.",
            "Data provided by Joshua Project. Internal, noncommercial ministry research; source attribution and usage terms apply.",
            "Glottolog data: CC BY 4.0. GRN recordings are gospel/audio resources, not automatic evidence of an audio Bible.",
        ]}
        return index, self.details, self.report


def encode_snapshot(value):
    return gzip.compress(json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode(), mtime=0)


def write_output(name, data, check):
    output = OUTPUT / name
    if check:
        if not output.exists() or output.read_bytes() != data:
            raise ValueError(f"Snapshot differs: {output.relative_to(ROOT)}")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main():
    from everylanguage import enrich_everylanguage
    from grn import enrich_grn

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the snapshots reproduce exactly without writing")
    args = parser.parse_args()
    registry = load_json(SOURCES / "registry-workbook-data-20260822.json.gz")
    joshua = load_json(SOURCES / "joshua-project-atlas.json.gz")
    grn = load_json(SOURCES / "grn-rolv-codes-20260905.json")
    country_path = ROOT / "node_modules/world-countries/countries.json"
    countries = load_json(country_path)
    bundle = {name: load_json(SOURCES / f"everylanguage-{name}.json.gz") for name in [
        "language-entities", "language-entity-sources", "language-stats", "language-coordinates",
        "language-entities-regions", "regions", "region-stats", "people-groups-regions", "people-coordinates", "active-project-links",
    ]}
    registry_manifest = load_json(SOURCES / "registry-source-manifest.json")
    el_manifest = load_json(SOURCES / "everylanguage-snapshot-manifest.json")
    snapshot_date = max(registry_manifest["retrieved_at"][:10], el_manifest["retrieved_on"], joshua["accessed_at"][:10])
    sources = [
        {"id": "registry", "name": "DIALECTS source registry", "url": "/languages#sources", "retrievedAt": "2026-08-22", "version": "Saved language crosswalk and source tables", "license": "Each original source retains its own terms", "attribution": "DIALECTS research collection", "note": "Original language and variety records are retained, including retired or unmatched source codes. Ethnologue was not imported.", "recordCount": len(registry["language_crosswalk"]["rows"])},
        {"id": "glottolog", "name": "Glottolog", "url": "https://glottolog.org/meta/downloads", "retrievedAt": "2026-08-22", "version": "5.3", "license": "CC BY 4.0", "attribution": "Hammarström, Forkel, Haspelmath & Bank, Glottolog 5.3", "note": "Languages and dialects retain explicit Glottocodes and hierarchy. Family nodes provide classification context only.", "recordCount": 27177},
        {"id": "grn", "name": "GRN / ROLV", "url": "https://globalrecordings.net/en/rolv", "retrievedAt": registry_manifest["retrieved_at"], "version": "Current registry plus saved varieties", "license": "GRN/HIS registry terms; internal research", "attribution": "Global Recordings Network / Registry of Language Varieties", "note": "The current registry has 12,400 varieties. Seven saved records absent from the current feed remain visible for review. Media is linked, not copied.", "recordCount": len(grn["data"]["ROLVCodes"])},
        {"id": "grn-map", "name": "GRN MapApp", "url": "https://gis.lightsys.org/server/rest/services/LanguageResources_v6/MapServer/1", "retrievedAt": registry_manifest["retrieved_at"], "version": "LanguageResources_v6, layer 1", "license": "Source attribution retained; internal research", "attribution": "Global Recordings Network / LightSys MapApp", "note": "Complete published layer, partial worldwide coverage. Source map points and rounded attributes can differ; neither is a settlement boundary.", "recordCount": 1476},
        {"id": "joshua", "name": "Joshua Project", "url": "https://joshuaproject.net", "retrievedAt": joshua["accessed_at"], "version": "Public bulk exports", "license": "Noncommercial missions research and educational use", "attribution": "Data provided by Joshua Project", "note": "Language, people-group-in-country and relationship tables stay separate. Populations and geography are estimates. Scripture status is language-level.", "recordCount": len(joshua["people_group_country_records"])},
        {"id": "everylanguage", "name": "Every Language map", "url": "https://map.everylanguage.com/map", "retrievedAt": el_manifest["retrieved_on"], "version": "Public map and profile snapshot", "license": "Owner-authorized internal research; upstream terms retained", "attribution": "Every Language and its attributed source providers", "note": "Matched using explicit external IDs. Computation timestamps do not establish when upstream claims were verified. Profile flags remain separate from exact dialect evidence.", "recordCount": len(bundle["language-entities"])},
        {"id": "countries", "name": "Country reference locations", "url": "https://github.com/mledoze/countries", "retrievedAt": snapshot_date, "version": "world-countries 5.1.0 (installed dependency)", "license": "ODbL-1.0", "attribution": "mledoze/countries contributors", "note": "Country centers are context only and always labelled approximate.", "recordCount": len(countries)},
    ]
    builder = AtlasBuilder(registry, joshua, grn, countries)
    builder.add_registry_languages()
    builder.add_glottolog()
    builder.add_rolv()
    builder.add_people_groups()
    enrich_everylanguage(builder, bundle)
    enrich_grn(builder, load_json(SOURCES / "grn-rolv-alternate-names-20260905.json"), load_json(SOURCES / "grn-mapapp-language-variety-index-20260905.json"))
    index, details, report = builder.finish(sources, snapshot_date)
    for row in table_rows(registry["language_crosswalk"]):
        if row["Canonical Entity ID"] not in builder.records:
            raise ValueError("A saved language record was lost")
    for row in table_rows(registry["raw_glottolog_5_3"]):
        if row.get("level") in {"language", "dialect"} and row["id"] not in builder.glottolog_ids:
            raise ValueError("A Glottolog language or dialect was lost")
    report["artifacts"] = {"index.json.gz": write_output("index.json.gz", encode_snapshot(index), args.check)}
    shards = {format(value, "x"): {} for value in range(16)}
    for record_id, detail in details.items():
        shards[hashlib.sha256(record_id.encode()).hexdigest()[0]][record_id] = detail
    for shard, records in shards.items():
        name = f"details-{shard}.json.gz"
        report["artifacts"][name] = write_output(name, encode_snapshot(records), args.check)
    report["sourceFiles"] = [{"file": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size} for path in sorted(SOURCES.iterdir()) if path.is_file() and path.suffix not in {".py", ".pyc"}]
    report_bytes = (json.dumps(report, indent=2, sort_keys=True) + "\n").encode()
    write_output("build-report.json", report_bytes, args.check)
    print(json.dumps({"verified" if args.check else "built": index["counts"], "artifacts": report["artifacts"]}, indent=2))


if __name__ == "__main__":
    main()
