#!/usr/bin/env python3
"""Merge ui/openapi-phone-numbers.json into a base OpenAPI spec (live or file).

Writes ui/openapi.json for a single-input openapi-ts run (avoids multi-input export renaming).
Default base: http://127.0.0.1:8000/api/v1/openapi.json
Override: OPENAPI_BASE_URL or first CLI arg (URL or path to JSON).
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FRAGMENT_PATH = REPO_ROOT / "ui" / "openapi-phone-numbers.json"
OUT_PATH = REPO_ROOT / "ui" / "openapi.json"


def _load_base(source: str) -> dict:
    if source.startswith("http://") or source.startswith("https://"):
        with urllib.request.urlopen(source, timeout=60) as resp:
            return json.loads(resp.read().decode())
    with open(source, encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    base_src = (
        sys.argv[1]
        if len(sys.argv) > 1
        else os.environ.get("OPENAPI_BASE_URL", "http://127.0.0.1:8000/api/v1/openapi.json")
    )
    base = _load_base(base_src)
    with FRAGMENT_PATH.open(encoding="utf-8") as f:
        frag = json.load(f)

    base_paths = base.setdefault("paths", {})
    for path_key, path_item in frag.get("paths", {}).items():
        base_paths[path_key] = path_item

    schemas = base.setdefault("components", {}).setdefault("schemas", {})
    frag_schemas = frag.get("components", {}).get("schemas", {})
    for name, schema in frag_schemas.items():
        schemas[name] = schema

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(base, f, indent=2)
        f.write("\n")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
