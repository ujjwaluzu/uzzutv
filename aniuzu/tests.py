from io import StringIO
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings

from . import anikoto, anilist, providers


def locmem_cache():
    return {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "aniuzu-tests",
        }
    }


class _FakeResponse:
    """Just enough of requests.Response for anikoto._get()."""

    def __init__(self, status_code=200, payload=None, headers=None):
        self.status_code = status_code
        self._payload = {"ok": True, "data": payload if payload is not None else []}
        self.headers = headers or {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        import requests

        if self.status_code >= 400:
            raise requests.HTTPError(f"status {self.status_code}")


class ProviderUrlTests(TestCase):
    def test_build_stream_url_from_embed_id(self):
        self.assertEqual(
            providers.build_stream_url("2142", "sub"),
            "https://megaplay.buzz/stream/s-2/2142/sub",
        )
        self.assertEqual(
            providers.build_stream_url(204636, "dub"),
            "https://megaplay.buzz/stream/s-2/204636/dub",
        )

    def test_build_stream_url_rejects_bad_input(self):
        self.assertIsNone(providers.build_stream_url("", "sub"))
        self.assertIsNone(providers.build_stream_url(None, "sub"))
        self.assertIsNone(providers.build_stream_url("abc", "sub"))
        self.assertIsNone(providers.build_stream_url("-5", "sub"))
        self.assertIsNone(providers.build_stream_url("2142", "hindi"))

    def test_languages_follow_actual_availability(self):
        self.assertEqual(providers.languages_for_urls("http://x", None), ["sub"])
        self.assertEqual(providers.languages_for_urls("http://x", "http://y"), ["sub", "dub"])
        self.assertEqual(providers.languages_for_urls(None, "http://y"), ["dub"])
        self.assertEqual(providers.languages_for_urls(None, None), [])

    def test_closest_language_never_picks_missing_track(self):
        self.assertEqual(providers.closest_language("dub", ["sub"]), "sub")
        self.assertEqual(providers.closest_language("dub", ["sub", "dub"]), "dub")
        self.assertIsNone(providers.closest_language("sub", []))


@override_settings(CACHES=locmem_cache())
class NormalizeSeriesTests(TestCase):
    def test_normalize_prefers_verbatim_embed_urls(self):
        data = {
            "anime": {"id": 1642, "title": "One Piece", "ani_id": "21", "mal_id": "21",
                      "is_sub": 1175, "is_dub": 1155},
            "episodes": [
                {
                    "id": 30298,
                    "number": 1,
                    "episode_embed_id": "2142",
                    "embed_url": {
                        "sub": "https://megaplay.buzz/stream/s-2/2142/sub",
                        "dub": "https://megaplay.buzz/stream/s-2/2142/dub",
                    },
                },
                {
                    "id": 30299,
                    "number": 2,
                    "episode_embed_id": "2143",
                    "embed_url": {"sub": "https://megaplay.buzz/stream/s-2/2143/sub"},
                },
            ],
        }
        series = anikoto.normalize_series(data)
        self.assertEqual(series["seriesId"], 1642)
        self.assertEqual(series["anilistId"], "21")
        self.assertEqual(len(series["episodes"]), 2)
        # Verbatim URL from Anikoto survives untouched.
        self.assertEqual(series["episodes"][0]["subUrl"],
                         "https://megaplay.buzz/stream/s-2/2142/sub")
        # A language Anikoto did not provide is NOT fabricated — even when
        # the series-level is_dub flag claims dubs exist elsewhere.
        self.assertIsNone(series["episodes"][1]["dubUrl"])
        # Series-level flags derive from actual episode data (ep 1 has dub).
        self.assertTrue(series["isSub"])
        self.assertTrue(series["isDub"])

    def test_normalize_skips_unplayable_episodes(self):
        data = {
            "anime": {"id": 1, "title": "X", "ani_id": "10"},
            "episodes": [
                {"id": 1, "number": 1, "episode_embed_id": "", "embed_url": {}},
                {"id": 2, "number": 2, "episode_embed_id": "55", "embed_url":
                    {"sub": "https://megaplay.buzz/stream/s-2/55/sub"}},
                {"id": 3, "number": 3, "episode_embed_id": "56", "embed_url": {}},
            ],
        }
        series = anikoto.normalize_series(data)
        self.assertEqual([e["number"] for e in series["episodes"]], [2])
        self.assertTrue(series["isSub"])
        self.assertFalse(series["isDub"])

    def test_normalize_handles_fractional_numbers(self):
        data = {
            "anime": {"id": 1, "title": "X", "ani_id": "10", "is_sub": True},
            "episodes": [
                {"id": 1, "number": "5.5", "episode_embed_id": "9", "embed_url":
                    {"sub": "https://megaplay.buzz/stream/s-2/9/sub"}},
            ],
        }
        series = anikoto.normalize_series(data)
        self.assertEqual(series["episodes"][0]["number"], 5.5)

    def test_normalize_rejects_empty_payload(self):
        with self.assertRaises(anikoto.AnikotoError):
            anikoto.normalize_series({"anime": {}, "episodes": []})
        with self.assertRaises(anikoto.AnikotoError):
            anikoto.normalize_series(None)


@override_settings(CACHES=locmem_cache())
class TransportTests(TestCase):
    """HTTP layer: UA header, 404/429 semantics."""

    def test_get_sends_browser_user_agent(self):
        with mock.patch.object(anikoto.requests, "get",
                               return_value=_FakeResponse()) as getter:
            anikoto._get("recent-anime", {"page": 1})
        headers = getter.call_args.kwargs["headers"]
        self.assertTrue(headers["User-Agent"].startswith("Mozilla/5.0"))
        self.assertEqual(headers["Accept"], "application/json")

    def test_404_maps_to_series_not_found(self):
        with mock.patch.object(anikoto.requests, "get",
                               return_value=_FakeResponse(status_code=404)):
            with self.assertRaises(anikoto.SeriesNotFound):
                anikoto._get("series/999999999")

    def test_429_carries_retry_after(self):
        response = _FakeResponse(status_code=429, headers={"Retry-After": "45"})
        with mock.patch.object(anikoto.requests, "get", return_value=response):
            with self.assertRaises(anikoto.RateLimited) as ctx:
                anikoto._get("recent-anime")
        self.assertEqual(ctx.exception.retry_after, 45)

    def test_malformed_payload_raises(self):
        bad = _FakeResponse()
        bad._payload = {"nope": True}
        with mock.patch.object(anikoto.requests, "get", return_value=bad):
            with self.assertRaises(anikoto.AnikotoError):
                anikoto._get("recent-anime")


@override_settings(CACHES=locmem_cache())
class ScanCatalogReasonTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_rate_limit_reports_retry_hint(self):
        with mock.patch.object(anikoto, "recent_anime",
                               side_effect=anikoto.RateLimited(45)):
            exhausted, reason = anikoto.scan_catalog()
        self.assertFalse(exhausted)
        self.assertEqual(reason, "rate-limited:45")

    def test_unreachable_reports_detail(self):
        with mock.patch.object(anikoto, "recent_anime",
                               side_effect=anikoto.AnikotoError("connection refused")):
            exhausted, reason = anikoto.scan_catalog()
        self.assertFalse(exhausted)
        self.assertEqual(reason, "unreachable:connection refused")

    def test_successful_pass_reports_done(self):
        page = {
            "rows": [{"id": 1642, "title": "One Piece", "ani_id": "21"}],
            "pagination": {"total_pages": 1},
        }
        with mock.patch.object(anikoto, "recent_anime", return_value=page):
            exhausted, reason = anikoto.scan_catalog()
        self.assertTrue(exhausted)
        self.assertEqual(reason, "done")

    def test_lookup_stops_hammering_when_provider_fails(self):
        # Seed a non-exhausted index, then make every scan fail.
        cache.set(anikoto._INDEX_KEY,
                  {"by_ani": {}, "cursor": 1, "exhausted": False}, 60)
        with mock.patch.object(anikoto, "scan_catalog",
                               return_value=(False, "unreachable:x")) as scanner:
            result = anikoto.lookup_in_index(123456789)
        self.assertIsNone(result)
        self.assertEqual(scanner.call_count, 1)  # no repeated hammering


@override_settings(CACHES=locmem_cache())
class AnikotoIndexCommandTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_gives_up_after_repeated_no_progress(self):
        with mock.patch.object(anikoto, "scan_catalog",
                               return_value=(False, "unreachable:x")):
            out = StringIO()
            call_command("anikoto_index", stdout=out)
        text = out.getvalue()
        self.assertIn("stopped: unreachable:x", text)
        self.assertIn("No progress twice in a row", text)

    def test_completes_when_catalog_exhausted(self):
        def fake_scan():
            # Real scans persist their progress; the command reads it back.
            cache.set(anikoto._INDEX_KEY, {
                "by_ani": {"21": {"seriesId": 1642, "aniId": "21"}},
                "cursor": 9,
                "exhausted": True,
            }, 60)
            return True, "done"

        with mock.patch.object(anikoto, "scan_catalog", side_effect=fake_scan):
            out = StringIO()
            call_command("anikoto_index", stdout=out)
        self.assertIn("indexed 1 titles", out.getvalue())
        self.assertIn("Catalog fully indexed.", out.getvalue())

    def test_waits_on_rate_limit_then_gives_up_cleanly(self):
        with mock.patch.object(anikoto, "scan_catalog",
                               return_value=(False, "rate-limited:5")), \
             mock.patch("aniuzu.management.commands.anikoto_index.time.sleep") as sleeper:
            out = StringIO()
            call_command("anikoto_index", "--delay", "0", stdout=out)
        self.assertIn("waiting 5s", out.getvalue())
        self.assertTrue(sleeper.called)


@override_settings(CACHES=locmem_cache())
class ResolveMappingTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_cached_mapping_wins_without_network(self):
        cache.set(anikoto.map_cache_key(21), 1642, 60)
        with mock.patch.object(anikoto, "_get") as getter:
            self.assertEqual(anikoto.resolve_series_id(21), 1642)
            getter.assert_not_called()

    def test_direct_probe_only_trusted_when_ani_id_confirms(self):
        confirmed = {
            "data": {
                "anime": {"id": 21, "title": "One Piece", "ani_id": "21"},
                "episodes": [{"id": 1, "number": 1, "episode_embed_id": "7",
                              "embed_url": {"sub": "https://megaplay.buzz/stream/s-2/7/sub"}}],
            }
        }
        with mock.patch.object(anikoto, "_get", return_value=confirmed) as getter:
            self.assertEqual(anikoto.resolve_series_id(21), 21)
            getter.assert_called_once_with("series/21")

    def test_mismatched_direct_probe_falls_back_to_index(self):
        # /series/21 exists at Anikoto but belongs to a DIFFERENT AniList entry:
        # the probe result must be discarded.
        impostor = {
            "data": {
                "anime": {"id": 21, "title": "Some Other Show", "ani_id": "999"},
                "episodes": [{"id": 1, "number": 1, "episode_embed_id": "7",
                              "embed_url": {"sub": "https://megaplay.buzz/stream/s-2/7/sub"}}],
            }
        }
        catalog_page = {
            "ok": True,
            "data": [{
                "id": 1642, "title": "One Piece", "ani_id": "21", "mal_id": "21",
            }],
            "pagination": {"page": 1, "total_pages": 1},
        }

        def fake_get(path, params=None):
            if path == "series/21":
                return impostor
            if path == "recent-anime":
                return catalog_page
            raise AssertionError(f"unexpected path {path}")

        with mock.patch.object(anikoto, "_get", side_effect=fake_get):
            self.assertEqual(anikoto.resolve_series_id(21), 1642)

    def test_unknown_anime_caches_negative_result(self):
        not_found_responses = [
            anikoto.SeriesNotFound,          # direct probe
            {"ok": True, "data": [],         # empty catalog page
             "pagination": {"total_pages": 1}},
        ]
        with mock.patch.object(anikoto, "_get",
                               side_effect=lambda path, params=None: (
                                   (_ for _ in ()).throw(not_found_responses[0])
                                   if path.startswith("series/")
                                   else not_found_responses[1])):
            self.assertIsNone(anikoto.resolve_series_id(424242))
        self.assertEqual(cache.get(anikoto.map_cache_key(424242)), "__none__")


class EpisodeResolutionTests(TestCase):
    def _series(self, numbers):
        return {"episodes": [{"number": n} for n in numbers]}

    def test_exact_match(self):
        index, episode = _resolve(self._series([1, 2, 3]), 2)
        self.assertEqual((index, episode["number"]), (1, 2))

    def test_fall_forward_past_fractional_special(self):
        index, episode = _resolve(self._series([1, 2, 2.5, 3]), 2)
        # exact hit on 2 first
        self.assertEqual((index, episode["number"]), (1, 2))

    def test_missing_number_snaps_to_next_available(self):
        index, episode = _resolve(self._series([1, 5, 6]), 3)
        self.assertEqual((index, episode["number"]), (1, 5))

    def test_beyond_last_episode_is_not_found(self):
        index, episode = _resolve(self._series([1, 2]), 99)
        self.assertEqual((index, episode), (None, None))


def _resolve(series, wanted):
    """Direct access to the view helper under test."""
    from .views import _resolve_episode

    return _resolve_episode(series, wanted)


@override_settings(CACHES=locmem_cache())
class ViewTests(TestCase):
    ANIME = {
        "id": 21,
        "title": {"english": "One Piece", "romaji": "One Piece", "native": "ワンピース"},
        "coverImage": {"large": "http://img/l.jpg", "extraLarge": "http://img/xl.jpg"},
        "bannerImage": "http://img/b.jpg",
        "description": "Pirates.",
        "averageScore": 87,
        "genres": ["Action"],
        "episodes": None,  # deliberately unknown — must NOT drive the list
        "status": "RELEASING",
        "format": "TV",
        "season": "FALL",
        "seasonYear": 1999,
        "duration": 24,
        "studios": {"nodes": [{"name": "Toei"}]},
        "nextAiringEpisode": {"episode": 1100},
    }

    SERIES = {
        "seriesId": 1642,
        "anilistId": "21",
        "malId": "21",
        "title": "One Piece",
        "isSub": True,
        "isDub": False,
        "episodes": [
            {"id": 900 + n, "number": n, "embedId": str(1000 + n),
             "title": f"Episode {n}",
             "subUrl": f"https://megaplay.buzz/stream/s-2/{1000 + n}/sub",
             "dubUrl": None}
            for n in range(1, 1201)
        ],
    }

    def setUp(self):
        cache.clear()

    def test_detail_uses_anikoto_catalog_not_anilist_count(self):
        with mock.patch.object(anilist, "get_anime", return_value=self.ANIME), \
             mock.patch.object(anikoto, "get_series_for_anilist",
                               return_value=(1642, self.SERIES)):
            response = self.client.get("/aniuzu/anime/21/")

        self.assertEqual(response.status_code, 200)
        browser_data = response.context["browser_data"]
        # 150 real Anikoto episodes — NOT AniList's nextAiring-derived count.
        self.assertEqual(browser_data["count"], 1200)
        self.assertEqual(len(browser_data["episodes"]), 1200)
        self.assertTrue(browser_data["subAvailable"])
        self.assertFalse(browser_data["dubAvailable"])

    def test_watch_builds_context_from_anikoto_record(self):
        with mock.patch.object(anilist, "get_anime", return_value=self.ANIME), \
             mock.patch.object(anikoto, "get_series_for_anilist",
                               return_value=(1642, self.SERIES)):
            response = self.client.get("/aniuzu/watch/21/1000/")

        self.assertEqual(response.status_code, 200)
        payload = response.context["watch_data"]
        self.assertEqual(payload["anilistId"], 21)
        self.assertEqual(payload["anikotoSeriesId"], 1642)
        self.assertNotEqual(payload["anilistId"], payload["anikotoSeriesId"])
        self.assertEqual(payload["episodeNumber"], "1000")
        self.assertEqual(payload["embedId"], "2000")
        self.assertEqual(payload["anikotoEpisodeId"], 1900)
        # URLs come straight from Anikoto records — never reconstructed here.
        self.assertEqual(payload["playerUrls"]["sub"],
                         "https://megaplay.buzz/stream/s-2/2000/sub")
        self.assertIsNone(payload["playerUrls"]["dub"])
        self.assertEqual(payload["availableLanguages"], ["sub"])
        self.assertEqual(payload["prevNumber"], "999")
        self.assertEqual(payload["nextNumber"], "1001")
        self.assertEqual(payload["totalEpisodes"], 1200)
        self.assertIn("https://megaplay.buzz", response.content.decode())

    def test_watch_survives_missing_metadata(self):
        with mock.patch.object(anilist, "get_anime", return_value=None), \
             mock.patch.object(anikoto, "get_series_for_anilist",
                               return_value=(1642, self.SERIES)):
            response = self.client.get("/aniuzu/watch/21/5/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.context["watch_data"])
        self.assertEqual(response.context["display_title"], "One Piece")

    def test_watch_without_anikoto_mapping_stays_usable(self):
        with mock.patch.object(anilist, "get_anime", return_value=self.ANIME), \
             mock.patch.object(anikoto, "get_series_for_anilist",
                               return_value=(None, None)):
            response = self.client.get("/aniuzu/watch/21/1/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.context["watch_data"])

    def test_watch_beyond_catalog_does_not_invent_episodes(self):
        with mock.patch.object(anilist, "get_anime", return_value=self.ANIME), \
             mock.patch.object(anikoto, "get_series_for_anilist",
                               return_value=(1642, self.SERIES)):
            response = self.client.get("/aniuzu/watch/21/5000/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.context["watch_data"])
        self.assertIsNotNone(response.context["series"])
