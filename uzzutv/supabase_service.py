"""Server-side Supabase helpers for privileged operations.

Only used where the browser cannot act on its own (e.g. deleting the shared
Supabase Auth account). The service-role credential lives here, read from the
server environment only. It is never shipped to the browser or templates.

The browser supplies its own Supabase session access token; we verify that
token against GoTrue server-side and derive the authenticated user id from it.
We never trust a user id supplied by the browser.
"""

import os
import logging

import requests

logger = logging.getLogger(__name__)


def _supabase_url():
    return (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")


def _service_role_key():
    return (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()


def get_user_from_access_token(access_token):
    """Verify a Supabase access token and return the auth user dict.

    Returns None if the token is missing/invalid/expired or the project is
    misconfigured (no service-role key, no URL).
    """
    url = _supabase_url()
    service_key = _service_role_key()

    if not url or not service_key:
        logger.error("Supabase service configuration missing for token verification")
        return None

    if not access_token:
        return None

    try:
        response = requests.get(
            f"{url}/auth/v1/user",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {access_token}",
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        logger.warning("Network error verifying Supabase session: %s", exc)
        return None

    if response.status_code != 200:
        logger.info("Supabase token verification rejected (status=%s)", response.status_code)
        return None

    try:
        user = response.json()
    except ValueError:
        return None

    return user if isinstance(user, dict) else None


def delete_auth_user(user_id):
    """Delete a Supabase Auth user using the privileged service-role credential.

    Returns:
        True   -> deletion confirmed successful
        False  -> deletion failed or misconfigured (caller should NOT report success)
    """
    url = _supabase_url()
    service_key = _service_role_key()

    if not url or not service_key:
        logger.error("Supabase service configuration missing for user deletion")
        return False

    if not user_id:
        return False

    try:
        response = requests.delete(
            f"{url}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        logger.warning("Network error deleting Supabase user: %s", exc)
        return False

    # 2xx (or 404 for an already-deleted user) -> nothing left to delete.
    if response.status_code in (200, 204, 202):
        return True

    if response.status_code == 404:
        logger.info("Supabase user %s already absent (idempotent success)", user_id)
        return True

    logger.error("Supabase admin user deletion failed (status=%s)", response.status_code)
    return False


def delete_user_rows(table, column, value):
    """Delete rows from a Supabase table using the service role credential.

    Returns True when the delete request completed successfully or the target
    rows were already absent. This is best-effort cleanup for account deletion.
    """
    url = _supabase_url()
    service_key = _service_role_key()

    if not url or not service_key:
        logger.error("Supabase service configuration missing for table cleanup")
        return False

    if not table or not column or not value:
        return False

    try:
        response = requests.delete(
            f"{url}/rest/v1/{table}",
            params={column: f"eq.{value}"},
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Prefer": "return=minimal",
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        logger.warning("Network error deleting rows from %s: %s", table, exc)
        return False

    if response.status_code in (200, 202, 204, 404):
        return True

    logger.error(
        "Supabase row cleanup failed for %s.%s (status=%s)",
        table,
        column,
        response.status_code,
    )
    return False


def delete_user_data(user_id):
    """Remove repository-owned Supabase rows for a user before auth deletion."""
    tables = [
        ("profiles", "id"),
        ("watchlist", "user_id"),
        ("continue_watching", "user_id"),
        ("ratings", "user_id"),
        ("comments", "user_id"),
        ("aniuzu_watchlist", "user_id"),
        ("aniuzu_continue_watching", "user_id"),
        ("aniuzu_ratings", "user_id"),
        ("aniuzu_comments", "user_id"),
        ("watch_parties", "host_user_id"),
        ("watch_parties", "guest_user_id"),
    ]

    ok = True

    for table, column in tables:
        if not delete_user_rows(table, column, user_id):
            ok = False

    return ok
