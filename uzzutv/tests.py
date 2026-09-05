from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse

from .views import _aniuzu_playable_episodes


class DeleteAccountTests(TestCase):
    def test_delete_account_requires_confirmation(self):
        response = self.client.post(
            reverse("delete_account"),
            data='{"access_token":"token","confirmation":"nope"}',
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    @patch("uzzutv.views.delete_auth_user", return_value=True)
    @patch("uzzutv.views.delete_user_data", return_value=True)
    @patch(
        "uzzutv.views.get_user_from_access_token",
        return_value={"id": "123e4567-e89b-12d3-a456-426614174000"},
    )
    def test_delete_account_succeeds(self, mock_get_user, mock_delete_user_data, mock_delete_auth_user):
        response = self.client.post(
            reverse("delete_account"),
            data='{"access_token":"token","confirmation":"DELETE"}',
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(
            response.content.decode("utf-8"),
            {"success": True, "message": "Your account has been deleted."},
        )
        mock_get_user.assert_called_once_with("token")
        mock_delete_user_data.assert_called_once_with("123e4567-e89b-12d3-a456-426614174000")
        mock_delete_auth_user.assert_called_once_with("123e4567-e89b-12d3-a456-426614174000")


class AniuzuPlayableEpisodesTests(TestCase):
    def test_uses_confirmed_episode_count_over_airing_schedule(self):
        episodes = _aniuzu_playable_episodes({
            "episodes": 12,
            "nextAiringEpisode": {"episode": 10},
        })

        self.assertEqual(episodes, list(range(1, 13)))

    def test_uses_previous_episode_when_count_is_unknown(self):
        episodes = _aniuzu_playable_episodes({
            "episodes": None,
            "nextAiringEpisode": {"episode": 1143},
        })

        self.assertEqual(episodes[0], 1)
        self.assertEqual(episodes[-1], 1142)
        self.assertEqual(len(episodes), 1142)
