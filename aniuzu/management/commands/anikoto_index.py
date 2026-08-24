"""
Build the AniList -> Anikoto series-id index from /recent-anime.

The runtime resolves mappings lazily (verified probe, then a small
resumable catalog scan). This command pre-scans the whole catalog so the
very first visitors never wait for it:

    python manage.py anikoto_index             # full catalog
    python manage.py anikoto_index --pages 10  # incremental top-up

Anikoto allows ~60 requests per IP every 120 seconds — and on shared
hosting (e.g. PythonAnywhere free tier) that IP belongs to everybody.
So this command:
  * reports WHY a pass stopped instead of looping silently,
  * waits out Retry-After on 429 responses,
  * gives up after two consecutive zero-progress passes instead of
    spinning forever (run it again later; progress resumes from cache).

The site never depends on this finishing: unmapped titles resolve
on demand via the verified probe + lazy scan path.
"""

import time

from django.core.cache import cache
from django.core.management.base import BaseCommand

from aniuzu import anikoto


class Command(BaseCommand):
    help = "Index the Anikoto catalog (ani_id -> series id) for mapping."

    def add_arguments(self, parser):
        parser.add_argument("--pages", type=int, default=None,
                            help="Max catalog pages to scan this run.")
        parser.add_argument("--delay", type=float, default=0.5,
                            help="Pause between scan passes, seconds.")

    def handle(self, *args, **options):
        max_pages = options["pages"]
        delay = max(0.0, float(options["delay"]))
        no_progress_limit = 2
        stale_passes = 0
        last_signature = None

        self.stdout.write("Scanning Anikoto catalog…")
        scanned = 0
        while max_pages is None or scanned < max_pages:
            exhausted, reason = anikoto.scan_catalog()
            scanned += anikoto.SCAN_PAGES_PER_MISS

            state = cache.get(anikoto._INDEX_KEY) or {}
            by_ani = state.get("by_ani") or {}

            note = "" if reason == "done" else f" — stopped: {reason}"
            self.stdout.write(
                f"  indexed {len(by_ani)} titles "
                f"(cursor page {state.get('cursor')}, "
                f"done={state.get('exhausted')}){note}"
            )

            if state.get("exhausted"):
                self.stdout.write(self.style.SUCCESS("Catalog fully indexed."))
                return

            signature = (len(by_ani), state.get("cursor"), state.get("exhausted"))
            if signature == last_signature:
                stale_passes += 1
                if stale_passes >= no_progress_limit:
                    self.stdout.write(self.style.ERROR(
                        "No progress twice in a row — giving up for now. "
                        "Run again later; on-demand mapping keeps the site working."
                    ))
                    return
            else:
                stale_passes = 0
            last_signature = signature

            if reason.startswith("rate-limited"):
                wait = self._wait_seconds(reason)
                self.stdout.write(f"  rate limited — waiting {wait}s before continuing…")
                time.sleep(wait)
            elif delay:
                time.sleep(delay)

        self.stdout.write(self.style.WARNING(
            "Stopped before finishing — run again to continue."))

    @staticmethod
    def _wait_seconds(reason):
        """Retry-After hint parsed from 'rate-limited:<seconds>'."""
        try:
            return min(120, max(5, int(reason.split(":", 1)[1])))
        except (IndexError, ValueError):
            return 60
