from django import template
from django.utils.text import slugify


register = template.Library()


def _year_from_media(media):
    if not isinstance(media, dict):
        return ""

    for key in ("release_date", "first_air_date"):
        value = media.get(key) or ""
        if value:
            return str(value)[:4]

    if media.get("year"):
        return str(media["year"])
    if media.get("seasonYear"):
        return str(media["seasonYear"])

    start_date = media.get("startDate") or {}
    if isinstance(start_date, dict) and start_date.get("year"):
        return str(start_date["year"])
    return ""


@register.filter
def media_slug(media):
    """Build a readable, year-qualified slug for TMDB or AniList media."""
    if not isinstance(media, dict):
        return slugify(media or "")

    title = media.get("title") or media.get("name") or ""
    if isinstance(title, dict):
        title = title.get("english") or title.get("romaji") or title.get("native") or ""

    year = _year_from_media(media)
    return slugify(f"{title}-{year}" if year else title) or str(media.get("id") or media.get("media_id") or "")
