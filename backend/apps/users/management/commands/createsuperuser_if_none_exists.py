import os
from django.core.management.base import BaseCommand
from apps.users.models import User


class Command(BaseCommand):
    help = "Creates an initial superuser if none exists, reading credentials from environment variables."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            type=str,
            default=os.environ.get("DJANGO_SUPERUSER_EMAIL", "admin@digitalbill.local"),
            help="Superuser email address",
        )
        parser.add_argument(
            "--password",
            type=str,
            default=os.environ.get("DJANGO_SUPERUSER_PASSWORD"),
            help="Superuser password",
        )
        parser.add_argument(
            "--first-name",
            type=str,
            default=os.environ.get("DJANGO_SUPERUSER_FIRST_NAME", "Admin"),
            help="Superuser first name",
        )

    def handle(self, *args, **options):
        email = options["email"]
        password = options["password"]
        first_name = options["first_name"]

        if not password:
            self.stdout.write(
                self.style.WARNING(
                    "DJANGO_SUPERUSER_PASSWORD is not set. Skipping automatic superuser creation."
                )
            )
            return

        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write(
                self.style.SUCCESS("Superuser already exists in the database. No action needed.")
            )
            return

        if User.objects.filter(email=email).exists():
            user = User.objects.get(email=email)
            user.is_superuser = True
            user.is_staff = True
            user.role = "super_admin"
            user.set_password(password)
            user.save()
            self.stdout.write(
                self.style.SUCCESS(f"Existing user '{email}' upgraded to superuser.")
            )
            return

        User.objects.create_superuser(
            email=email,
            password=password,
            first_name=first_name,
            role="super_admin",
        )
        self.stdout.write(
            self.style.SUCCESS(f"Successfully created initial superuser '{email}'.")
        )
