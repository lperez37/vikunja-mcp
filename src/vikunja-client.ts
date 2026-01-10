/**
 * Vikunja API Client
 * HTTP wrapper for the Vikunja REST API
 */

export interface PaginationInfo {
  page: number;
  perPage: number;
  totalPages: number | null;
  resultCount: number | null;
}

export interface ApiResponse<T> {
  data: T;
  pagination?: PaginationInfo;
}

export interface ApiError {
  code: number;
  message: string;
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 4000,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 * - Network errors (fetch throws)
 * - 5xx server errors
 * - 429 Too Many Requests
 */
function isRetryableError(error: unknown, status?: number): boolean {
  // Network errors (fetch throws an error)
  if (error instanceof TypeError) {
    return true;
  }

  // Server errors (5xx) and rate limiting (429)
  if (status !== undefined) {
    return status >= 500 || status === 429;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function getRetryDelay(attempt: number): number {
  const baseDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  // Add jitter (0-25% of base delay)
  const jitter = baseDelay * 0.25 * Math.random();
  return Math.min(baseDelay + jitter, RETRY_CONFIG.maxDelayMs);
}

export class VikunjaClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    const baseUrl = process.env.VIKUNJA_URL;
    const token = process.env.VIKUNJA_API_TOKEN;

    if (!baseUrl) {
      throw new Error("VIKUNJA_URL environment variable is required");
    }
    if (!token) {
      throw new Error("VIKUNJA_API_TOKEN environment variable is required");
    }

    // Remove trailing slash if present
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  /**
   * Make an authenticated request to the Vikunja API with retry logic
   */
  async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
    } = {}
  ): Promise<ApiResponse<T>> {
    // Build URL with query parameters
    let url = `${this.baseUrl}/api/v1${path}`;

    if (options.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (options.body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const response = await fetch(url, fetchOptions);

        // Extract pagination headers
        const pagination: PaginationInfo = {
          page: 1,
          perPage: 50,
          totalPages: response.headers.get("x-pagination-total-pages")
            ? parseInt(response.headers.get("x-pagination-total-pages")!, 10)
            : null,
          resultCount: response.headers.get("x-pagination-result-count")
            ? parseInt(response.headers.get("x-pagination-result-count")!, 10)
            : null,
        };

        if (!response.ok) {
          // Check if this is a retryable error (5xx or 429)
          if (isRetryableError(null, response.status) && attempt < RETRY_CONFIG.maxRetries) {
            const delay = getRetryDelay(attempt);
            await sleep(delay);
            continue;
          }

          let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
          try {
            const errorBody = await response.json();
            if (errorBody.message) {
              errorMessage = errorBody.message;
            }
          } catch {
            // Ignore JSON parse errors for error responses
          }
          throw new Error(errorMessage);
        }

        // Handle empty responses (204 No Content, etc.)
        if (response.status === 204 || response.headers.get("content-length") === "0") {
          return { data: {} as T };
        }

        const data = await response.json();

        return {
          data,
          pagination: pagination.totalPages !== null ? pagination : undefined,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a retryable network error
        if (isRetryableError(error) && attempt < RETRY_CONFIG.maxRetries) {
          const delay = getRetryDelay(attempt);
          await sleep(delay);
          continue;
        }

        throw lastError;
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError ?? new Error("Request failed after retries");
  }

  // Convenience methods
  async get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, { query });
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, { body });
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, { body });
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path);
  }
}

// Singleton instance
let clientInstance: VikunjaClient | null = null;

export function getClient(): VikunjaClient {
  if (!clientInstance) {
    clientInstance = new VikunjaClient();
  }
  return clientInstance;
}
