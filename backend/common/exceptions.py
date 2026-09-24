from rest_framework.exceptions import APIException


class TenantAccessDenied(APIException):
    status_code = 403
    default_detail = "You do not have access to this organization's data."


class TransactionIdempotentError(APIException):
    status_code = 409
    default_detail = "Transaction with this external ID already exists."


class InvalidIntegrationsPayload(APIException):
    status_code = 400
    default_detail = "Invalid integration payload."


class QuotaExceeded(APIException):
    status_code = 429
    default_detail = "Your plan quota has been exceeded."
