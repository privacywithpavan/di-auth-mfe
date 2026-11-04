export type MfaMethod = "EMAIL_OTP" | "SMS_OTP";
export type NextAction =
  | "ENTER_PASSWORD"
  | "SELECT_MFA_METHOD"
  | "ENTER_OTP"
  | "ISSUE_SESSION"
  | "COMPLETE"
  | "CANCELLED";

export interface AuthenticationContext {
  contextId: string;
  clientId: string;
  status: "ACTIVE" | "AUTHENTICATED" | "CONSUMED" | "CANCELLED" | "EXPIRED";
  nextAction: NextAction;
  methods?: MfaMethod[];
  expiresAt: string;
}

export interface MfaChallenge {
  challengeId: string;
  method: MfaMethod;
  maskedDestination: string;
  expiresAt: string;
  debugCode?: string;
}

export interface SessionResponse {
  sessionToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export class IamClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly traceId?: string,
  ) {
    super(message);
    this.name = "IamClientError";
  }
}

// Next's proxy and route handlers can load separate module copies while sharing
// the cached IAM client. Error identity must survive that module boundary.
export function isIamClientError(error: unknown): error is IamClientError {
  return (
    error instanceof Error &&
    error.name === "IamClientError" &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status <= 599 &&
    "code" in error &&
    typeof error.code === "string"
  );
}

export interface IamClientOptions {
  baseUrl: string;
  configurationUrl?: string;
  subscriberId: string;
  subscriberSecret: string;
  fetch?: typeof globalThis.fetch;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

export class IamClient {
  private readonly fetchImpl: typeof globalThis.fetch;
  private token?: CachedToken;

  constructor(private readonly options: IamClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async getClientConfiguration(clientId: string): Promise<unknown> {
    return this.request(
      `/internal/configuration/clients/${encodeURIComponent(clientId)}`,
      { method: "GET" },
      this.options.configurationUrl,
    );
  }

  async createContext(
    clientId: string,
    idempotencyKey: string,
  ): Promise<AuthenticationContext> {
    return this.request("/internal/authentication/contexts", {
      method: "POST",
      body: JSON.stringify({ clientId }),
      idempotencyKey,
    });
  }

  async getContext(contextId: string): Promise<AuthenticationContext> {
    return this.request(`/internal/authentication/contexts/${contextId}`, {
      method: "GET",
    });
  }

  async verifyPassword(
    contextId: string,
    input: { username: string; password: string },
    idempotencyKey: string,
  ): Promise<AuthenticationContext> {
    return this.request(
      `/internal/authentication/contexts/${contextId}/password`,
      {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey,
      },
    );
  }

  async createMfaChallenge(
    contextId: string,
    method: MfaMethod,
    idempotencyKey: string,
  ): Promise<MfaChallenge> {
    return this.request(
      `/internal/authentication/contexts/${contextId}/mfa/challenges`,
      {
        method: "POST",
        body: JSON.stringify({ method }),
        idempotencyKey,
      },
    );
  }

  async verifyMfa(
    contextId: string,
    input: { challengeId: string; code: string },
    idempotencyKey: string,
  ): Promise<AuthenticationContext> {
    return this.request(
      `/internal/authentication/contexts/${contextId}/mfa/verifications`,
      {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey,
      },
    );
  }

  async createSession(
    contextId: string,
    idempotencyKey: string,
  ): Promise<SessionResponse> {
    return this.request(
      `/internal/authentication/contexts/${contextId}/sessions`,
      {
        method: "POST",
        idempotencyKey,
      },
    );
  }

  async registration(
    contextId: string,
    action: string,
    input: object,
    idempotencyKey: string,
  ): Promise<{
    nextAction?: string;
    maskedDestination?: string;
    publicKey?: unknown;
  }> {
    return this.request(
      `/internal/authentication/contexts/${contextId}/registration/${action}`,
      {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey,
      },
    );
  }

  async passkey(
    contextId: string,
    action: "options" | "verify",
    input: object,
    idempotencyKey: string,
  ): Promise<{ publicKey?: unknown }> {
    return this.request(
      `/internal/authentication/contexts/${contextId}/passkey/${action}`,
      {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey,
      },
    );
  }

  async cancelContext(
    contextId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.request(
      `/internal/authentication/contexts/${contextId}/cancel`,
      {
        method: "POST",
        idempotencyKey,
        expectEmpty: true,
      },
    );
  }

  private async serviceToken(): Promise<string> {
    if (this.token && this.token.expiresAt - Date.now() > 10_000)
      return this.token.value;

    const response = await this.fetchImpl(
      `${this.options.baseUrl}/oauth/subscriber/token`,
      {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscriberId: this.options.subscriberId,
          subscriberSecret: this.options.subscriberSecret,
        }),
      },
    );
    if (!response.ok) await this.throwError(response);
    const result = (await response.json()) as {
      accessToken: string;
      expiresIn: number;
    };
    this.token = {
      value: result.accessToken,
      expiresAt: Date.now() + result.expiresIn * 1000,
    };
    return result.accessToken;
  }

  private async request<T>(
    path: string,
    init: {
      method: string;
      body?: string;
      idempotencyKey?: string;
      expectEmpty?: boolean;
    },
    baseUrl = this.options.baseUrl,
  ): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.serviceToken()}`,
      accept: "application/json",
    };
    if (init.body) headers["content-type"] = "application/json";
    if (init.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;

    const response = await this.fetchImpl(`${baseUrl}${path}`, {
      method: init.method,
      headers,
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      if (response.status === 401) this.token = undefined;
      await this.throwError(response);
    }
    if (init.expectEmpty || response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private async throwError(response: Response): Promise<never> {
    const fallback = {
      code: "IAM_UNAVAILABLE",
      message: `IAM request failed (${response.status})`,
    };
    const body = (await response.json().catch(() => fallback)) as {
      code?: string;
      message?: string;
      traceId?: string;
    };
    throw new IamClientError(
      response.status,
      body.code ?? fallback.code,
      body.message ?? fallback.message,
      body.traceId,
    );
  }
}
