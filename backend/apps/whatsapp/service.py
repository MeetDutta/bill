import json
import logging
import re
import sys
import threading
import time
from datetime import timedelta

import requests
from celery import shared_task
from django.conf import settings
from django.db import close_old_connections, transaction as db_transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

INVOICE_WHATSAPP_CAPTION = "Thank you for your purchase. Your invoice is attached."
INVOICE_WHATSAPP_MIME_TYPE = "application/pdf"
_PATH_REDACTION_RE = re.compile(r"(?:/[A-Za-z0-9._-]+){2,}|[A-Za-z]:\\(?:[^\\\s]+\\)+[^\\\s]*")
_BEARER_REDACTION_RE = re.compile(r"Bearer\s+[A-Za-z0-9._\-+/=]+", re.IGNORECASE)
_META_TOKEN_REDACTION_RE = re.compile(r"\bEAA[A-Za-z0-9._\-]{10,}\b")


def sanitize_whatsapp_error(text, secret_token=""):
    """Strip secrets, bearer headers, and filesystem paths before logging or storing."""
    msg = str(text or "WhatsApp API request failed").strip()
    if secret_token and len(secret_token) >= 4:
        msg = msg.replace(secret_token, "[REDACTED]")
    msg = _BEARER_REDACTION_RE.sub("Bearer [REDACTED]", msg)
    msg = _META_TOKEN_REDACTION_RE.sub("[REDACTED_TOKEN]", msg)
    msg = _PATH_REDACTION_RE.sub("[PATH]", msg)
    return msg[:500]


def format_whatsapp_phone(raw_phone):
    """
    Validate and format a phone number into Meta Cloud API international digits-only form.
    Reuses apps.customers.utils.normalize_phone for consistent Indian / international normalization.
    Returns "" if missing, walk-in placeholder, or invalid.
    """
    if raw_phone is None:
        return ""
    raw_str = str(raw_phone).strip()
    if not raw_str or raw_str.lower().startswith("walkin"):
        return ""
    if re.search(r"[a-zA-Z]", raw_str):
        return ""

    from apps.customers.utils import normalize_phone

    normalized = normalize_phone(raw_str)
    digits = re.sub(r"\D", "", normalized or "")
    if not digits:
        return ""

    if digits.startswith("0") and len(digits) > 10:
        digits = digits.lstrip("0")

    if len(set(digits)) <= 1:
        return ""

    if len(digits) == 10:
        return f"91{digits}"
    if 11 <= len(digits) <= 15:
        return digits
    return ""


def build_invoice_pdf_filename(invoice_number, fallback_id=""):
    """Generate a safe, predictable PDF filename: Invoice_<invoice_number>.pdf."""
    base = str(invoice_number or fallback_id or "Receipt").strip()
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._-")
    if not safe:
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", str(fallback_id or "Receipt")).strip("._-") or "Receipt"
    return f"Invoice_{safe}.pdf"


def serialize_whatsapp_delivery(msg):
    if not msg:
        return None
    meta = msg.metadata if isinstance(msg.metadata, dict) else {}
    return {
        "message_id": str(msg.id),
        "status": msg.status,
        "provider_message_id": msg.provider_message_id,
        "phone_number": msg.phone_number,
        "filename": meta.get("filename", ""),
        "failure_reason": msg.failure_reason,
        "skip_reason": meta.get("skip_reason", "") or (msg.failure_reason if msg.status == "skipped" else ""),
        "trigger": meta.get("trigger", ""),
        "retry_count": msg.retry_count,
        "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
        "delivered_at": msg.delivered_at.isoformat() if msg.delivered_at else None,
        "read_at": msg.read_at.isoformat() if msg.read_at else None,
        "failed_at": msg.failed_at.isoformat() if msg.failed_at else None,
        "updated_at": msg.updated_at.isoformat() if getattr(msg, "updated_at", None) else None,
    }


def get_invoice_whatsapp_status(invoice):
    if not invoice:
        return None
    from apps.whatsapp.models import WhatsAppMessage

    msg = (
        WhatsAppMessage.objects.filter(
            organization=invoice.organization,
            external_id=f"invoice:{invoice.id}",
        )
        .order_by("-created_at")
        .first()
    )
    if not msg:
        return None
    return serialize_whatsapp_delivery(msg)


def get_invoices_whatsapp_status_map(invoices):
    invoice_list = [inv for inv in (invoices or []) if inv is not None]
    if not invoice_list:
        return {}
    from apps.whatsapp.models import WhatsAppMessage

    ext_ids = [f"invoice:{inv.id}" for inv in invoice_list]
    org_ids = {inv.organization_id for inv in invoice_list if inv.organization_id}
    qs = WhatsAppMessage.objects.filter(
        organization_id__in=list(org_ids),
        external_id__in=ext_ids,
    ).order_by("external_id", "-created_at")

    result = {}
    for msg in qs:
        if msg.external_id not in result:
            result[msg.external_id] = serialize_whatsapp_delivery(msg)
    return result


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

    def _auth_headers(self):
        return {
            "Authorization": f"Bearer {self.access_token}",
        }

    def _parse_api_response(self, response, fallback_error="WhatsApp API request failed"):
        status_code = getattr(response, "status_code", None)
        if not isinstance(status_code, int):
            ok_val = getattr(response, "ok", True)
            status_code = 200 if (not isinstance(ok_val, bool) or ok_val) else 500
        ok_attr = getattr(response, "ok", None)
        is_ok = ok_attr if isinstance(ok_attr, bool) else (200 <= status_code < 300)

        try:
            data = response.json()
        except ValueError:
            data = {}

        if not isinstance(data, dict):
            data = {}

        if is_ok and "error" not in data:
            return data

        err_obj = data.get("error") if isinstance(data.get("error"), dict) else {}
        raw_msg = err_obj.get("error_user_msg") or err_obj.get("message") or data.get("message") or f"{fallback_error} (HTTP {status_code})"
        retryable = status_code >= 500 or status_code == 429 or err_obj.get("code") in {1, 2, 4, 17, 130429, 131016}
        return {
            "error": {
                "message": sanitize_whatsapp_error(raw_msg, self.access_token),
                "code": err_obj.get("code"),
                "status_code": status_code,
                "retryable": retryable,
            }
        }

    def upload_media(self, file_bytes, filename, mime_type=INVOICE_WHATSAPP_MIME_TYPE):
        """Upload binary media (PDF invoice) to Meta WhatsApp Cloud API to obtain a media ID."""
        if not self.phone_number_id or not self.access_token:
            return {
                "error": {
                    "message": "WhatsApp credentials are incomplete.",
                    "retryable": False,
                }
            }
        if not isinstance(file_bytes, (bytes, bytearray)) or len(file_bytes) == 0:
            return {
                "error": {
                    "message": "Cannot upload empty document.",
                    "retryable": False,
                }
            }
        if mime_type == "application/pdf" and not bytes(file_bytes).startswith(b"%PDF-"):
            return {
                "error": {
                    "message": "Generated file is not a valid PDF document.",
                    "retryable": False,
                }
            }

        url = f"{self.base_url}/{self.phone_number_id}/media"
        files = {
            "file": (filename, bytes(file_bytes), mime_type),
        }
        data = {
            "messaging_product": "whatsapp",
            "type": mime_type,
        }
        response = requests.post(
            url,
            data=data,
            files=files,
            headers=self._auth_headers(),
            timeout=(5, 20),
        )
        return self._parse_api_response(response, fallback_error="Meta media upload failed")

    def send_document(self, to, document_url=None, caption="", media_id=None, filename=None):
        """
        Send a WhatsApp document message.
        Prefers uploaded Meta `media_id` so private invoice PDFs are delivered securely.
        """
        if media_id:
            document_payload = {"id": media_id}
        elif document_url:
            document_payload = {"link": document_url}
        else:
            return {
                "error": {
                    "message": "Document media_id or URL is required.",
                    "retryable": False,
                }
            }

        if caption:
            document_payload["caption"] = caption
        if filename:
            document_payload["filename"] = filename

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "document",
            "document": document_payload,
        }
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        response = requests.post(url, json=payload, headers=self._headers(), timeout=(5, 20))
        return self._parse_api_response(response, fallback_error="Meta document message send failed")

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


def _extract_error_and_retryable(result, secret_token=""):
    if not isinstance(result, dict):
        return sanitize_whatsapp_error(result, secret_token), False
    err = result.get("error")
    if isinstance(err, dict):
        msg = err.get("error_user_msg") or err.get("message") or json.dumps(err)
        return sanitize_whatsapp_error(msg, secret_token), bool(err.get("retryable", False))
    if err:
        return sanitize_whatsapp_error(err, secret_token), False
    return sanitize_whatsapp_error(json.dumps(result), secret_token), False


def _publish_invoice_whatsapp_event(invoice, transaction, msg):
    if not invoice or not transaction or not msg:
        return
    try:
        from apps.billing.services.realtime_service import RealtimeService

        RealtimeService.publish_event(
            organization=transaction.organization,
            store=transaction.store,
            event_type="invoice_whatsapp_updated",
            payload={
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "transaction_id": str(transaction.id),
                "bill_sent": bool(transaction.bill_sent),
                "whatsapp_delivery": serialize_whatsapp_delivery(msg),
            },
        )
    except Exception as exc:
        logger.warning(
            "Failed to publish invoice_whatsapp_updated realtime event: %s",
            sanitize_whatsapp_error(exc),
        )


def _record_non_sent_invoice_message(
    *,
    invoice,
    transaction,
    customer,
    raw_phone,
    filename,
    caption,
    pdf_format,
    target_status,
    reason,
    trigger="automatic",
):
    from apps.whatsapp.models import WhatsAppMessage

    external_id = f"invoice:{invoice.id}"
    content = {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "filename": filename,
        "caption": caption,
    }
    meta = {
        "invoice_id": str(invoice.id),
        "transaction_id": str(transaction.id),
        "invoice_number": invoice.invoice_number,
        "filename": filename,
        "mime_type": INVOICE_WHATSAPP_MIME_TYPE,
        "format_type": pdf_format,
        "trigger": trigger,
    }
    if target_status == "skipped":
        meta["skip_reason"] = reason

    existing = (
        WhatsAppMessage.objects.filter(
            organization=transaction.organization,
            external_id=external_id,
        )
        .order_by("-created_at")
        .first()
    )
    now = timezone.now()
    if existing and existing.status not in ("sent", "delivered", "read"):
        existing.customer = customer
        existing.phone_number = str(raw_phone or "")[:20]
        existing.content = content
        existing.status = target_status
        existing.failed_at = now if target_status == "failed" else None
        existing.failure_reason = reason
        existing.metadata = {**(existing.metadata if isinstance(existing.metadata, dict) else {}), **meta}
        existing.save(
            update_fields=[
                "customer",
                "phone_number",
                "content",
                "status",
                "failed_at",
                "failure_reason",
                "metadata",
                "updated_at",
            ]
        )
        msg = existing
    else:
        msg = WhatsAppMessage.objects.create(
            organization=transaction.organization,
            customer=customer,
            phone_number=str(raw_phone or "")[:20],
            message_type="document",
            external_id=external_id,
            content=content,
            status=target_status,
            failed_at=now if target_status == "failed" else None,
            failure_reason=reason,
            metadata=meta,
        )
    _publish_invoice_whatsapp_event(invoice, transaction, msg)
    return msg


def deliver_invoice_pdf_via_whatsapp(
    *,
    transaction=None,
    invoice=None,
    transaction_id=None,
    invoice_id=None,
    force=False,
    record_failure=False,
    format_type=None,
    phone_override=None,
):
    """
    Generate the canonical BillMeet invoice PDF, upload it to Meta WhatsApp Cloud API
    via the Media endpoint, and send it as a PDF document attachment.
    Financial records are never mutated or rolled back on WhatsApp failure.
    """
    from apps.customers.models import CustomerTimeline
    from apps.invoices.models import Invoice
    from apps.invoices.pdf import generate_invoice_pdf, generate_invoice_pdf_bytes
    from apps.invoices.tasks import ensure_invoice_for_transaction
    from apps.transactions.models import Transaction
    from apps.whatsapp.models import WhatsAppMessage

    if invoice is None and invoice_id:
        invoice = (
            Invoice.objects.select_related(
                "organization",
                "transaction__customer",
                "transaction__store",
                "transaction__organization",
            )
            .filter(id=invoice_id)
            .first()
        )
    if transaction is None:
        if invoice is not None:
            transaction = invoice.transaction
        elif transaction_id:
            transaction = (
                Transaction.objects.select_related("organization", "store", "customer")
                .filter(id=transaction_id)
                .first()
            )

    if transaction is None:
        return {"status": "error", "error": "Transaction not found", "retryable": False}

    if transaction.status != "completed":
        return {
            "status": "skipped",
            "error": f"Invoice WhatsApp delivery requires completed transaction (got {transaction.status})",
            "retryable": False,
        }

    # Ensure finalized Invoice record exists for the completed transaction
    if invoice is None:
        invoice = Invoice.objects.filter(transaction=transaction).first()
    if invoice is None:
        invoice = ensure_invoice_for_transaction(transaction, generate_file=False)

    external_id = f"invoice:{invoice.id}"
    pdf_format = format_type or getattr(invoice, "template_format", "a4") or "a4"
    if pdf_format not in ("a4", "thermal", "receipt"):
        pdf_format = "a4"
    filename = build_invoice_pdf_filename(invoice.invoice_number, str(invoice.id))
    caption = INVOICE_WHATSAPP_CAPTION
    trigger_mode = "manual" if (record_failure or force or phone_override) else "automatic"

    # Validate customer opt-in & recipient phone before checking credentials (preserves opt-out semantics)
    customer = transaction.customer
    if phone_override is not None and str(phone_override).strip():
        raw_phone = str(phone_override).strip()
        if customer and not customer.whatsapp_opt_in and not force:
            err_msg = "Customer opted out of WhatsApp"
            if not record_failure:
                msg = _record_non_sent_invoice_message(
                    invoice=invoice,
                    transaction=transaction,
                    customer=customer,
                    raw_phone=raw_phone,
                    filename=filename,
                    caption=caption,
                    pdf_format=pdf_format,
                    target_status="skipped",
                    reason=err_msg,
                    trigger=trigger_mode,
                )
                return {
                    "message_id": str(msg.id),
                    "status": "skipped",
                    "error": err_msg,
                    "skip_reason": err_msg,
                    "retryable": False,
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                }
            return {"status": "skipped", "error": err_msg, "retryable": False}
    else:
        if not customer:
            err_msg = "Walk-in customer has no valid WhatsApp phone number."
            if not record_failure:
                msg = _record_non_sent_invoice_message(
                    invoice=invoice,
                    transaction=transaction,
                    customer=None,
                    raw_phone="",
                    filename=filename,
                    caption=caption,
                    pdf_format=pdf_format,
                    target_status="skipped",
                    reason=err_msg,
                    trigger=trigger_mode,
                )
                return {
                    "message_id": str(msg.id),
                    "status": "skipped",
                    "error": err_msg,
                    "skip_reason": err_msg,
                    "retryable": False,
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                }
            return {"status": "skipped", "error": "No customer linked to transaction", "retryable": False}
        if not customer.whatsapp_opt_in:
            err_msg = "Customer opted out of WhatsApp"
            if not record_failure:
                msg = _record_non_sent_invoice_message(
                    invoice=invoice,
                    transaction=transaction,
                    customer=customer,
                    raw_phone=customer.phone,
                    filename=filename,
                    caption=caption,
                    pdf_format=pdf_format,
                    target_status="skipped",
                    reason=err_msg,
                    trigger=trigger_mode,
                )
                return {
                    "message_id": str(msg.id),
                    "status": "skipped",
                    "error": err_msg,
                    "skip_reason": err_msg,
                    "retryable": False,
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                }
            return {"status": "skipped", "error": err_msg, "retryable": False}
        raw_phone = customer.phone

    phone = format_whatsapp_phone(raw_phone)
    is_walkin_placeholder = (
        (customer is None)
        or bool(getattr(customer, "is_walk_in", False))
        or str(raw_phone or "").strip().lower().startswith("walkin-")
    )

    if not phone:
        err_msg = (
            "Walk-in customer has no valid WhatsApp phone number."
            if (not record_failure and is_walkin_placeholder)
            else "Customer phone number is missing or invalid for WhatsApp"
        )
        msg = _record_non_sent_invoice_message(
            invoice=invoice,
            transaction=transaction,
            customer=customer,
            raw_phone=raw_phone,
            filename=filename,
            caption=caption,
            pdf_format=pdf_format,
            target_status="failed" if record_failure else "skipped",
            reason=err_msg,
            trigger=trigger_mode,
        )
        if record_failure:
            return {
                "message_id": str(msg.id),
                "status": "failed",
                "error": err_msg,
                "retryable": False,
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
            }
        return {
            "message_id": str(msg.id),
            "status": "skipped",
            "error": err_msg,
            "skip_reason": err_msg,
            "retryable": False,
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
        }

    service = WhatsAppService.for_organization(transaction.organization)
    if not service:
        err_msg = "WhatsApp not configured"
        msg = _record_non_sent_invoice_message(
            invoice=invoice,
            transaction=transaction,
            customer=customer,
            raw_phone=phone,
            filename=filename,
            caption=caption,
            pdf_format=pdf_format,
            target_status="failed" if record_failure else "skipped",
            reason=err_msg,
            trigger=trigger_mode,
        )
        if record_failure:
            return {
                "message_id": str(msg.id),
                "status": "failed",
                "error": err_msg,
                "retryable": False,
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
            }
        return {
            "message_id": str(msg.id),
            "status": "skipped",
            "error": err_msg,
            "skip_reason": err_msg,
            "retryable": False,
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
        }

    # Atomic duplicate & concurrency guard (row lock prevents simultaneous sends before HTTP I/O)
    with db_transaction.atomic():
        Invoice.objects.select_for_update().filter(id=invoice.id).first()
        tx_bill_sent = (
            Transaction.objects.filter(id=transaction.id).values_list("bill_sent", flat=True).first()
        )
        existing_msgs = list(
            WhatsAppMessage.objects.filter(
                organization=transaction.organization,
                external_id=external_id,
            ).order_by("-created_at")[:5]
        )
        already_delivered = next((m for m in existing_msgs if m.status in ("sent", "delivered", "read")), None)
        if not force:
            if already_delivered or tx_bill_sent:
                return {
                    "message_id": str(already_delivered.id) if already_delivered else None,
                    "provider_message_id": already_delivered.provider_message_id if already_delivered else "",
                    "status": "already_sent",
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "filename": filename,
                    "phone_number": phone,
                }
            in_progress = next(
                (
                    m
                    for m in existing_msgs
                    if m.status == "processing" and m.updated_at >= timezone.now() - timedelta(seconds=60)
                ),
                None,
            )
            if in_progress:
                return {
                    "message_id": str(in_progress.id),
                    "status": "processing",
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                }

        # Reuse the latest failed/queued/skipped record so retry_count only tracks actual failure retries,
        # while explicit force=True after already_delivered creates a fresh resend audit log record.
        reusable_msg = (
            next((m for m in existing_msgs if m.status in ("failed", "queued", "skipped")), None)
            if (not already_delivered or force)
            else None
        )
        if reusable_msg and already_delivered is None:
            msg = reusable_msg
            prior_status = msg.status
            msg.customer = customer
            msg.phone_number = phone
            msg.status = "processing"
            if prior_status == "failed":
                msg.retry_count = (msg.retry_count or 0) + 1
            msg.failed_at = None
            msg.failure_reason = ""
            msg.content = {
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "filename": filename,
                "caption": caption,
            }
            msg.metadata = {
                **(msg.metadata if isinstance(msg.metadata, dict) else {}),
                "invoice_id": str(invoice.id),
                "transaction_id": str(transaction.id),
                "invoice_number": invoice.invoice_number,
                "filename": filename,
                "mime_type": INVOICE_WHATSAPP_MIME_TYPE,
                "format_type": pdf_format,
                "trigger": trigger_mode,
            }
            msg.metadata.pop("skip_reason", None)
            msg.save(
                update_fields=[
                    "customer",
                    "phone_number",
                    "status",
                    "retry_count",
                    "failed_at",
                    "failure_reason",
                    "content",
                    "metadata",
                    "updated_at",
                ]
            )
        else:
            msg = WhatsAppMessage.objects.create(
                organization=transaction.organization,
                customer=customer,
                phone_number=phone,
                message_type="document",
                external_id=external_id,
                content={
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "filename": filename,
                    "caption": caption,
                },
                status="processing",
                metadata={
                    "invoice_id": str(invoice.id),
                    "transaction_id": str(transaction.id),
                    "invoice_number": invoice.invoice_number,
                    "filename": filename,
                    "mime_type": INVOICE_WHATSAPP_MIME_TYPE,
                    "format_type": pdf_format,
                    "trigger": trigger_mode,
                    "resend": bool(already_delivered and force),
                },
            )

    retryable = False
    try:
        # Always generate PDF via the existing canonical ReportLab invoice pipeline
        pdf_bytes = generate_invoice_pdf_bytes(invoice, format_type=pdf_format)
        if not isinstance(pdf_bytes, (bytes, bytearray)) or not bytes(pdf_bytes).startswith(b"%PDF-"):
            raise ValueError("Generated invoice payload is not a valid PDF document.")

        # Best-effort persist pdf_url on Invoice if still blank
        if not invoice.pdf_url:
            try:
                persisted_url = generate_invoice_pdf(invoice, format_type=pdf_format)
                if persisted_url and invoice.pdf_url != persisted_url:
                    invoice.pdf_url = persisted_url
                    invoice.save(update_fields=["pdf_url"])
            except Exception as pdf_save_exc:
                logger.warning("Non-fatal error persisting invoice PDF file: %s", sanitize_whatsapp_error(pdf_save_exc))

        upload_result = service.upload_media(
            bytes(pdf_bytes),
            filename=filename,
            mime_type=INVOICE_WHATSAPP_MIME_TYPE,
        )
        media_id = upload_result.get("id") if isinstance(upload_result, dict) else None
        if not media_id:
            err_msg, retryable = _extract_error_and_retryable(upload_result, service.access_token)
            msg.status = "failed"
            msg.failed_at = timezone.now()
            msg.failure_reason = err_msg
            msg.save(update_fields=["status", "failed_at", "failure_reason", "updated_at"])
            _publish_invoice_whatsapp_event(invoice, transaction, msg)
            return {
                "message_id": str(msg.id),
                "status": "failed",
                "error": err_msg,
                "retryable": retryable,
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
            }

        send_result = service.send_document(
            to=phone,
            media_id=media_id,
            filename=filename,
            caption=caption,
        )
        messages_list = send_result.get("messages") if isinstance(send_result, dict) else None
        wamid = messages_list[0].get("id") if isinstance(messages_list, list) and messages_list and isinstance(messages_list[0], dict) else ""

        if wamid:
            now = timezone.now()
            msg.provider_message_id = wamid
            msg.status = "sent"
            msg.sent_at = now
            msg.failed_at = None
            msg.failure_reason = ""
            msg.metadata = {
                **(msg.metadata if isinstance(msg.metadata, dict) else {}),
                "media_id": media_id,
                "sent_via": "document_media_id",
            }
            msg.save(update_fields=["provider_message_id", "status", "sent_at", "failed_at", "failure_reason", "metadata", "updated_at"])

            transaction.bill_sent = True
            transaction.bill_sent_at = now
            transaction.save(update_fields=["bill_sent", "bill_sent_at"])

            if customer is not None:
                try:
                    CustomerTimeline.objects.create(
                        organization=transaction.organization,
                        customer=customer,
                        event_type="bill_sent",
                        reference_id=str(invoice.id),
                        metadata={
                            "invoice_id": str(invoice.id),
                            "invoice_number": invoice.invoice_number,
                            "provider_message_id": wamid,
                            "filename": filename,
                            "phone": phone,
                        },
                    )
                except Exception as tl_exc:
                    logger.warning("Failed to record CustomerTimeline bill_sent event: %s", sanitize_whatsapp_error(tl_exc))

            _publish_invoice_whatsapp_event(invoice, transaction, msg)
            return {
                "message_id": str(msg.id),
                "provider_message_id": wamid,
                "media_id": media_id,
                "status": "sent",
                "filename": filename,
                "mime_type": INVOICE_WHATSAPP_MIME_TYPE,
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "phone_number": phone,
            }

        err_msg, retryable = _extract_error_and_retryable(send_result, service.access_token)
        msg.status = "failed"
        msg.failed_at = timezone.now()
        msg.failure_reason = err_msg
        msg.metadata = {**(msg.metadata if isinstance(msg.metadata, dict) else {}), "media_id": media_id}
        msg.save(update_fields=["status", "failed_at", "failure_reason", "metadata", "updated_at"])
        _publish_invoice_whatsapp_event(invoice, transaction, msg)
        return {
            "message_id": str(msg.id),
            "status": "failed",
            "error": err_msg,
            "retryable": retryable,
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
        }

    except requests.RequestException as req_exc:
        err_msg = sanitize_whatsapp_error(req_exc, service.access_token)
        logger.error("WhatsApp network error for invoice %s: %s", invoice.invoice_number, err_msg)
        msg.status = "failed"
        msg.failed_at = timezone.now()
        msg.failure_reason = err_msg
        msg.save(update_fields=["status", "failed_at", "failure_reason", "updated_at"])
        _publish_invoice_whatsapp_event(invoice, transaction, msg)
        return {
            "message_id": str(msg.id),
            "status": "failed",
            "error": err_msg,
            "retryable": True,
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
        }
    except Exception as exc:
        err_msg = sanitize_whatsapp_error(exc, service.access_token)
        logger.error("WhatsApp PDF delivery error for invoice %s: %s", invoice.invoice_number, err_msg)
        msg.status = "failed"
        msg.failed_at = timezone.now()
        msg.failure_reason = err_msg
        msg.save(update_fields=["status", "failed_at", "failure_reason", "updated_at"])
        _publish_invoice_whatsapp_event(invoice, transaction, msg)
        return {
            "message_id": str(msg.id),
            "status": "failed",
            "error": err_msg,
            "retryable": False,
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
        }


@shared_task(bind=True, name="apps.whatsapp.tasks.send_digital_bill_task", max_retries=2, default_retry_delay=15)
def send_digital_bill_task(self, transaction_id, force=False):
    result = deliver_invoice_pdf_via_whatsapp(transaction_id=transaction_id, force=force)
    if (
        result.get("status") == "failed"
        and result.get("retryable")
        and not getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False)
        and not getattr(self.request, "is_eager", False)
        and self.request.retries < self.max_retries
    ):
        raise self.retry(exc=RuntimeError(result.get("error", "Transient WhatsApp delivery error")))
    return result


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


def _should_run_sync_in_tests() -> bool:
    explicit = getattr(settings, "WHATSAPP_FORCE_SYNC_IN_EAGER", None)
    if explicit is not None:
        return bool(explicit)
    return "pytest" in sys.modules or (len(sys.argv) > 1 and sys.argv[1] == "test")


def _schedule_after_commit(callback):
    """
    Execute callback only after enclosing DB transaction commits cleanly.
    In Django TestCase/APITestCase (which wraps each test in an un-committed root Atomic
    block with savepoint=False), run immediately unless an explicit inner savepoint transaction
    is still active, preserving both TransactionTestCase rollback safety and APITestCase tests.
    """
    conn = db_transaction.get_connection()
    if not conn.in_atomic_block:
        return callback()

    if _should_run_sync_in_tests():
        has_real_active_tx = any(
            not getattr(block, "_from_testcase", False)
            for block in getattr(conn, "atomic_blocks", [])
        )
        if not has_real_active_tx:
            return callback()

    db_transaction.on_commit(callback)
    return {"status": "scheduled"}


def _evaluate_auto_whatsapp_preconditions(transaction, wa_config_row=None, business_config=None):
    """
    Returns tuple: (disposition, reason, normalized_phone)
    where disposition is one of: 'queued', 'skipped', 'noop'.
    """
    from apps.billing.models import BusinessConfig
    from apps.whatsapp.models import WhatsAppConfig

    if business_config is None:
        business_config = BusinessConfig.objects.filter(organization=transaction.organization).first()
    if wa_config_row is None:
        wa_config_row = (
            WhatsAppConfig.objects.filter(organization=transaction.organization)
            .order_by("-updated_at")
            .first()
        )

    auto_send_enabled = bool(business_config and business_config.auto_send_whatsapp)
    if not auto_send_enabled:
        if wa_config_row is not None:
            return ("skipped", "Automatic WhatsApp invoice sending is disabled in Settings.", "")
        return ("noop", "", "")

    if wa_config_row is not None and not wa_config_row.is_active:
        return ("skipped", "WhatsApp integration is disabled in Settings.", "")

    if WhatsAppService.for_organization(transaction.organization) is None:
        return ("skipped", "WhatsApp not configured", "")

    customer = transaction.customer
    if customer is not None and not customer.whatsapp_opt_in:
        return ("skipped", "Customer opted out of WhatsApp", "")

    raw_phone = customer.phone if customer is not None else ""
    is_walkin_placeholder = (
        (customer is None)
        or bool(getattr(customer, "is_walk_in", False))
        or str(raw_phone or "").strip().lower().startswith("walkin-")
    )
    phone = format_whatsapp_phone(raw_phone)
    if not phone:
        reason = (
            "Walk-in customer has no valid WhatsApp phone number."
            if is_walkin_placeholder
            else "Customer phone number is missing or invalid for WhatsApp"
        )
        return ("skipped", reason, "")

    return ("queued", "", phone)


def _run_post_sale_background_worker(transaction_id: str, *, dispatch_whatsapp: bool = True):
    """
    Execute post-sale PDF caching and WhatsApp document delivery outside the HTTP request
    cycle so slow Meta Cloud API calls or errors never block or fail checkout.
    """
    close_old_connections()
    try:
        time.sleep(0.05)
        from apps.invoices.tasks import ensure_invoice_for_transaction
        from apps.transactions.models import Transaction

        tx = (
            Transaction.objects.select_related("organization", "store", "customer")
            .prefetch_related("items")
            .filter(id=transaction_id)
            .first()
        )
        if tx is None or tx.status != "completed":
            return

        ensure_invoice_for_transaction(tx, generate_file=True)
        if dispatch_whatsapp:
            deliver_invoice_pdf_via_whatsapp(
                transaction=tx,
                force=False,
                record_failure=False,
            )
    except Exception as exc:
        safe_err = sanitize_whatsapp_error(exc)
        logger.exception("Background post-sale WhatsApp worker failed for tx %s: %s", transaction_id, safe_err)
        try:
            from apps.invoices.models import Invoice
            from apps.transactions.models import Transaction
            from apps.whatsapp.models import WhatsAppMessage

            tx = Transaction.objects.select_related("organization", "store", "customer").filter(id=transaction_id).first()
            inv = Invoice.objects.filter(transaction=tx).first() if tx else None
            if tx and inv:
                msg = (
                    WhatsAppMessage.objects.filter(organization=tx.organization, external_id=f"invoice:{inv.id}")
                    .order_by("-created_at")
                    .first()
                )
                if msg and msg.status in ("queued", "processing"):
                    msg.status = "failed"
                    msg.failed_at = timezone.now()
                    msg.failure_reason = safe_err
                    msg.save(update_fields=["status", "failed_at", "failure_reason", "updated_at"])
                    _publish_invoice_whatsapp_event(inv, tx, msg)
        except Exception:
            pass
    finally:
        close_old_connections()


def _spawn_post_sale_background_thread(transaction_id: str, *, dispatch_whatsapp: bool = True):
    thread = threading.Thread(
        target=_run_post_sale_background_worker,
        args=(str(transaction_id),),
        kwargs={"dispatch_whatsapp": dispatch_whatsapp},
        name=f"whatsapp-invoice-{str(transaction_id)[:8]}",
        daemon=True,
    )
    thread.start()


def _dispatch_pdf_only(transaction_id: str):
    from apps.invoices.tasks import generate_invoice_task

    if not getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        try:
            generate_invoice_task.delay(str(transaction_id), dispatch_whatsapp=False)
            return
        except Exception as exc:
            logger.warning("Celery PDF task unavailable, running background PDF thread: %s", sanitize_whatsapp_error(exc))
            _spawn_post_sale_background_thread(str(transaction_id), dispatch_whatsapp=False)
            return

    if _should_run_sync_in_tests():
        generate_invoice_task.delay(str(transaction_id), dispatch_whatsapp=False)
    else:
        _spawn_post_sale_background_thread(str(transaction_id), dispatch_whatsapp=False)


def prepare_and_dispatch_post_sale_invoice_whatsapp(transaction_id: str, *, dispatch_whatsapp: bool = True):
    """
    Post-commit orchestrator invoked after every completed purchase / quotation conversion:
    1. Guarantees only completed committed transactions trigger delivery.
    2. Persists immediate non-blocking 'queued' or explicit 'skipped' state for UI & audit trail.
    3. Ensures idempotency across retries, reloads, and duplicate triggers.
    4. Runs PDF generation + Meta WhatsApp Cloud API delivery asynchronously when not in eager sync test mode.
    """
    def _execute():
        from apps.invoices.models import Invoice
        from apps.invoices.tasks import ensure_invoice_for_transaction, generate_invoice_task
        from apps.transactions.models import Transaction
        from apps.whatsapp.models import WhatsAppMessage

        tx = (
            Transaction.objects.select_related("organization", "store", "customer")
            .prefetch_related("items")
            .filter(id=transaction_id)
            .first()
        )
        if tx is None or tx.status != "completed":
            return {"status": "skipped", "error": "Transaction not completed"}

        invoice = Invoice.objects.filter(transaction=tx).first()
        if invoice is None:
            invoice = ensure_invoice_for_transaction(tx, generate_file=False)

        if not dispatch_whatsapp:
            _dispatch_pdf_only(str(tx.id))
            return {"status": "pdf_dispatched", "invoice_id": str(invoice.id)}

        pdf_format = getattr(invoice, "template_format", "a4") or "a4"
        if pdf_format not in ("a4", "thermal", "receipt"):
            pdf_format = "a4"
        filename = build_invoice_pdf_filename(invoice.invoice_number, str(invoice.id))
        caption = INVOICE_WHATSAPP_CAPTION
        external_id = f"invoice:{invoice.id}"

        disposition, reason, phone = _evaluate_auto_whatsapp_preconditions(tx)

        action_to_dispatch = None
        result_payload = {"status": disposition, "invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number}

        with db_transaction.atomic():
            Invoice.objects.select_for_update().filter(id=invoice.id).first()
            tx_bill_sent = (
                Transaction.objects.filter(id=tx.id).values_list("bill_sent", flat=True).first()
            )
            existing_msgs = list(
                WhatsAppMessage.objects.filter(
                    organization=tx.organization,
                    external_id=external_id,
                ).order_by("-created_at")[:5]
            )
            already_delivered = next((m for m in existing_msgs if m.status in ("sent", "delivered", "read")), None)
            if already_delivered or tx_bill_sent:
                action_to_dispatch = "pdf_only"
                result_payload = {
                    "status": "already_sent",
                    "message_id": str(already_delivered.id) if already_delivered else None,
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                }
            else:
                in_flight = next(
                    (
                        m
                        for m in existing_msgs
                        if m.status in ("queued", "processing") and m.updated_at >= timezone.now() - timedelta(seconds=60)
                    ),
                    None,
                )
                if in_flight:
                    result_payload = {
                        "status": in_flight.status,
                        "message_id": str(in_flight.id),
                        "invoice_id": str(invoice.id),
                        "invoice_number": invoice.invoice_number,
                    }
                elif disposition == "noop":
                    action_to_dispatch = "pdf_only"
                elif disposition == "skipped":
                    msg = _record_non_sent_invoice_message(
                        invoice=invoice,
                        transaction=tx,
                        customer=tx.customer,
                        raw_phone=tx.customer.phone if tx.customer else "",
                        filename=filename,
                        caption=caption,
                        pdf_format=pdf_format,
                        target_status="skipped",
                        reason=reason,
                        trigger="automatic",
                    )
                    action_to_dispatch = "pdf_only"
                    result_payload = {
                        "status": "skipped",
                        "message_id": str(msg.id),
                        "error": reason,
                        "skip_reason": reason,
                        "invoice_id": str(invoice.id),
                        "invoice_number": invoice.invoice_number,
                    }
                else:
                    msg = _record_non_sent_invoice_message(
                        invoice=invoice,
                        transaction=tx,
                        customer=tx.customer,
                        raw_phone=phone,
                        filename=filename,
                        caption=caption,
                        pdf_format=pdf_format,
                        target_status="queued",
                        reason="",
                        trigger="automatic",
                    )
                    action_to_dispatch = "whatsapp"
                    result_payload = {
                        "status": "queued",
                        "message_id": str(msg.id),
                        "phone_number": phone,
                        "filename": filename,
                        "invoice_id": str(invoice.id),
                        "invoice_number": invoice.invoice_number,
                    }

        if action_to_dispatch == "pdf_only":
            _dispatch_pdf_only(str(tx.id))
        elif action_to_dispatch == "whatsapp":
            if not getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
                try:
                    generate_invoice_task.delay(str(tx.id), dispatch_whatsapp=True)
                except Exception as exc:
                    logger.warning(
                        "Celery broker unavailable for WhatsApp auto-send, falling back to background thread: %s",
                        sanitize_whatsapp_error(exc),
                    )
                    _spawn_post_sale_background_thread(str(tx.id), dispatch_whatsapp=True)
            elif _should_run_sync_in_tests():
                generate_invoice_task.delay(str(tx.id), dispatch_whatsapp=True)
            else:
                _spawn_post_sale_background_thread(str(tx.id), dispatch_whatsapp=True)

        return result_payload

    try:
        return _schedule_after_commit(_execute)
    except Exception as exc:
        logger.warning(
            "Post-sale WhatsApp scheduling failed cleanly for tx %s: %s",
            transaction_id,
            sanitize_whatsapp_error(exc),
        )
        return {"status": "failed", "error": sanitize_whatsapp_error(exc)}
