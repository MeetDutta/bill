import json
import pytest
from decimal import Decimal
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.organizations.models import Organization
from apps.users.models import User
from apps.billing.models import RealtimeEvent
from apps.billing.services.realtime_service import RealtimeService
from config.settings import validate_production_settings, KNOWN_INSECURE_SECRETS


@pytest.fixture
def integration_setup(db):
    cache.clear()
    org_a = Organization.objects.create(name="Tenant Alpha")
    user_a = User.objects.create_user(
        email="user_a@alpha.com",
        password="password123",
        organization=org_a,
        first_name="User",
        last_name="Alpha",
        role="owner",
    )

    org_b = Organization.objects.create(name="Tenant Beta")
    user_b = User.objects.create_user(
        email="user_b@beta.com",
        password="password123",
        organization=org_b,
        first_name="User",
        last_name="Beta",
        role="owner",
    )

    client_a = APIClient()
    client_a.force_authenticate(user=user_a)

    client_b = APIClient()
    client_b.force_authenticate(user=user_b)

    unauthenticated_client = APIClient()

    return {
        "org_a": org_a,
        "user_a": user_a,
        "client_a": client_a,
        "org_b": org_b,
        "user_b": user_b,
        "client_b": client_b,
        "anon_client": unauthenticated_client,
    }


@pytest.mark.django_db
class TestIntegrationBugFixes:
    # -------------------------------------------------------------------------
    # Issue 1: Remove frontend query parameter token fallback; require tickets
    # -------------------------------------------------------------------------
    def test_sse_query_token_rejected_prohibits_jwt_leak(self, integration_setup):
        """
        Passing access tokens in URL query parameters (?token=...) must be strictly
        prohibited and rejected with HTTP 401 to prevent token leakage in proxy logs.
        """
        anon_client = integration_setup["anon_client"]
        res = anon_client.get("/api/v1/pos/realtime/stream/?token=insecure_jwt_token_sample")

        assert res.status_code == status.HTTP_401_UNAUTHORIZED
        data = res.json()
        assert "Passing access tokens in URL query parameters is prohibited" in data["error"]

    def test_sse_ticket_generation_and_consumption(self, integration_setup):
        """
        Authenticated clients request a short-lived single-use ticket.
        SSE stream accepts ticket and returns a 200 StreamingHttpResponse.
        """
        client_a = integration_setup["client_a"]
        anon_client = integration_setup["anon_client"]

        # 1. Request ticket
        ticket_res = client_a.post("/api/v1/pos/realtime/ticket/")
        assert ticket_res.status_code == status.HTTP_200_OK
        ticket = ticket_res.data["ticket"]
        assert ticket.startswith("stkt_")
        assert ticket_res.data["expires_in"] == 60

        # 2. Connect with ticket
        stream_res = anon_client.get(f"/api/v1/pos/realtime/stream/?ticket={ticket}")
        assert stream_res.status_code == status.HTTP_200_OK
        assert stream_res["Content-Type"] == "text/event-stream"
        assert stream_res["X-Accel-Buffering"] == "no"

        # Read first chunk from generator
        first_chunk = next(iter(stream_res.streaming_content)).decode("utf-8")
        assert "event: connected" in first_chunk
        assert "Tenant Alpha" in first_chunk

    def test_sse_ticket_single_use_enforcement(self, integration_setup):
        """
        A ticket must be strictly single-use. Re-using the ticket for a second
        connection must fail immediately with HTTP 401.
        """
        client_a = integration_setup["client_a"]
        anon_client = integration_setup["anon_client"]

        ticket_res = client_a.post("/api/v1/pos/realtime/ticket/")
        ticket = ticket_res.data["ticket"]

        # First connection consumes ticket
        res1 = anon_client.get(f"/api/v1/pos/realtime/stream/?ticket={ticket}")
        assert res1.status_code == status.HTTP_200_OK

        # Second connection with same ticket is rejected
        res2 = anon_client.get(f"/api/v1/pos/realtime/stream/?ticket={ticket}")
        assert res2.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Authentication required" in res2.json()["error"]

    def test_sse_invalid_or_expired_ticket_rejected(self, integration_setup):
        """
        Non-existent or expired tickets return HTTP 401.
        """
        anon_client = integration_setup["anon_client"]
        res = anon_client.get("/api/v1/pos/realtime/stream/?ticket=non_existent_stkt")
        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    # -------------------------------------------------------------------------
    # Issue 2: Fix SSE reconnection cursor mismatch & verify reconnect/replay
    # -------------------------------------------------------------------------
    def test_sse_cursor_replay_with_last_event_id_query_param(self, integration_setup):
        """
        Backend reads standardized 'last_event_id' query parameter and replays
        missed events that occurred after the given cursor ID.
        """
        org_a = integration_setup["org_a"]
        client_a = integration_setup["client_a"]
        anon_client = integration_setup["anon_client"]

        # Publish 3 events
        ev1 = RealtimeEvent.objects.create(
            organization=org_a,
            event_type="sale_completed",
            payload={"invoice_num": "INV-001", "total": "100.00"},
        )
        ev2 = RealtimeEvent.objects.create(
            organization=org_a,
            event_type="sale_completed",
            payload={"invoice_num": "INV-002", "total": "200.00"},
        )
        ev3 = RealtimeEvent.objects.create(
            organization=org_a,
            event_type="stock_adjusted",
            payload={"product": "Bread", "qty": 5},
        )

        ticket_res = client_a.post("/api/v1/pos/realtime/ticket/")
        ticket = ticket_res.data["ticket"]

        # Reconnect with cursor set to ev1.id via last_event_id
        res = anon_client.get(
            f"/api/v1/pos/realtime/stream/?ticket={ticket}&last_event_id={ev1.id}"
        )
        assert res.status_code == status.HTTP_200_OK

        # Inspect stream chunks: should yield replay for ev2, then ev3, then connected event
        stream_iter = iter(res.streaming_content)
        chunk1 = next(stream_iter).decode("utf-8")
        chunk2 = next(stream_iter).decode("utf-8")

        assert f"id: {ev2.id}" in chunk1
        assert "INV-002" in chunk1
        assert f"id: {ev3.id}" in chunk2
        assert "Bread" in chunk2
        assert f"id: {ev1.id}" not in chunk1
        assert f"id: {ev1.id}" not in chunk2

    def test_sse_cursor_replay_with_last_event_id_header(self, integration_setup):
        """
        Standard Last-Event-ID HTTP header sent by browser EventSource reconnect
        is also respected and triggers replay.
        """
        org_a = integration_setup["org_a"]
        client_a = integration_setup["client_a"]
        anon_client = integration_setup["anon_client"]

        ev1 = RealtimeEvent.objects.create(
            organization=org_a,
            event_type="customer_created",
            payload={"customer_name": "Ramesh"},
        )
        ev2 = RealtimeEvent.objects.create(
            organization=org_a,
            event_type="customer_created",
            payload={"customer_name": "Suresh"},
        )

        ticket_res = client_a.post("/api/v1/pos/realtime/ticket/")
        ticket = ticket_res.data["ticket"]

        # Send Last-Event-ID header
        res = anon_client.get(
            f"/api/v1/pos/realtime/stream/?ticket={ticket}",
            HTTP_LAST_EVENT_ID=str(ev1.id),
        )
        assert res.status_code == status.HTTP_200_OK

        first_chunk = next(iter(res.streaming_content)).decode("utf-8")
        assert f"id: {ev2.id}" in first_chunk
        assert "Suresh" in first_chunk
        assert f"id: {ev1.id}" not in first_chunk

    def test_sse_reconnect_after_closure(self, integration_setup):
        """
        Simulate client stream closure and safe reconnect cycle:
        1. Client connects with ticket 1, receives event 1.
        2. Stream closes.
        3. A new event (event 2) arrives while disconnected.
        4. Client requests ticket 2 and connects with last_event_id=ev1.id.
        5. Client receives missed event 2 seamlessly.
        """
        org_a = integration_setup["org_a"]
        client_a = integration_setup["client_a"]
        anon_client = integration_setup["anon_client"]

        # Initial event
        ev1 = RealtimeEvent.objects.create(
            organization=org_a,
            event_type="shift_opened",
            payload={"cashier": "User Alpha"},
        )

        # Ticket 1
        t1 = client_a.post("/api/v1/pos/realtime/ticket/").data["ticket"]
        res1 = anon_client.get(f"/api/v1/pos/realtime/stream/?ticket={t1}")
        assert res1.status_code == status.HTTP_200_OK
        # Simulate stream closure
        del res1

        # Event occurs while offline
        ev2 = RealtimeEvent.objects.create(
            organization=org_a,
            event_type="shift_closed",
            payload={"cashier": "User Alpha"},
        )

        # Reconnect with ticket 2 and cursor
        t2 = client_a.post("/api/v1/pos/realtime/ticket/").data["ticket"]
        res2 = anon_client.get(
            f"/api/v1/pos/realtime/stream/?ticket={t2}&last_event_id={ev1.id}"
        )
        assert res2.status_code == status.HTTP_200_OK

        replayed_chunk = next(iter(res2.streaming_content)).decode("utf-8")
        assert f"id: {ev2.id}" in replayed_chunk
        assert "shift_closed" in replayed_chunk

    def test_sse_tenant_isolation(self, integration_setup):
        """
        Events created in Tenant Beta must never be streamed or replayed to Tenant Alpha.
        """
        org_a = integration_setup["org_a"]
        org_b = integration_setup["org_b"]
        client_a = integration_setup["client_a"]
        anon_client = integration_setup["anon_client"]

        ev_a = RealtimeEvent.objects.create(
            organization=org_a,
            event_type="alpha_secret_event",
            payload={"org": "Alpha"},
        )
        ev_b = RealtimeEvent.objects.create(
            organization=org_b,
            event_type="beta_secret_event",
            payload={"org": "Beta"},
        )

        # Tenant Alpha connects
        t_a = client_a.post("/api/v1/pos/realtime/ticket/").data["ticket"]
        res_a = anon_client.get(
            f"/api/v1/pos/realtime/stream/?ticket={t_a}&last_event_id={ev_a.id}"
        )
        assert res_a.status_code == status.HTTP_200_OK

        chunk_a = next(iter(res_a.streaming_content)).decode("utf-8")
        assert "beta_secret_event" not in chunk_a
        assert str(ev_b.id) not in chunk_a

    # -------------------------------------------------------------------------
    # Issue 6: Prevent production startup with DEBUG=True or insecure secrets
    # -------------------------------------------------------------------------
    def test_production_startup_fails_with_debug_true(self):
        """
        Running with ENVIRONMENT='production' and DEBUG=True must raise ImproperlyConfigured.
        """
        with pytest.raises(ImproperlyConfigured) as exc_info:
            validate_production_settings(
                debug=True,
                secret_key="a" * 50,
                database_url="postgres://user:pass@host:5432/db",
                allowed_hosts=["app.example.com"],
                environment="production",
            )
        assert "cannot run with DEBUG=True" in str(exc_info.value)

    def test_production_startup_fails_with_known_development_secret(self):
        """
        Using known insecure development secrets in production mode must raise ImproperlyConfigured.
        """
        for bad_secret in KNOWN_INSECURE_SECRETS:
            with pytest.raises(ImproperlyConfigured) as exc_info:
                validate_production_settings(
                    debug=False,
                    secret_key=bad_secret,
                    database_url="postgres://user:pass@host:5432/db",
                    allowed_hosts=["app.example.com"],
                    environment="production",
                )
            assert "Insecure or default SECRET_KEY detected in production" in str(exc_info.value)

    def test_production_startup_fails_with_short_secret(self):
        """
        A SECRET_KEY shorter than 32 characters in production must raise ImproperlyConfigured.
        """
        with pytest.raises(ImproperlyConfigured) as exc_info:
            validate_production_settings(
                debug=False,
                secret_key="too_short_key",
                database_url="postgres://user:pass@host:5432/db",
                allowed_hosts=["app.example.com"],
                environment="production",
            )
        assert "at least 32 characters is required" in str(exc_info.value)

    def test_production_startup_fails_without_database_url(self):
        """
        Production mode without DATABASE_URL must raise ImproperlyConfigured.
        """
        with pytest.raises(ImproperlyConfigured) as exc_info:
            validate_production_settings(
                debug=False,
                secret_key="a" * 50,
                database_url=None,
                allowed_hosts=["app.example.com"],
                environment="production",
            )
        assert "DATABASE_URL must be configured" in str(exc_info.value)

    def test_production_startup_fails_with_sqlite_database_url(self):
        """
        Production mode with SQLite DATABASE_URL must raise ImproperlyConfigured.
        """
        with pytest.raises(ImproperlyConfigured) as exc_info:
            validate_production_settings(
                debug=False,
                secret_key="a" * 50,
                database_url="sqlite:///db.sqlite3",
                allowed_hosts=["app.example.com"],
                environment="production",
            )
        assert "requires a production database" in str(exc_info.value)

    def test_production_startup_fails_with_wildcard_allowed_hosts(self):
        """
        Production mode with ALLOWED_HOSTS=['*'] must raise ImproperlyConfigured.
        """
        with pytest.raises(ImproperlyConfigured) as exc_info:
            validate_production_settings(
                debug=False,
                secret_key="a" * 50,
                database_url="postgres://user:pass@host:5432/db",
                allowed_hosts=["*"],
                environment="production",
            )
        assert "ALLOWED_HOSTS must be explicitly defined" in str(exc_info.value)

    def test_development_startup_succeeds_with_defaults(self):
        """
        In development mode (ENVIRONMENT='development', DEBUG=True),
        dev defaults pass validation without error to preserve local development usability.
        """
        # Should not raise any exception
        validate_production_settings(
            debug=True,
            secret_key="django-insecure-change-me",
            database_url=None,
            allowed_hosts=["localhost", "127.0.0.1", "testserver"],
            environment="development",
        )

    def test_valid_production_startup_succeeds(self):
        """
        A properly configured production environment passes validation.
        """
        # Should not raise any exception
        validate_production_settings(
            debug=False,
            secret_key="production-secure-random-token-with-sufficient-length-50chars",
            database_url="postgres://digitalbill_user:pass@db:5432/digitalbill_db",
            allowed_hosts=["api.billmeet.com", "app.billmeet.com"],
            environment="production",
        )
