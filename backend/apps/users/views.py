from django.db.models import Q
from rest_framework import generics, permissions
from rest_framework.exceptions import PermissionDenied, ValidationError

from common.pagination import StandardPagination
from common.permissions import IsAdminOrManager

from .models import User
from .serializers import UserCreateSerializer, UserSerializer


ADMIN_ROLES = ("org_admin", "super_admin", "owner")


class UserListView(generics.ListAPIView):
    """
    Staff Directory List View.
    Strictly tenant-isolated to the requester's organization.
    Restricted to Organization Administrators and Store Managers.
    """
    serializer_class = UserSerializer
    pagination_class = StandardPagination
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get_queryset(self):
        org = self.request.user.organization
        if not org:
            return User.objects.none()

        qs = User.objects.filter(organization=org).order_by("-created_at")

        search = self.request.query_params.get("search")
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(phone__icontains=search)
            )

        role = self.request.query_params.get("role")
        if role and role != "all":
            qs = qs.filter(role=role)

        is_active = self.request.query_params.get("is_active")
        if is_active is not None and is_active != "":
            if str(is_active).lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif str(is_active).lower() in ("false", "0"):
                qs = qs.filter(is_active=False)

        return qs


class UserCreateView(generics.CreateAPIView):
    """
    Create Staff Account View.
    Strictly scoped to requester's organization.
    Enforces server-side privilege boundaries:
    - Managers cannot create Admin accounts.
    - Non-superadmins cannot create Superadmins.
    """
    serializer_class = UserCreateSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def perform_create(self, serializer):
        requester = self.request.user
        org = requester.organization
        if not org:
            raise ValidationError("User has no associated organization.")

        target_role = serializer.validated_data.get("role", "staff")

        # Privilege boundary checks
        if requester.role in ("store_manager", "manager") and target_role in ADMIN_ROLES:
            raise PermissionDenied("Store Managers cannot create Administrator accounts.")

        if target_role == "super_admin" and not requester.is_superuser:
            raise PermissionDenied("Only super administrators can assign the super_admin role.")

        serializer.save(organization=org)


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Staff Account Detail, Update, and Deactivation View.
    Enforces critical safety constraints:
    1. Tenant isolation (cannot view/edit other org's staff).
    2. Privilege escalation prevention.
    3. Self-deactivation prevention.
    4. Self-role escalation prevention.
    5. Safeguard against deactivating or deleting the last active organization administrator.
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get_queryset(self):
        org = self.request.user.organization
        if not org:
            return User.objects.none()
        return User.objects.filter(organization=org)

    def perform_update(self, serializer):
        requester = self.request.user
        instance = self.get_object()
        data = self.request.data

        # 1. Self-role modification prevention
        if instance == requester and "role" in data and data["role"] != instance.role:
            raise ValidationError({"role": "You cannot modify your own role."})

        new_role = data.get("role")

        # 2. Super admin assignment requires global superuser
        if new_role == "super_admin" and not requester.is_superuser:
            raise PermissionDenied("Only super administrators can assign the super_admin role.")

        # 3. Prevent managers from modifying admin accounts or promoting to admin
        if requester.role in ("store_manager", "manager"):
            if instance.role in ADMIN_ROLES:
                raise PermissionDenied("Store Managers cannot modify Administrator accounts.")
            if new_role in ADMIN_ROLES:
                raise PermissionDenied("Store Managers cannot promote accounts to Administrator.")

        # 4. Prevent self-deactivation
        if instance == requester and data.get("is_active") is False:
            raise ValidationError({"is_active": "You cannot deactivate your own account."})

        # 5. Safeguard last active administrator
        if instance.role in ADMIN_ROLES and instance.is_active:
            other_active_admins = User.objects.filter(
                organization=instance.organization,
                role__in=ADMIN_ROLES,
                is_active=True,
            ).exclude(id=instance.id).count()

            if other_active_admins == 0:
                if data.get("is_active") is False:
                    raise ValidationError(
                        {"is_active": "Cannot deactivate the last active administrator of the organization."}
                    )
                if new_role and new_role not in ADMIN_ROLES:
                    raise ValidationError(
                        {"role": "Cannot change the role of the last active administrator of the organization."}
                    )

        serializer.save()

    def perform_destroy(self, instance):
        requester = self.request.user

        # 1. Self-deletion prevention
        if instance == requester:
            raise ValidationError("You cannot delete your own account.")

        # 2. Prevent managers from deleting admin accounts
        if requester.role in ("store_manager", "manager") and instance.role in ADMIN_ROLES:
            raise PermissionDenied("Store Managers cannot delete Administrator accounts.")

        # 3. Safeguard last active administrator
        if instance.role in ADMIN_ROLES:
            other_active_admins = User.objects.filter(
                organization=instance.organization,
                role__in=ADMIN_ROLES,
                is_active=True,
            ).exclude(id=instance.id).count()

            if other_active_admins == 0:
                raise ValidationError("Cannot delete the last active administrator of the organization.")

        instance.delete()
