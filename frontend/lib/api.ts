import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

/**
 * Dynamically resolves the API base URL.
 * Accounts for Next.js build-time NEXT_PUBLIC_* substitution and supports:
 * 1. Explicitly configured NEXT_PUBLIC_API_URL
 * 2. Automatic same-origin '/api/v1' route when deployed behind Nginx / reverse proxy
 * 3. Standalone local development fallback on localhost:8000
 */
export const getApiBaseUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== "") {
    let clean = envUrl.trim().replace(/\/+$/, "");

    if (typeof window !== "undefined") {
      const isLocalhostEnv = clean.includes("localhost") || clean.includes("127.0.0.1");
      const isBrowserOnRemote = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";

      // Detect if clean is a private container hostname without public domain dot (e.g. 'billmeet-backend')
      const hostPart = clean.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
      const isPrivateInternalHost = !hostPart.includes(".");
      const isMixedContent = window.location.protocol === "https:" && clean.startsWith("http://");

      // On remote deployments (e.g. Render), browser cannot reach private internal hosts,
      // insecure http endpoints from https, or localhost. Delegate to same-origin "/api/v1".
      if (isBrowserOnRemote && (isLocalhostEnv || isPrivateInternalHost || isMixedContent)) {
        return "/api/v1";
      }
    }

    if (!clean.startsWith("/") && !clean.startsWith("http://") && !clean.startsWith("https://")) {
      if (clean.includes("localhost") || clean.includes("127.0.0.1") || !clean.includes(".")) {
        clean = `http://${clean}`;
      } else {
        clean = `https://${clean}`;
      }
    }

    if (!clean.startsWith("/") && !clean.endsWith("/api/v1")) {
      clean = `${clean}/api/v1`;
    }

    return clean;
  }

  if (typeof window !== "undefined") {
    // When browser is running on port 3000 during standalone dev without Nginx
    if (window.location.port === "3000") {
      return `http://${window.location.hostname}:8000/api/v1`;
    }
    // Production client on same-origin Nginx or Next.js rewrites reverse proxy
    return "/api/v1";
  }

  const internalUrl = process.env.INTERNAL_API_URL || process.env.BACKEND_INTERNAL_URL;
  if (internalUrl && internalUrl.trim() !== "") {
    let cleanInternal = internalUrl.trim().replace(/\/+$/, "");
    if (!cleanInternal.startsWith("http://") && !cleanInternal.startsWith("https://")) {
      cleanInternal = `http://${cleanInternal}`;
    }
    if (!cleanInternal.endsWith("/api/v1")) {
      cleanInternal = `${cleanInternal}/api/v1`;
    }
    return cleanInternal;
  }

  return "http://localhost:8000/api/v1";
};

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.baseURL = getApiBaseUrl();
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const isAuthUrl =
      originalRequest.url?.includes("/auth/login/") ||
      originalRequest.url?.includes("/auth/register/") ||
      originalRequest.url?.includes("/auth/refresh/");

    if (error.response?.status === 401) {
      if (isAuthUrl || originalRequest._retry) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          if (
            window.location.pathname !== "/login" &&
            window.location.pathname !== "/register"
          ) {
            window.location.href = "/login";
          }
        }
        return Promise.reject(error);
      }

      if (typeof window === "undefined") {
        return Promise.reject(error);
      }

      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        localStorage.removeItem("access_token");
        if (
          window.location.pathname !== "/login" &&
          window.location.pathname !== "/register"
        ) {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(`${getApiBaseUrl()}/auth/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = data.access;
        localStorage.setItem("access_token", newAccessToken);
        if (data.refresh) {
          localStorage.setItem("refresh_token", data.refresh);
        }

        api.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }

        processQueue(null, newAccessToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        if (
          window.location.pathname !== "/login" &&
          window.location.pathname !== "/register"
        ) {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
