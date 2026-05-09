from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .engine import Catalog


DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _load_json(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def load_catalog() -> Catalog:
    return Catalog(
        programs=_load_json(DATA_DIR / "programs.json"),
        courses=_load_json(DATA_DIR / "courses.json"),
        career_paths=_load_json(DATA_DIR / "career_paths.json"),
    )
