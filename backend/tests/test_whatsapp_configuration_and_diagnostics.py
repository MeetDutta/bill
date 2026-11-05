import json
from unittest.mock import Mock, patch
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.whatsapp.models import WhatsAppConfig
from apps.whatsapp.service import WhatsAppConfigurationService, WhatsAppService
from tests.factories import OrganizationFactory, UserFactory


class WhatsAppConfigurationAndDiagnosticsTests(TestCase):
    def setUp(self):
        self.org = OrganizationFactory(name="Test Retail Org")
        self.user = UserFactory(organization=self.org)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_whatsapp_save_and_retrieve_configuration(self):
        # 1. Save credentials via API
        save_data = {
            "phone_number_id": "1382325121639709",
            "business_account_id": "1646296526870554",
            "access_token": "EAAG_TEST_PERMANENT_ACCESS_TOKEN_12345",
            "is_active": True,
        }
        response = self.client.patch("/api/v1/whatsapp/config/", save_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["configured"])
        self.assertTrue(response.data["access_token_configured"])
        self.assertTrue(response.data["has_access_token"])
        self.assertEqual(response.data["phone_number_id"], "1382325121639709")
        self.assertEqual(response.data["business_account_id"], "1646296526870554")
        self.assertNotIn("EAAG_TEST_PERMANENT_ACCESS_TOKEN_12345", str(response.data))
        self.assertTrue(response.data["masked_access_token"].endswith("2345"))

        # 2. Verify persisted record in database
        config_db = WhatsAppConfig.objects.get(organization=self.org)
        self.assertEqual(config_db.phone_number_id, "1382325121639709")
        self.assertEqual(config_db.business_account_id, "1646296526870554")
        self.assertEqual(config_db.access_token, "EAAG_TEST_PERMANENT_ACCESS_TOKEN_12345")

        # 3. GET config endpoint returns sanitized, configured status
        get_response = self.client.get("/api/v1/whatsapp/config/")
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertTrue(get_response.data["configured"])
        self.assertTrue(get_response.data["access_token_configured"])
        self.assertNotIn("EAAG_TEST_PERMANENT_ACCESS_TOKEN_12345", str(get_response.data))

    @patch("apps.whatsapp.service.requests.get")
    def test_whatsapp_test_connection_using_saved_credentials(self, mock_get):
        WhatsAppConfig.objects.create(
            organization=self.org,
            phone_number_id="1382325121639709",
            business_account_id="1646296526870554",
            access_token="SAVED_TOKEN_ABCD",
            is_active=True,
        )

        mock_resp = Mock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "id": "1382325121639709",
            "display_phone_number": "+91 98765 43210",
            "verified_name": "BillMeet Test Store",
            "quality_rating": "GREEN",
        }
        mock_get.return_value = mock_resp

        # Empty body POST to /whatsapp/test-connection/ tests saved DB configuration
        response = self.client.post("/api/v1/whatsapp/test-connection/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["connected"])
        self.assertEqual(response.data["category"], "SUCCESS")
        self.assertEqual(response.data["phone_number"], "+91 98765 43210")
        self.assertEqual(response.data["verified_name"], "BillMeet Test Store")
        self.assertEqual(response.data["source"], "database")
        self.assertNotIn("SAVED_TOKEN_ABCD", str(response.data))

        # Ensure call went to Meta Graph API for phone number ID with Bearer auth
        mock_get.assert_called_once()
        call_url, call_kwargs = mock_get.call_args
        self.assertIn("/1382325121639709", call_url[0])
        self.assertEqual(call_kwargs["headers"]["Authorization"], "Bearer SAVED_TOKEN_ABCD")

    @patch("apps.whatsapp.service.requests.get")
    def test_whatsapp_test_connection_using_draft_credentials(self, mock_get):
        # Database has no configuration yet
        self.assertFalse(WhatsAppConfig.objects.filter(organization=self.org).exists())

        mock_resp = Mock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "id": "DRAFT_PHONE_ID_999",
            "display_phone_number": "+1 555 123 4567",
            "verified_name": "Draft Business",
        }
        mock_get.return_value = mock_resp

        draft_payload = {
            "phone_number_id": "DRAFT_PHONE_ID_999",
            "access_token": "DRAFT_TOKEN_XYZ",
        }
        response = self.client.post("/api/v1/whatsapp/test-connection/", draft_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["connected"])
        self.assertEqual(response.data["category"], "SUCCESS")
        self.assertEqual(response.data["source"], "request_payload")
        self.assertEqual(response.data["phone_number"], "+1 555 123 4567")

    @patch("apps.whatsapp.service.requests.get")
    def test_whatsapp_test_connection_partial_draft_uses_saved_token(self, mock_get):
        # Saved token in DB
        WhatsAppConfig.objects.create(
            organization=self.org,
            phone_number_id="OLD_PHONE_ID",
            business_account_id="OLD_WABA",
            access_token="EXISTING_SECRET_TOKEN",
            is_active=True,
        )

        mock_resp = Mock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "id": "NEW_DRAFT_PHONE_ID",
            "display_phone_number": "+91 88888 77777",
            "verified_name": "Updated Store",
        }
        mock_get.return_value = mock_resp

        # User only passes new phone_number_id without typing the token
        response = self.client.post(
            "/api/v1/whatsapp/test-connection/",
            {"phone_number_id": "NEW_DRAFT_PHONE_ID", "access_token": ""},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["connected"])

        # Verified it used the existing saved token with the draft phone ID
        call_url, call_kwargs = mock_get.call_args
        self.assertIn("/NEW_DRAFT_PHONE_ID", call_url[0])
        self.assertEqual(call_kwargs["headers"]["Authorization"], "Bearer EXISTING_SECRET_TOKEN")

    @patch("apps.whatsapp.service.requests.get")
    def test_whatsapp_test_connection_authentication_error(self, mock_get):
        mock_resp = Mock()
        mock_resp.ok = False
        mock_resp.status_code = 401
        mock_resp.json.return_value = {"error": {"message": "Invalid OAuth access token."}}
        mock_get.return_value = mock_resp

        response = self.client.post(
            "/api/v1/whatsapp/test-connection/",
            {"phone_number_id": "1382325121639709", "access_token": "EXPIRED_TOKEN"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["connected"])
        self.assertEqual(response.data["category"], "AUTHENTICATION_ERROR")
        self.assertEqual(response.data["reason"], "invalid_credentials")
        self.assertIn("rejected", response.data["message"])

    @patch("apps.whatsapp.service.requests.get")
    def test_whatsapp_test_connection_permission_error(self, mock_get):
        mock_resp = Mock()
        mock_resp.ok = False
        mock_resp.status_code = 403
        mock_resp.json.return_value = {"error": {"message": "Permissions error."}}
        mock_get.return_value = mock_resp

        response = self.client.post(
            "/api/v1/whatsapp/test-connection/",
            {"phone_number_id": "1382325121639709", "access_token": "NO_PERM_TOKEN"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["connected"])
        self.assertEqual(response.data["category"], "PERMISSION_ERROR")
        self.assertEqual(response.data["reason"], "insufficient_permissions")

    def test_whatsapp_test_connection_missing_credentials_returns_clear_message(self):
        # No config in DB and no body payload
        response = self.client.post("/api/v1/whatsapp/test-connection/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["connected"])
        self.assertEqual(response.data["category"], "CONFIGURATION_ERROR")
        self.assertEqual(response.data["reason"], "not_configured")
        self.assertIn("WhatsApp is not configured", response.data["message"])

    @override_settings(
        WHATSAPP_PHONE_NUMBER_ID="GLOBAL_LEAK_PHONE_ID",
        WHATSAPP_ACCESS_TOKEN="GLOBAL_LEAK_SECRET_TOKEN",
        WHATSAPP_BUSINESS_ACCOUNT_ID="GLOBAL_LEAK_WABA_ID",
    )
    def test_new_organization_settings_do_not_leak_environment_credentials(self):
        """Guarantee strict multi-tenant isolation: GET /whatsapp/config/ must never return global env vars to merchants."""
        new_org = OrganizationFactory(name="Brand New Merchant")
        new_user = UserFactory(organization=new_org)
        client = APIClient()
        client.force_authenticate(user=new_user)

        response = client.get("/api/v1/whatsapp/config/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # All credential fields must be empty and unconfigured
        self.assertEqual(response.data["phone_number_id"], "")
        self.assertEqual(response.data["business_account_id"], "")
        self.assertEqual(response.data["masked_access_token"], "")
        self.assertFalse(response.data["has_access_token"])
        self.assertFalse(response.data["access_token_configured"])
        self.assertFalse(response.data["configured"])
        # Global secrets must never be present in serialized response
        self.assertNotIn("GLOBAL_LEAK_PHONE_ID", str(response.data))
        self.assertNotIn("GLOBAL_LEAK_SECRET_TOKEN", str(response.data))
        self.assertNotIn("GLOBAL_LEAK_WABA_ID", str(response.data))

    @override_settings(
        WHATSAPP_PHONE_NUMBER_ID="ENV_PHONE_123",
        WHATSAPP_ACCESS_TOKEN="ENV_ACCESS_TOKEN_456",
        WHATSAPP_BUSINESS_ACCOUNT_ID="ENV_WABA_789",
    )
    def test_whatsapp_environment_fallback(self):
        # With no DB config, active configuration resolves from settings/env
        cfg = WhatsAppConfigurationService.get_active_configuration(self.org)
        self.assertTrue(cfg["configured"])
        self.assertEqual(cfg["source"], "environment")
        self.assertEqual(cfg["phone_number_id"], "ENV_PHONE_123")
        self.assertEqual(cfg["access_token"], "ENV_ACCESS_TOKEN_456")

        service = WhatsAppService.for_organization(self.org)
        self.assertIsNotNone(service)
        self.assertEqual(service.phone_number_id, "ENV_PHONE_123")

    def test_save_preserves_existing_token_when_blank_sent(self):
        # Create initial config with token
        WhatsAppConfig.objects.create(
            organization=self.org,
            phone_number_id="111222333",
            business_account_id="WABA_INITIAL",
            access_token="INITIAL_SECRET_TOKEN",
            is_active=True,
        )

        # Update business_account_id with blank access_token
        patch_data = {
            "business_account_id": "WABA_UPDATED",
            "access_token": "",
        }
        res = self.client.patch("/api/v1/whatsapp/config/", patch_data, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["business_account_id"], "WABA_UPDATED")
        self.assertTrue(res.data["access_token_configured"])

        # Check DB to confirm token was preserved
        db_cfg = WhatsAppConfig.objects.get(organization=self.org)
        self.assertEqual(db_cfg.access_token, "INITIAL_SECRET_TOKEN")
        self.assertEqual(db_cfg.business_account_id, "WABA_UPDATED")
