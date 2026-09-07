"""Export the reviewed, recently active Every Language portfolio for the public atlas."""

import argparse
import csv
import gzip
import io
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data/language-atlas/sources/langquest-status-2026-09-07.csv"
LINKS_SOURCE = ROOT / "data/language-atlas/sources/langquest-project-atlas-links.json"
TARGET = ROOT / "apps/site/data/language-atlas/projects.json"
ACTIVITY_WINDOW_DAYS = 30

def _number(value, field, project, *, integer=False, required=True):
    value = value.strip()
    if not value:
        if required:
            raise ValueError(f"Missing {field}: {project}")
        return None
    try:
        number = int(value) if integer else float(value)
    except ValueError as error:
        raise ValueError(f"Invalid {field}: {project}") from error
    if number < 0 or (field.endswith("%") and number > 100):
        raise ValueError(f"Invalid {field}: {project}")
    return number


def parse_portfolio(text):
    """Parse the dashboard's three-line preamble and its CSV table."""
    lines = text.splitlines()
    header_index = next((index for index, line in enumerate(lines) if line.startswith("Project Name,")), None)
    if header_index is None:
        raise ValueError("LangQuest export has no project table")
    metadata = {}
    for line in lines[:header_index]:
        if not line.startswith("# "):
            continue
        cells = next(csv.reader([line[2:]]))
        if len(cells) >= 2:
            metadata[cells[0].strip()] = cells[1].strip()
    rows = list(csv.DictReader(io.StringIO("\n".join(lines[header_index:]))))
    stamp = metadata.get("Generated at (UTC)")
    source = metadata.get("Source")
    if not stamp or not source:
        raise ValueError("LangQuest export is missing generation metadata")
    return rows, stamp, source


def recent_row(row):
    match = re.fullmatch(r"(\d+)d ago", row.get("Last Activity", "").strip())
    return bool(match and int(match.group(1)) <= ACTIVITY_WINDOW_DAYS)


def project_projection(rows, links, records, generated_at, source):
    records_by_id = {record["id"]: record for record in records}
    projects = []
    for row in rows:
        if not recent_row(row):
            continue
        name = row["Project Name"].strip()
        if not name:
            raise ValueError("Project row has no name")
        link = links.get(name)
        record_id = link.get("recordId") if link else None
        if record_id and record_id not in records_by_id:
            raise ValueError(f"Atlas link does not exist: {name}")
        chapters = _number(row["Chapters Recorded"], "Chapters Recorded", name, integer=True)
        total_chapters = _number(row["Total Chapters"], "Total Chapters", name, integer=True)
        if total_chapters <= 0 or chapters > total_chapters:
            raise ValueError(f"Invalid chapter totals: {name}")
        total_books = _number(row["Total Books"], "Total Books", name, integer=True)
        recordings = _number(row["Recordings"], "Recordings", name, integer=True)
        projects.append(
            {
                "recordId": record_id,
                "name": name,
                "languageName": link.get("languageName") if link else name,
                "totalBooks": total_books,
                "chaptersRecorded": chapters,
                "totalChapters": total_chapters,
                "recordedPercentage": _number(row["Chapters Recorded %"], "Chapters Recorded %", name),
                "gospelPercentage": _number(row["Gospel %"], "Gospel %", name, required=False),
                "ntPercentage": _number(row["NT %"], "NT %", name, required=False),
                "otPercentage": _number(row["OT %"], "OT %", name, required=False),
                "recordings": recordings,
                "lastActivityDaysAgo": int(row["Last Activity"].split("d", 1)[0]),
            }
        )
    return {
        "asOf": generated_at[:10],
        "generatedAt": generated_at,
        "source": source,
        "activityWindowDays": ACTIVITY_WINDOW_DAYS,
        "projects": sorted(projects, key=lambda project: project["name"].casefold()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    folder = ROOT / "apps/admin/data/language-atlas"
    index = json.load(gzip.open(folder / "index.json.gz"))
    links_data = json.loads(LINKS_SOURCE.read_text(encoding="utf-8"))
    links = links_data["links"]
    rows, generated_at, source = parse_portfolio(SOURCE.read_text(encoding="utf-8-sig"))
    output = project_projection(rows, links, index["records"], generated_at, source)
    encoded = json.dumps(output, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not TARGET.exists() or TARGET.read_text(encoding="utf-8") != encoded:
            raise SystemExit("Public project snapshot is stale; run build_public_projects.py")
    else:
        TARGET.write_text(encoded, encoding="utf-8")
    print(f"Public projects: {len(output['projects'])}; active within {ACTIVITY_WINDOW_DAYS} days; snapshot {output['asOf']}")


if __name__ == "__main__":
    main()
