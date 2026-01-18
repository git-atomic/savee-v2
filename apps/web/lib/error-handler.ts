/**
 * Enterprise-level error handling utilities
 */

export interface AppError {
  message: string;
  code?: string;
  statusCode?: number;
  retryable?: boolean;
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public retryable = true
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    // Network errors are usually retryable
    if (error.name === "AbortError" || error.name === "NetworkError") {
      return false; // Aborted requests shouldn't be retried
    }

    // 5xx errors are retryable, 4xx (except 429) are not
    if (error.message.includes("500") || error.message.includes("502") || error.message.includes("503")) {
      return true;
    }

    if (error.message.includes("429")) {
      return true; // Rate limited, but retryable
    }
  }

  return false;
}

export function formatError(error: unknown): AppError {
  if (error instanceof NetworkError) {
    return {
      message: error.message,
      code: error.name,
      statusCode: error.statusCode,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.name,
      retryable: isRetryableError(error),
    };
  }

  return {
    message: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
    retryable: false,
  };
}
