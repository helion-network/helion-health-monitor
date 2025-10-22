from typing import Optional
from urllib.parse import urlparse

import petals
try:
    # Prefer Pydantic v1-compatible dataclass wrapper when running under Pydantic v2
    from pydantic.v1 import dataclasses as pydantic_dataclasses
except Exception:
    # Fallback for environments with Pydantic v1
    from pydantic import dataclasses as pydantic_dataclasses


@pydantic_dataclasses.dataclass
class ModelInfo(petals.data_structures.ModelInfo):
    dht_prefix: Optional[str] = None
    official: bool = True
    limited: bool = False

    @property
    def name(self) -> str:
        return urlparse(self.repository).path.lstrip("/")

    @property
    def short_name(self) -> str:
        return self.name.split("/")[-1]
