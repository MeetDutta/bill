from django.urls import path

from . import views

urlpatterns = [
    path("config/", views.WhatsAppConfigView.as_view(), name="whatsapp-config"),
    path("templates/", views.WhatsAppTemplateListView.as_view(), name="whatsapp-template-list"),
    path("messages/", views.WhatsAppMessageListView.as_view(), name="whatsapp-message-list"),
    path("webhook/", views.WhatsAppWebhookView.as_view(), name="whatsapp-webhook"),
]
