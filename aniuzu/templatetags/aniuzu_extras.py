from django import template

from aniuzu.anilist import clean_description

register = template.Library()


@register.filter
def display_title(media):
    """Prefer English title, then romaji, then native."""
    if not media:
        return "Untitled"
    title = media.get("title") or {}
    return title.get("english") or title.get("romaji") or title.get("native") or "Untitled"


FORMAT_LABELS = {
    "TV": "TV",
    "TV_SHORT": "TV Short",
    "MOVIE": "Movie",
    "SPECIAL": "Special",
    "OVA": "OVA",
    "ONA": "ONA",
    "MUSIC": "Music",
}

STATUS_LABELS = {
    "RELEASING": "Airing",
    "FINISHED": "Finished",
    "NOT_YET_RELEASED": "Upcoming",
    "CANCELLED": "Cancelled",
    "HIATUS": "On Hiatus",
}

SEASON_LABELS = {
    "WINTER": "Winter",
    "SPRING": "Spring",
    "SUMMER": "Summer",
    "FALL": "Fall",
}


def _label(mapping, key):
    return mapping.get(key, key.title().replace("_", " ") if key else "")


@register.simple_tag
def card_meta(media):
    """Compact meta line for cards: season/year and/or status."""
    if not media:
        return ""
    parts = []
    season_year = media.get("seasonYear")
    if media.get("season"):
        parts.append(f"{_label(SEASON_LABELS, media['season'])} {season_year or ''}".strip())
    elif season_year:
        parts.append(str(season_year))
    status = _label(STATUS_LABELS, media.get("status"))
    if status and status not in ("Finished",) or not parts:
        parts.append(status)
    return " · ".join(p for p in parts if p)


@register.simple_tag
def detail_meta(media):
    """Meta line for the detail hero: year · format · episodes · duration."""
    if not media:
        return ""
    parts = []
    if media.get("seasonYear"):
        parts.append(str(media["seasonYear"]))
    fmt = _label(FORMAT_LABELS, media.get("format"))
    if fmt:
        parts.append(fmt)
    if media.get("episodes"):
        parts.append(f"{media['episodes']} ep")
    if media.get("duration"):
        parts.append(f"{media['duration']} min")
    return " · ".join(parts)


@register.simple_tag
def blurb(text, limit=180):
    return clean_description(text, int(limit))


@register.filter
def split_commas(value):
    return [part.strip() for part in value.split(",") if part.strip()]
