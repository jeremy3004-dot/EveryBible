#!/usr/bin/env python3
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from deep_translator import GoogleTranslator, MyMemoryTranslator


REPO_ROOT = Path(__file__).resolve().parents[1]
LOCALES_DIR = REPO_ROOT / "src" / "i18n" / "locales"
ALLOWED_ENGLISH_VALUES = {"auth.emailPlaceholder", "gather.lessonsProgress"}
PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")
CONTEXT_MARKER_RE = re.compile(r"\s*__CTX_[A-Z_]+__\s*")
BATCH_SIZE = 20
MAX_PASSES = 3

LANGUAGE_CODE_MAP = {
    "zh": "zh-CN",
    "hi": "hi",
    "es": "es",
    "ar": "ar",
    "fr": "fr",
    "bn": "bn",
    "pt": "pt",
    "ru": "ru",
    "ur": "ur",
    "id": "id",
    "de": "de",
    "ja": "ja",
    "pa": "pa",
    "mr": "mr",
    "te": "te",
    "tr": "tr",
    "ta": "ta",
    "vi": "vi",
    "ko": "ko",
    "ne": "ne",
}

MYMEMORY_LANGUAGE_CODE_MAP = {
    "zh": "zh-CN",
    "hi": "hi-IN",
    "es": "es-ES",
    "ar": "ar-SA",
    "fr": "fr-FR",
    "bn": "bn-IN",
    "pt": "pt-PT",
    "ru": "ru-RU",
    "ur": "ur-PK",
    "id": "id-ID",
    "de": "de-DE",
    "ja": "ja-JP",
    "pa": "pa-IN",
    "mr": "mr-IN",
    "te": "te-IN",
    "tr": "tr-TR",
    "ta": "ta-IN",
    "vi": "vi-VN",
    "ko": "ko-KR",
    "ne": "ne-NP",
}


def run_node(script: str) -> str:
    process = subprocess.run(
        ["node", "--import", "tsx", "-e", script],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return process.stdout


def load_supported_languages() -> list[str]:
    script = """
import languages from './src/constants/languages.ts';
console.log(JSON.stringify(languages.SUPPORTED_LANGUAGES.map((language) => language.code)));
"""
    return json.loads(run_node(script))


def load_locale(code: str) -> dict[str, Any]:
    script = f"""
import localeModule from './src/i18n/locales/{code}.ts';
console.log(JSON.stringify(localeModule['{code}']));
"""
    return json.loads(run_node(script))


def flatten_entries(tree: dict[str, Any], prefix: str = "") -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = []
    for key, value in tree.items():
        next_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            items.extend(flatten_entries(value, next_key))
        else:
            items.append((next_key, value))
    return items


def set_nested_value(tree: dict[str, Any], key_path: str, value: str) -> None:
    parts = key_path.split(".")
    current: dict[str, Any] = tree
    for part in parts[:-1]:
        next_node = current.get(part)
        if not isinstance(next_node, dict):
            next_node = {}
            current[part] = next_node
        current = next_node
    current[parts[-1]] = value


def should_translate_key(key: str, locale_entries: dict[str, str], english_entries: dict[str, str]) -> bool:
    if key in ALLOWED_ENGLISH_VALUES:
        return False

    if key not in locale_entries:
        return True

    locale_value = locale_entries[key]
    english_value = english_entries[key]
    return locale_value == english_value and bool(re.search(r"[A-Za-z]", locale_value))


def collect_keys_to_translate(
    locale_entries: dict[str, str], english_entries: dict[str, str]
) -> dict[str, str]:
    return {
        key: english_entries[key]
        for key in english_entries
        if should_translate_key(key, locale_entries, english_entries)
    }


def context_marker_for_key(key: str) -> str | None:
    if key.startswith("bible.books."):
        return "__CTX_BIBLE_BOOK__"

    if key.startswith("annotations.colors."):
        return "__CTX_COLOR_NAME__"

    if key.startswith("groups.session.duration"):
        return "__CTX_DURATION_LABEL__"

    if key in {
        "about.version",
        "audio.showText",
        "auth.name",
        "annotations.note",
        "bible.shareVerseImage",
        "bible.title",
        "common.ok",
        "engagement.minutes",
        "fields.gospelTitle",
        "gather.application",
        "translations.download",
    }:
        return "__CTX_UI_LABEL__"

    if key.startswith("gather.topic"):
        return "__CTX_TOPIC_LABEL__"

    return None


def protect_placeholders(key: str, text: str) -> tuple[str, list[str]]:
    placeholders = PLACEHOLDER_RE.findall(text)
    protected = text
    for index, placeholder in enumerate(placeholders):
        protected = protected.replace(placeholder, f"PH_{index}")
    protected = protected.replace("EveryBible", "EVERYBIBLE_APP")
    protected = protected.replace("Every Bible", "EVERY_BIBLE_APP")
    context_marker = context_marker_for_key(key)
    if context_marker:
        protected = f"{protected} {context_marker}"
    return protected, placeholders


def restore_placeholders(text: str, placeholders: list[str]) -> str:
    restored = CONTEXT_MARKER_RE.sub("", text).strip()
    for index, placeholder in enumerate(placeholders):
        restored = restored.replace(f"PH_{index}", placeholder)
    restored = restored.replace("EVERYBIBLE_APP", "EveryBible")
    restored = restored.replace("EVERY_BIBLE_APP", "Every Bible")
    return restored


def retry_with_mymemory(code: str, key: str, text: str) -> str | None:
    try:
        translator = MyMemoryTranslator(
            source="en-US",
            target=MYMEMORY_LANGUAGE_CODE_MAP.get(code, LANGUAGE_CODE_MAP[code]),
        )
        request_text = text
        if key.startswith("bible.books."):
            request_text = f"Bible book ||| {text}"
        translated = translator.translate(request_text)
        if translated is None:
            return None
        if key.startswith("bible.books.") and "|||" in translated:
            translated = translated.split("|||", 1)[1].strip()
        return translated.strip()
    except Exception:
        return None


def translate_values(code: str, values: dict[str, str]) -> dict[str, str]:
    if not values:
        return {}

    translator = GoogleTranslator(source="en", target=LANGUAGE_CODE_MAP[code])
    translated: dict[str, str] = {}
    keys = list(values.keys())

    for start in range(0, len(keys), BATCH_SIZE):
        batch_keys = keys[start : start + BATCH_SIZE]
        protected_batch: list[str] = []
        placeholder_sets: list[list[str]] = []

        for key in batch_keys:
            protected, placeholders = protect_placeholders(key, values[key])
            protected_batch.append(protected)
            placeholder_sets.append(placeholders)

        try:
            batch_results = translator.translate_batch(protected_batch)
        except Exception:
            batch_results = None

        if batch_results is None or len(batch_results) != len(batch_keys):
            batch_results = []
            for protected_text in protected_batch:
                translated_text = translator.translate(protected_text)
                if translated_text is None:
                    raise RuntimeError(f"Translation failed for {code} at batch starting {start}")
                batch_results.append(translated_text)

        for key, translated_text, placeholders, protected_text in zip(
            batch_keys, batch_results, placeholder_sets, protected_batch
        ):
            restored_text = restore_placeholders(translated_text, placeholders)
            if restored_text == values[key] and bool(re.search(r"[A-Za-z]", restored_text)):
                retry_text = retry_with_mymemory(code, key, protected_text)
                if retry_text:
                    restored_text = restore_placeholders(retry_text, placeholders)
            translated[key] = restored_text

        print(
            f"{code}: translated {min(start + len(batch_keys), len(keys))}/{len(keys)} keys",
            flush=True,
        )

    return translated


def write_locale(code: str, locale_tree: dict[str, Any]) -> None:
    content = json.dumps(locale_tree, ensure_ascii=False, indent=2)
    target = LOCALES_DIR / f"{code}.ts"
    target.write_text(f"export const {code} = {content} as const;\n", encoding="utf-8")


def main() -> int:
    requested_codes = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
    best_effort = "--best-effort" in sys.argv[1:]
    supported_codes = load_supported_languages()
    target_codes = requested_codes or [code for code in supported_codes if code != "en"]

    english_tree = load_locale("en")
    english_entries = dict(flatten_entries(english_tree))
    incomplete_locales: dict[str, list[str]] = {}

    for code in target_codes:
        if code == "en":
            continue

        locale_tree = load_locale(code)
        for pass_index in range(1, MAX_PASSES + 1):
            locale_entries = dict(flatten_entries(locale_tree))
            keys_to_translate = collect_keys_to_translate(locale_entries, english_entries)

            if not keys_to_translate:
                if pass_index == 1:
                    print(f"{code}: no missing or untranslated keys detected")
                else:
                    print(f"{code}: locale audit is clean after pass {pass_index - 1}", flush=True)
                break

            print(
                f"{code}: pass {pass_index}/{MAX_PASSES} translating {len(keys_to_translate)} keys",
                flush=True,
            )
            translated_values = translate_values(code, keys_to_translate)
            for key, value in translated_values.items():
                set_nested_value(locale_tree, key, value)

            write_locale(code, locale_tree)
            print(f"{code}: wrote merged locale after pass {pass_index}", flush=True)
        else:
            remaining_entries = dict(flatten_entries(locale_tree))
            remaining_keys = sorted(
                collect_keys_to_translate(remaining_entries, english_entries).keys()
            )
            if best_effort:
                incomplete_locales[code] = remaining_keys
                print(
                    f"{code}: incomplete after {MAX_PASSES} passes "
                    f"({len(remaining_keys)} keys remaining)",
                    flush=True,
                )
                continue

            raise RuntimeError(
                f"{code}: locale still has missing or untranslated keys after {MAX_PASSES} passes: "
                + ", ".join(remaining_keys[:20])
            )

    if incomplete_locales:
        print(
            json.dumps(
                {
                    code: {
                        "remaining": len(keys),
                        "sample": keys[:20],
                    }
                    for code, keys in incomplete_locales.items()
                },
                ensure_ascii=False,
                indent=2,
            ),
            flush=True,
        )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
