"""
Playback provider for Aniuzu — MegaPlay, the only one.

The player URL is built from an Anikoto `episode_embed_id` (never from an
AniList ID or episode number). Whenever Anikoto supplies an exact
embed_url.sub / embed_url.dub that URL is used verbatim; this template is
only the fallback for languages Anikoto left blank.

SUB/DUB availability is decided per episode by which embed URLs Anikoto
actually returned — a language without an embed is never offered.
"""

import re


STREAM_URL_TEMPLATE = "https://megaplay.buzz/stream/s-2/{embed_id}/{language}"

SUPPORTED_LANGUAGES = ["sub", "dub"]
DEFAULT_LANGUAGE = "sub"

# Origins whose postMessage traffic the watch page may trust.
ALLOWED_ORIGINS = [
    "https://megaplay.buzz",
    "https://www.megaplay.buzz",
]

_EMBED_ID_RE = re.compile(r"^\d{1,12}$")


def is_valid_embed_id(embed_id):
    """Anikoto episode_embed_ids are plain numeric strings."""
    return bool(_EMBED_ID_RE.match(str(embed_id or "").strip()))


def build_stream_url(embed_id, language):
    """Player URL for (embed id, language); None for unsupported input.

    Kept as the single construction point so client_config()-style reuse
    and tests always agree on the shape of MegaPlay URLs.
    """
    if language not in SUPPORTED_LANGUAGES:
        return None
    if not is_valid_embed_id(embed_id):
        return None
    return STREAM_URL_TEMPLATE.format(embed_id=int(embed_id), language=language)


def languages_for_urls(sub_url, dub_url):
    """Languages actually playable for one episode, in display order."""
    return [lang for lang, url in (("sub", sub_url), ("dub", dub_url)) if url]


def closest_language(wanted, available):
    """Wanted language if playable, else the episode's first option."""
    if not available:
        return None
    if wanted in available:
        return wanted
    return available[0]
