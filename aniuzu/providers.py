"""
Streaming provider registry for Aniuzu.

Every video source is described exactly once, here. Each provider knows:
  - its stable key and user-facing display name
  - how to build a player URL from (AniList ID, episode number, language)
  - which languages it actually supports (never generate an invalid URL)
  - which origins its player may postMessage from (validated before trusting)

The watch page receives a JSON snapshot of this registry (see
client_config()), so the frontend never hardcodes provider URLs either.
Adding Server 4 later means adding one entry to PROVIDERS.

All providers use the AniList media ID directly — no other ID system.
"""

import re


class Provider:
    def __init__(self, key, display_name, url_template, supported_languages,
                 allowed_origins, event_style):
        self.key = key
        self.display_name = display_name
        # str.format template with {anilist_id}, {episode}, {language}.
        self.url_template = url_template
        self.supported_languages = list(supported_languages)
        self.allowed_origins = set(allowed_origins)
        # Which postMessage dialect the player speaks ("megaplay"/"vidnest").
        self.event_style = event_style

    def build_url(self, anilist_id, episode, language):
        """Player URL for this provider. Returns None for unsupported input."""
        if language not in self.supported_languages:
            return None
        try:
            anilist_id = int(anilist_id)
            episode = int(episode)
        except (TypeError, ValueError):
            return None
        if anilist_id <= 0 or episode <= 0:
            return None
        return self.url_template.format(
            anilist_id=anilist_id,
            episode=episode,
            language=language,
        )

    def client_config(self):
        """JSON-safe snapshot embedded into the watch page."""
        return {
            "key": self.key,
            "displayName": self.display_name,
            "urlTemplate": self.url_template,
            "supportedLanguages": list(self.supported_languages),
            "allowedOrigins": sorted(self.allowed_origins),
            "eventStyle": self.event_style,
        }


PROVIDERS = {
    "megaplay": Provider(
        key="megaplay",
        display_name="MegaPlay",
        url_template="https://megaplay.buzz/stream/ani/{anilist_id}/{episode}/{language}",
        supported_languages=["sub", "dub"],
        allowed_origins=[
            "https://megaplay.buzz",
            "https://www.megaplay.buzz",
        ],
        event_style="megaplay",
    ),
    "vidnest": Provider(
        key="vidnest",
        display_name="VidNest",
        url_template="https://vidnest.fun/anime/{anilist_id}/{episode}/{language}",
        supported_languages=["sub", "dub", "hindi"],
        allowed_origins=[
            "https://vidnest.fun",
            "https://www.vidnest.fun",
        ],
        event_style="vidnest",
    ),
    "animepahe": Provider(
        key="animepahe",
        display_name="AnimePahe",
        url_template="https://vidnest.fun/animepahe/{anilist_id}/{episode}/{language}",
        supported_languages=["sub", "dub"],
        allowed_origins=[
            "https://vidnest.fun",
            "https://www.vidnest.fun",
        ],
        event_style="vidnest",
    ),
}

PROVIDER_ORDER = ["megaplay", "vidnest", "animepahe"]
DEFAULT_PROVIDER = "megaplay"
DEFAULT_LANGUAGE = "sub"


def get_provider(key):
    return PROVIDERS.get(key)


def build_provider_url(key, anilist_id, episode, language):
    """Central URL builder — the only place player URLs are constructed."""
    provider = get_provider(key)
    if not provider:
        return None
    return provider.build_url(anilist_id, episode, language)


def closest_language(provider_key, wanted):
    """Wanted language if supported, otherwise the provider's first option.

    Keeps URLs valid when a provider cannot serve the requested track.
    """
    provider = get_provider(provider_key)
    if not provider or not provider.supported_languages:
        return DEFAULT_LANGUAGE
    if wanted in provider.supported_languages:
        return wanted
    return provider.supported_languages[0]


def client_config():
    """Ordered list of provider snapshots for the frontend."""
    return [
        PROVIDERS[key].client_config()
        for key in PROVIDER_ORDER
        if key in PROVIDERS
    ]


_WATCH_PATH_RE = re.compile(r"/watch/\d+/(?P<ep>\d+)/?$")


def episode_from_path(path):
    """Extract the episode number from a /watch/<id>/<ep>/ path (or None)."""
    match = _WATCH_PATH_RE.search(path or "")
    return int(match.group("ep")) if match else None
