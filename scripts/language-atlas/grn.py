"""Add GRN alternate names and source map points without assuming shared identity."""
from everylanguage import add_location
from source_rules import normalize_rolv

GRN_MAP_URL = "https://gis.lightsys.org/server/rest/services/LanguageResources_v6/MapServer/1"


def enrich_grn(builder, alternate_names, map_index):
    matched_names = 0
    for row in alternate_names.get("data", {}).get("ROLVAlternateNames", []):
        code = normalize_rolv(row["ROLVCode"])
        record = builder.records.get(f"rolv:{code}")
        if record and row["LanguageTag"] in builder.rolv_tags.get(code, set()):
            record["aliases"].append(row["AlternateName"])
            matched_names += 1
    mapped, separate = 0, 0
    for row in map_index["rows"]:
        record_id = None
        if row["scope"] == "ISO_Lang":
            record_id = builder.iso_ids.get(row["iso639_3"])
        elif row["scope"] == "Dialect":
            candidate = builder.records.get(f'rolv:{row["rolv_code_exact"]}')
            if candidate and candidate["iso6393"] == row["iso639_3"]:
                record_id = candidate["id"]
        if not record_id:
            record_id = f'grnmap:{row["objectid"]}'
            parent_id = builder.iso_ids.get(row["iso639_3"])
            record = builder.add(record_id, row["grn_name"], "dialect" if row["scope"] == "Dialect" else "language", "grn-map",
                                 iso6393=row["iso639_3"] or None, parentId=parent_id, needsReview=True)
            if parent_id:
                parent = builder.records[parent_id]
                record["countryCodes"] = parent["countryCodes"][:]
                record["family"] = parent["family"]
                record["languageContextStatus"] = parent["scriptureStatus"]
                builder.link(record_id, parent_id, "Source ISO language", "GRN historical map variety")
            builder.details[record_id]["notes"].append("GRN map record has no verified match to the current canonical variety identifiers. Retained separately for review.")
            separate += 1
        record = builder.records[record_id]
        record["sourceIds"].append("grn-map")
        if row["grn_name"] != record["name"]:
            record["aliases"].append(row["grn_name"])
        if row["state"] != "Verified":
            record["needsReview"] = True
        point = row["source_coordinates"]
        if point:
            country = record["countryCodes"][0] if len(record["countryCodes"]) == 1 else None
            add_location(builder, record, point["latitude"], point["longitude"],
                         "dialect-area" if row["scope"] == "Dialect" else "language-area",
                         f'GRN MapApp: {row["location"] or "source location"} ({row["state"].lower()})', country, "grn-map", row["source_id"])
            mapped += 1
        builder.evidence(record_id, "GRN map source ID", row["source_id"], "grn-map", GRN_MAP_URL)
        builder.evidence(record_id, "GRN map verification state", row["state"], "grn-map", GRN_MAP_URL, "registry location; not Scripture verification")
        builder.evidence(record_id, "GRN source ISO", row["iso639_3"], "grn-map", GRN_MAP_URL)
        builder.evidence(record_id, "GRN map attribute coordinates", str(row["attribute_coordinates"]), "grn-map", GRN_MAP_URL, "rounded source attributes; geometry retained separately")
        builder.details[record_id]["links"].append({"label": "GRN language profile", "url": f'https://globalrecordings.net/en/language/{row["grn_language_number"]}', "sourceId": "grn-map"})
    builder.report["matches"].update({"grnAlternateNamesImported": matched_names, "grnMapSourcePoints": mapped, "grnMapSeparateRecords": separate})
