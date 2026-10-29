from django.urls import path
from . import views

urlpatterns = [
    path("", views.NotificationListView.as_view(), name="notification-list"),
    path("summary/", views.NotificationSummaryView.as_view(), name="notification-summary"),
    path("mark-all-read/", views.NotificationMarkAllReadView.as_view(), name="notification-mark-all-read"),
    path("<uuid:pk>/mark-read/", views.NotificationMarkReadView.as_view(), name="notification-mark-read"),
    path("<uuid:pk>/mark-unread/", views.NotificationMarkUnreadView.as_view(), name="notification-mark-unread"),
    path("<uuid:pk>/dismiss/", views.NotificationDismissView.as_view(), name="notification-dismiss"),
]
