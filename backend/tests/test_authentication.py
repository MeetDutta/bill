from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from tests.factories import OrganizationFactory, UserFactory


class AuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory()
        self.user = UserFactory(
            email="test@example.com",
            password="testpass123",
            organization=self.org,
        )

    def test_login_success(self):
        response = self.client.post("/api/v1/auth/login/", {
            "email": "test@example.com",
            "password": "testpass123",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertIn("user", response.data)

    def test_login_invalid_credentials(self):
        response = self.client.post("/api/v1/auth/login/", {
            "email": "test@example.com",
            "password": "wrongpassword",
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_register_success(self):
        response = self.client.post("/api/v1/auth/register/", {
            "email": "new@example.com",
            "first_name": "New",
            "last_name": "User",
            "phone": "+919999999999",
            "password": "newpass123",
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertTrue(User.objects.filter(email="new@example.com").exists())

    def test_register_duplicate_email(self):
        response = self.client.post("/api/v1/auth/register/", {
            "email": "test@example.com",
            "first_name": "Duplicate",
            "last_name": "User",
            "password": "testpass123",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_get_profile(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/auth/profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "test@example.com")

    def test_change_password(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/v1/auth/change-password/", {
            "old_password": "testpass123",
            "new_password": "newpass456",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpass456"))

    def test_change_password_wrong_old(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/v1/auth/change-password/", {
            "old_password": "wrongpass",
            "new_password": "newpass456",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
