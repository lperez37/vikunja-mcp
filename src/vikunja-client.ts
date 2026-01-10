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
   * Make an authenticated request to the Vikunja API
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
  }

  // Convenience methods
  async get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<ApiResponse<T>> {
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
