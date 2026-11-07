# [LAYER: DOMAIN]
"""Pure Domain entity and repository contract in Python (0% I/O)."""

from dataclasses import dataclass
from typing import Optional, Protocol
from ..plumbing.text_utils import normalize_slug


@dataclass(frozen=True)
class Article:
    article_id: str
    title: str
    word_count: int

    @property
    def slug(self) -> str:
        return normalize_slug(self.title)

    def is_long_form(self) -> bool:
        return self.word_count >= 1500


class IArticleRepository(Protocol):
    def get_by_id(self, article_id: str) -> Optional[Article]:
        ...

    def save(self, article: Article) -> None:
        ...

