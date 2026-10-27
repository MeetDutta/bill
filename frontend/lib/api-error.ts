/**
 * Reusable API error parser for Django REST Framework and Axios responses.
 * Extracts field-level validation messages cleanly for user display.
 */
export function parseApiError(error: unknown, fallbackMessage = "An unexpected error occurred. Please try again."): string {
  if (!error) return fallbackMessage;

  // Handle Axios / HTTP response errors
  const err = error as {
    response?: {
      status?: number;
      data?: unknown;
    };
    message?: string;
  };

  const data = err.response?.data;
  const status = err.response?.status;

  if (data) {
    // 1. Direct string error
    if (typeof data === "string") {
      return data.length < 200 ? data : fallbackMessage;
    }

    // 2. Direct array error (e.g. DRF ValidationError(['msg']))
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (typeof first === "string") return first;
      if (typeof first === "object" && first !== null) {
        const item = first as Record<string, unknown>;
        if (typeof item.message === "string") return item.message;
        if (typeof item.detail === "string") return item.detail;
        if (typeof item.error === "string") return item.error;
      }
    }

    // 3. Object with common string keys
    if (typeof data === "object" && data !== null) {
      const record = data as Record<string, unknown>;

      if (typeof record.detail === "string") {
        return record.detail;
      }
      if (typeof record.error === "string") {
        return record.error;
      }
      if (typeof record.message === "string") {
        return record.message;
      }

      // 3. Field errors dictionary: e.g. { phone: ["..."], code: ["..."] }
      const fieldErrors: string[] = [];

      for (const [key, value] of Object.entries(record)) {
        if (key === "detail" || key === "error" || key === "message") continue;

        const fieldName = key === "non_field_errors" ? "" : formatFieldName(key);

        if (Array.isArray(value) && value.length > 0) {
          const firstMsg = String(value[0]);
          fieldErrors.push(fieldName ? `${fieldName}: ${firstMsg}` : firstMsg);
        } else if (typeof value === "string") {
          fieldErrors.push(fieldName ? `${fieldName}: ${value}` : value);
        }
      }

      if (fieldErrors.length > 0) {
        return fieldErrors.join(" • ");
      }
    }
  }

  // HTTP status fallbacks
  if (status === 401) return "Session expired or invalid credentials. Please log in again.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested resource was not found.";
  if (status && status >= 500) return "Server encountered an error. Please try again shortly.";

  if (err.message && !err.message.includes("status code")) {
    return err.message;
  }

  return fallbackMessage;
}

function formatFieldName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
