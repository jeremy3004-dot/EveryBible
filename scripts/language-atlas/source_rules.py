"""Small, explicit source conversion rules shared by atlas import stages."""
import math
import re


def text(value):
    return str(value).strip() if value is not None else ""


def normalize_rolv(value):
    value = text(value)
    if not re.fullmatch(r"\d{1,5}", value) or int(value) == 0:
        return None
    return value.zfill(5)


def scripture_status(value):
    return {"1": "needed", "2": "started", "3": "portions", "4": "nt", "5": "bible"}.get(text(value), "unknown")


def scoped_scripture(kind, value):
    status = scripture_status(value)
    if kind == "dialect":
        return "unknown", "unknown", status
    return status, ("primary-language" if kind == "people-group" else "language"), None


def valid_coordinates(latitude, longitude):
    if latitude is None or longitude is None or latitude == "" or longitude == "":
        return False
    try:
        latitude, longitude = float(latitude), float(longitude)
    except (TypeError, ValueError):
        return False
    return (math.isfinite(latitude) and math.isfinite(longitude)
            and -90 <= latitude <= 90 and -180 <= longitude <= 180
            and (latitude, longitude) != (0, 0))


def country_code(rog, crosswalk):
    return crosswalk.get(text(rog)) or None


def number(value):
    try:
        result = float(value)
        if not math.isfinite(result):
            return None
        return int(result) if result.is_integer() else result
    except (ValueError, TypeError):
        return None
