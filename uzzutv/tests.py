from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse


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
