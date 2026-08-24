from django.conf import settings


def aniuzu_url(request):
    """Expose the Aniuzu site URL to all templates (single config location)."""
    return {"ANIUZU_URL": settings.ANIUZU_URL}
