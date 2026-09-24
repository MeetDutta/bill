from rest_framework import generics, permissions

from common.pagination import StandardPagination

from .models import User
from .serializers import UserCreateSerializer, UserSerializer


class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    pagination_class = StandardPagination
    search_fields = ["email", "first_name", "last_name"]
    filterset_fields = ["role", "is_active", "organization"]

    def get_queryset(self):
        return User.objects.filter(organization=self.request.user.organization)


class UserCreateView(generics.CreateAPIView):
    serializer_class = UserCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserSerializer

    def get_queryset(self):
        return User.objects.filter(organization=self.request.user.organization)
