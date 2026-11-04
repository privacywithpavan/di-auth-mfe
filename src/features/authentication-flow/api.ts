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
  const result = (await response.json()) as T & { message?: string };
  if (!response.ok)
    throw new Error(result.message ?? "Authentication could not continue.");
  return result;
}
