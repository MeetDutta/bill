from rest_framework import serializers

from .models import User


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        return value.strip().lower()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["email", "first_name", "last_name", "phone", "password"]

    def validate_email(self, value):
        return value.strip().lower()

    def create(self, validated_data):
        from apps.organizations.models import Organization
        from apps.stores.models import Store
        from apps.billing.models import BusinessConfig

        password = validated_data.pop("password")
        first_name = validated_data.get("first_name", "User")
        org_name = f"{first_name}'s Store"
        org = Organization.objects.create(name=org_name, legal_name=org_name)
        Store.objects.create(
            organization=org,
            name=f"{org_name} Main Store",
            code="STR-MAIN",
            status="active",
        )
        BusinessConfig.objects.create(
            organization=org,
            business_type="RETAIL",
            gst_enabled=True,
        )
        user = User.objects.create_user(
            organization=org,
            role="org_admin",
            **validated_data,
        )
        user.set_password(password)
        user.save()
        return user


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect")
        return value
