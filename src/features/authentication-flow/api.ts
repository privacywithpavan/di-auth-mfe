export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

export async function api<T>(
  path: string,
  body: object,
  csrfToken?: string,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as T & {
    message?: string;
    code?: string;
  };
  if (!response.ok)
    throw new AuthApiError(
      response.status,
      result.code,
      result.message ?? "Authentication could not continue.",
    );
  return result;
}
