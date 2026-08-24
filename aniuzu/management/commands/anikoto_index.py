"""
Build the AniList -> Anikoto series-id index from /recent-anime.

The runtime resolves mappings lazily (verified probe, then a small
resumable catalog scan). This command pre-scans the whole catalog so the
very first visitors never wait for it:

    python manage.py anikoto_index            # full catalog
    python manage.py anikoto_index --pages 10 # incremental top-up

Requests are paced to stay inside Anikoto's rate limit (60 req / 120 s).
"""

from django.core.cache import cache

from aniuzu import anikoto

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Index the Anikoto catalog (ani_id -> series id) for mapping."

    def add_arguments(self, parser):
        parser.add_argument("--pages", type=int, default=None,
                            help="Max catalog pages to scan this run.")

    def handle(self, *args, **options):
        max_pages = options["pages"]
        scanned = 0
        exhausted = False

        self.stdout.write("Scanning Anikoto catalog…")
        while max_pages is None or scanned < max_pages:
            exhausted = anikoto.scan_catalog()
            state = cache.get(anikoto._INDEX_KEY) or {}
            by_ani = state.get("by_ani") or {}
            scanned += anikoto.SCAN_PAGES_PER_MISS
            self.stdout.write(
                f"  indexed {len(by_ani)} titles "
                f"(cursor page {state.get('cursor')}, done={state.get('exhausted')})"
            )
            if exhausted:
                break

        if exhausted:
            self.stdout.write(self.style.SUCCESS("Catalog fully indexed."))
        else:
            self.stdout.write(self.style.WARNING(
                "Stopped before finishing — run again to continue."))
