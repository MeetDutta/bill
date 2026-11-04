import json
import logging
import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


class WhatsAppConfigurationService:
    """
    Centralized service for WhatsApp configuration resolution and diagnostics.
    Single source of truth for:
    - Settings API (view/save)
    - Connection diagnostic tests
    - Digital bill delivery
    - Marketing campaigns & automations
    """

    @classmethod
    def resolve_organization(cls, organization_or_user=None):
        """
        Safely resolve Organization instance from either an Organization, a User, or None.
        """
        if organization_or_user is None:
            from apps.organizations.models import Organization
            return Organization.objects.first()

        from apps.organizations.models import Organization
        if isinstance(organization_or_user, Organization):
            return organization_or_user

        # Object is a user or user-like instance
        user = organization_or_user
        if getattr(user, "organization", None):
            return user.organization

        org = Organization.objects.first()
        if not org:
            org = Organization.objects.create(name="BillMeet Store")
        if hasattr(user, "organization") and getattr(user, "is_authenticated", False):
            try:
                user.organization = org
                user.save(update_fields=["organization"])
            except Exception:
                pass
        return org

    @classmethod
    def get_active_configuration(cls, organization=None):
        """
        Resolve active WhatsApp credentials with strict priority:
        1. Database WhatsAppConfig record for the resolved organization.
        2. Environment variables / Django settings (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN).
        """
        from apps.whatsapp.models import WhatsAppConfig

        db_config = None
        if organization:
            org = cls.resolve_organization(organization)
            if org:
                db_config = WhatsAppConfig.objects.filter(organization=org).first()
        else:
            org = cls.resolve_organization(None)
            if org:
                db_config = WhatsAppConfig.objects.filter(organization=org).first()
            if not db_config:
                db_config = WhatsAppConfig.objects.filter(is_active=True).first()

        env_phone_id = getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "").strip()
        env_token = getattr(settings, "WHATSAPP_ACCESS_TOKEN", "").strip()
        env_business_id = getattr(settings, "WHATSAPP_BUSINESS_ACCOUNT_ID", "").strip()

        # Priority 1: Database
        if db_config and db_config.phone_number_id and db_config.access_token:
            source = "database"
            phone_number_id = db_config.phone_number_id.strip()
            access_token = db_config.access_token.strip()
            business_account_id = (db_config.business_account_id or env_business_id).strip()
            is_active = db_config.is_active
            configured = True
            has_access_token = True
        elif env_phone_id and env_token:
            # Priority 2: Environment variables
            source = "environment"
            phone_number_id = env_phone_id
            access_token = env_token
            business_account_id = (db_config.business_account_id if db_config else "") or env_business_id
            is_active = db_config.is_active if db_config else True
            configured = True
            has_access_token = True
        else:
            # Not fully configured
            source = "none"
            phone_number_id = (db_config.phone_number_id if db_config else "") or env_phone_id
            access_token = (db_config.access_token if db_config else "") or env_token
            business_account_id = (db_config.business_account_id if db_config else "") or env_business_id
            is_active = db_config.is_active if db_config else True
            configured = bool(phone_number_id and access_token)
            has_access_token = bool(access_token)

        # Log diagnostic status safely (never log tokens or auth headers)
        logger.info(
            "[WhatsApp Config] Record found: %s | Source: %s | Configured: %s | Phone ID: %s | Access Token configured: %s",
            bool(db_config),
            source,
            configured,
            bool(phone_number_id),
            has_access_token,
        )

        return {
            "configured": configured,
            "is_active": is_active,
            "phone_number_id": phone_number_id,
            "business_account_id": business_account_id,
            "access_token": access_token,
            "source": source,
            "has_access_token": has_access_token,
            "access_token_configured": has_access_token,
            "config_record": db_config,
        }

    @classmethod
    def test_connection(cls, phone_number_id=None, access_token=None, business_account_id=None, organization=None):
        """
        Verify Meta Cloud API credentials and phone-number resource without sending customer messages.
        Accepts optional draft credentials from the request or falls back to active configuration.
        """
        checked_at = timezone.now().isoformat()
        active_config = cls.get_active_configuration(organization)

        # Resolve phone_number_id and access_token:
        # If user supplied draft values in request, prefer them; otherwise fallback to active config
        use_phone_id = (phone_number_id or "").strip() or active_config["phone_number_id"]
        use_access_token = (access_token or "").strip() or active_config["access_token"]
        use_source = (
            "request_payload"
            if (phone_number_id or access_token)
            else active_config["source"]
        )

        if not use_phone_id or not use_access_token:
            return {
                "connected": False,
                "category": "CONFIGURATION_ERROR",
                "reason": "not_configured",
                "message": "WhatsApp is not configured. Save the phone number ID and access token first.",
                "checked_at": checked_at,
                "source": use_source,
            }

        version = getattr(settings, "WHATSAPP_API_VERSION", "v20.0")
        base_url = getattr(settings, "WHATSAPP_API_BASE_URL", f"https://graph.facebook.com/{version}").rstrip("/")
        url = f"{base_url}/{use_phone_id}"

        # Support both service.requests and views.requests if patched by test suites
        try:
            from apps.whatsapp import views as wa_views
            get_fn = getattr(wa_views.requests, "get", requests.get)
        except Exception:
            get_fn = requests.get

        try:
            response = get_fn(
                url,
                params={"fields": "id,display_phone_number,verified_name,code_verification_status,quality_rating"},
                headers={"Authorization": f"Bearer {use_access_token}"},
                timeout=(3.05, 10),
            )

            if response.ok:
                payload = response.json()
                if not isinstance(payload, dict) or not payload.get("id"):
                    return {
                        "connected": False,
                        "category": "UPSTREAM_ERROR",
                        "reason": "invalid_response",
                        "message": "Meta returned an unexpected response structure. Try again later.",
                        "checked_at": checked_at,
                        "source": use_source,
                    }
                return {
                    "connected": True,
                    "category": "SUCCESS",
                    "reason": "connected",
                    "message": "Meta API authentication succeeded and the configured phone-number resource is accessible.",
                    "phone_number": payload.get("display_phone_number", ""),
                    "verified_name": payload.get("verified_name", ""),
                    "quality_rating": payload.get("quality_rating", ""),
                    "code_verification_status": payload.get("code_verification_status", ""),
                    "checked_at": checked_at,
                    "source": use_source,
                }

            status_code = response.status_code
            if status_code == 401:
                category = "AUTHENTICATION_ERROR"
                reason = "invalid_credentials"
                message = "Meta rejected the access token. Check that it is valid, permanent, and has not expired."
            elif status_code == 403:
                category = "PERMISSION_ERROR"
                reason = "insufficient_permissions"
                message = "Access was denied. Check the token permissions (whatsapp_business_messaging) and access to this WhatsApp Business resource."
            elif status_code == 404:
                category = "CONFIGURATION_ERROR"
                reason = "phone_number_not_found"
                message = "Meta could not find the specified WhatsApp Phone Number ID. Check the Phone Number ID in your Meta App Dashboard."
            elif status_code == 429:
                category = "RATE_LIMITED"
                reason = "rate_limited"
                message = "Meta rate-limited the connection test. Wait a moment and try again."
            else:
                category = "UPSTREAM_ERROR"
                reason = "upstream_error"
                message = f"Meta API returned status {status_code}. Verify the phone number ID and Meta service status."

            return {
                "connected": False,
                "category": category,
                "reason": reason,
                "message": message,
                "checked_at": checked_at,
                "source": use_source,
            }

        except requests.Timeout:
            return {
                "connected": False,
                "category": "NETWORK_ERROR",
                "reason": "timeout",
                "message": "Meta did not respond before the connection test timed out.",
                "checked_at": checked_at,
                "source": use_source,
            }
        except requests.RequestException:
            return {
                "connected": False,
                "category": "NETWORK_ERROR",
                "reason": "network_error",
                "message": "Could not reach Meta Graph API. Check the server network connection.",
                "checked_at": checked_at,
                "source": use_source,
            }
        except (ValueError, TypeError):
            return {
                "connected": False,
                "category": "UPSTREAM_ERROR",
                "reason": "invalid_response",
                "message": "Meta returned an unexpected response. Try again later.",
                "checked_at": checked_at,
                "source": use_source,
            }


class WhatsAppService:
    def __init__(self, phone_number_id=None, access_token=None, business_account_id=None):
        version = getattr(settings, "WHATSAPP_API_VERSION", "v20.0")
        self.base_url = getattr(settings, "WHATSAPP_API_BASE_URL", f"https://graph.facebook.com/{version}")
        self.phone_number_id = phone_number_id or getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "")
        self.access_token = access_token or getattr(settings, "WHATSAPP_ACCESS_TOKEN", "")
        self.business_account_id = business_account_id or getattr(settings, "WHATSAPP_BUSINESS_ACCOUNT_ID", "")

    @classmethod
    def for_organization(cls, organization=None):
        """
        Instantiate WhatsAppService using the active configuration for the organization.
        Returns None if WhatsApp is not configured or inactive.
        """
        cfg = WhatsAppConfigurationService.get_active_configuration(organization)
        if not cfg["configured"] or not cfg.get("is_active", True):
            return None
        return cls(
            phone_number_id=cfg["phone_number_id"],
            access_token=cfg["access_token"],
            business_account_id=cfg.get("business_account_id", ""),
        )

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def send_template(self, to, template_name, language="en", components=None):
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
            },
        }
        if components:
            payload["template"]["components"] = components

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        response = requests.post(url, json=payload, headers=self._headers(), timeout=30)
        return response.json()

    def send_text(self, to, text):
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": text},
        }
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        response = requests.post(url, json=payload, headers=self._headers(), timeout=30)
        return response.json()

    def send_document(self, to, document_url, caption=""):
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "document",
            "document": {
                "link": document_url,
                "caption": caption,
            },
        }
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        response = requests.post(url, json=payload, headers=self._headers(), timeout=30)
        return response.json()

    def send_image(self, to, image_url, caption=""):
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "image",
            "image": {
                "link": image_url,
                "caption": caption,
            },
        }
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        response = requests.post(url, json=payload, headers=self._headers(), timeout=30)
        return response.json()


@shared_task(name="apps.whatsapp.tasks.send_digital_bill_task")
def send_digital_bill_task(transaction_id):
    from apps.transactions.models import Transaction
    from apps.invoices.models import Invoice
    from apps.whatsapp.models import WhatsAppMessage

    try:
        tx = Transaction.objects.select_related("customer", "store", "organization").get(id=transaction_id)
    except Transaction.DoesNotExist:
        return {"error": "Transaction not found"}

    if not tx.customer or not tx.customer.phone:
        return {"error": "No customer phone number"}
    if not tx.customer.whatsapp_opt_in:
        return {"error": "Customer opted out of WhatsApp"}

    try:
        invoice = tx.invoice
    except Invoice.DoesNotExist:
        return {"error": "Invoice not found"}

    phone = tx.customer.phone.replace("+", "").replace(" ", "")
    if not phone.startswith("91"):
        phone = f"91{phone}"

    service = WhatsAppService.for_organization(tx.organization)
    if not service:
        return {"error": "WhatsApp not configured"}

    msg = WhatsAppMessage.objects.create(
        organization=tx.organization,
        customer=tx.customer,
        phone_number=phone,
        message_type="document",
        content={
            "invoice_number": invoice.invoice_number,
            "total": str(tx.total),
            "store": tx.store.name,
        },
        status="processing",
    )

    try:
        if invoice.pdf_url:
            result = service.send_document(
                to=phone,
                document_url=invoice.pdf_url,
                caption=f"Your bill from {tx.store.name} - Invoice #{invoice.invoice_number}",
            )
        else:
            frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
            text = (
                f"Hi {tx.customer.first_name},\n\n"
                f"Thank you for your purchase at {tx.store.name}!\n"
                f"Invoice: {invoice.invoice_number}\n"
                f"Amount: ₹{tx.total}\n"
                f"Date: {tx.transaction_date.strftime('%d %b %Y')}\n\n"
                f"View your bill: {frontend_url}/bills/{invoice.secure_token}"
            )
            result = service.send_text(to=phone, text=text)

        if "messages" in result:
            msg.provider_message_id = result["messages"][0].get("id", "")
            msg.status = "sent"
            msg.sent_at = timezone.now()
            tx.bill_sent = True
            tx.bill_sent_at = timezone.now()
            tx.save(update_fields=["bill_sent", "bill_sent_at"])
        else:
            msg.status = "failed"
            msg.failure_reason = json.dumps(result)
            msg.failed_at = timezone.now()

    except Exception as e:
        msg.status = "failed"
        msg.failure_reason = str(e)
        msg.failed_at = timezone.now()

    msg.save()
    return {"message_id": str(msg.id), "status": msg.status}


@shared_task(name="apps.whatsapp.tasks.send_coupon_task")
def send_coupon_task(coupon_id, customer_id):
    from apps.coupons.models import Coupon
    from apps.customers.models import Customer
    from apps.whatsapp.models import WhatsAppMessage

    try:
        coupon = Coupon.objects.get(id=coupon_id)
        customer = Customer.objects.get(id=customer_id)
    except (Coupon.DoesNotExist, Customer.DoesNotExist):
        return {"error": "Coupon or customer not found"}

    if not customer.phone or not customer.whatsapp_opt_in:
        return {"error": "Customer not reachable"}

    phone = customer.phone.replace("+", "").replace(" ", "")
    if not phone.startswith("91"):
        phone = f"91{phone}"

    service = WhatsAppService.for_organization(coupon.organization)
    if not service:
        return {"error": "WhatsApp not configured"}

    msg = WhatsAppMessage.objects.create(
        organization=coupon.organization,
        customer=customer,
        phone_number=phone,
        message_type="text",
        content={"coupon_code": coupon.code, "discount": str(coupon.discount_value)},
        status="processing",
    )

    try:
        text = (
            f"Hi {customer.first_name}! 🎉\n\n"
            f"You have a special coupon from us!\n\n"
            f"Code: *{coupon.code}*\n"
            f"Discount: {coupon.discount_type} {coupon.discount_value}\n"
            f"Valid until: {coupon.expires_at.strftime('%d %b %Y')}\n\n"
            f"Use this at your next purchase!"
        )
        result = service.send_text(to=phone, text=text)

        if "messages" in result:
            msg.provider_message_id = result["messages"][0].get("id", "")
            msg.status = "sent"
            msg.sent_at = timezone.now()
        else:
            msg.status = "failed"
            msg.failure_reason = json.dumps(result)
            msg.failed_at = timezone.now()

    except Exception as e:
        msg.status = "failed"
        msg.failure_reason = str(e)
        msg.failed_at = timezone.now()

    msg.save()
    return {"message_id": str(msg.id), "status": msg.status}


@shared_task(name="apps.whatsapp.tasks.send_loyalty_notification_task")
def send_loyalty_notification_task(customer_id, points, transaction_type="earn"):
    from apps.customers.models import Customer
    from apps.whatsapp.models import WhatsAppMessage

    try:
        customer = Customer.objects.get(id=customer_id)
    except Customer.DoesNotExist:
        return {"error": "Customer not found"}

    if not customer.phone or not customer.whatsapp_opt_in:
        return {"error": "Customer not reachable"}

    phone = customer.phone.replace("+", "").replace(" ", "")
    if not phone.startswith("91"):
        phone = f"91{phone}"

    service = WhatsAppService.for_organization(customer.organization)
    if not service:
        return {"error": "WhatsApp not configured"}

    action = "earned" if transaction_type == "earn" else "redeemed"

    msg = WhatsAppMessage.objects.create(
        organization=customer.organization,
        customer=customer,
        phone_number=phone,
        message_type="text",
        content={"points": str(points), "action": action},
        status="processing",
    )

    try:
        text = (
            f"Hi {customer.first_name}! 🌟\n\n"
            f"You've {action} *{points}* loyalty points!\n\n"
            f"Keep shopping to earn more rewards."
        )
        result = service.send_text(to=phone, text=text)

        if "messages" in result:
            msg.provider_message_id = result["messages"][0].get("id", "")
            msg.status = "sent"
            msg.sent_at = timezone.now()
        else:
            msg.status = "failed"
            msg.failure_reason = json.dumps(result)
            msg.failed_at = timezone.now()

    except Exception as e:
        msg.status = "failed"
        msg.failure_reason = str(e)
        msg.failed_at = timezone.now()

    msg.save()
    return {"message_id": str(msg.id), "status": msg.status}


@shared_task(name="apps.whatsapp.tasks.send_birthday_message_task")
def send_birthday_message_task(customer_id):
    from apps.customers.models import Customer
    from apps.whatsapp.models import WhatsAppMessage

    try:
        customer = Customer.objects.get(id=customer_id)
    except Customer.DoesNotExist:
        return {"error": "Customer not found"}

    if not customer.phone or not customer.whatsapp_opt_in:
        return {"error": "Customer not reachable"}

    phone = customer.phone.replace("+", "").replace(" ", "")
    if not phone.startswith("91"):
        phone = f"91{phone}"

    service = WhatsAppService.for_organization(customer.organization)
    if not service:
        return {"error": "WhatsApp not configured"}

    msg = WhatsAppMessage.objects.create(
        organization=customer.organization,
        customer=customer,
        phone_number=phone,
        message_type="text",
        content={"type": "birthday"},
        status="processing",
    )

    try:
        text = (
            f"Happy Birthday, {customer.first_name}! 🎂🎉\n\n"
            f"Wishing you a wonderful day! Here's a special birthday treat for you.\n"
            f"Use code BDAY{customer.first_name[:3].upper()} for 15% off your next order!"
        )
        result = service.send_text(to=phone, text=text)

        if "messages" in result:
            msg.provider_message_id = result["messages"][0].get("id", "")
            msg.status = "sent"
            msg.sent_at = timezone.now()
        else:
            msg.status = "failed"
            msg.failure_reason = json.dumps(result)
            msg.failed_at = timezone.now()

    except Exception as e:
        msg.status = "failed"
        msg.failure_reason = str(e)
        msg.failed_at = timezone.now()

    msg.save()
    return {"message_id": str(msg.id), "status": msg.status}
