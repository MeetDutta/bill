from rest_framework import permissions


class IsSuperAdmin(permissions.BasePermission):
    """Allow only super admin users."""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_superuser


class IsOrganizationAdmin(permissions.BasePermission):
    """Allow organization admins and super admins."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in ("org_admin", "super_admin", "owner")


class IsStoreManager(permissions.BasePermission):
    """Allow store managers and above."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in ("org_admin", "super_admin", "owner", "store_manager", "manager")


class IsStaffOrAbove(permissions.BasePermission):
    """Allow staff and above."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return True


class IsAdminOrManager(permissions.BasePermission):
    """Allow organization admins, super admins, owners, and store managers."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in ("org_admin", "super_admin", "owner", "store_manager", "manager")


class IsInventoryStaffOrAbove(permissions.BasePermission):
    """Allow inventory staff, managers, and admins."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in ("org_admin", "super_admin", "owner", "store_manager", "manager", "inventory")


class IsCashierOrAbove(permissions.BasePermission):
    """Allow cashiers, staff, managers, and admins."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in ("org_admin", "super_admin", "owner", "store_manager", "manager", "cashier", "staff")


class IsOwnerOrReadOnly(permissions.BasePermission):
    """Allow owners of an object to edit it."""
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.created_by == request.user
