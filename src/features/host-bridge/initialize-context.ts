export type HostBridge = { parentOrigin: string; state: string };
export interface InitializedContext extends HostBridge {
  contextId: string;
  csrfToken: string;
  methods: string[];
  mfaMethods: ("EMAIL_OTP" | "SMS_OTP")[];
  registrationEnabled: boolean;
}

export async function initializeContext(
  onBootstrap: (bridge: HostBridge) => void,
): Promise<InitializedContext> {
  const url = new URL(window.location.href);
  url.searchParams.delete("embedded");
  url.hash = "";
  if (window.location.href !== url.href)
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search,
    );
  const clientId = url.searchParams.get("clientId");
  const state = url.searchParams.get("state");
  if (
    window.parent === window ||
    !clientId ||
    !state ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(state)
  )
    throw new Error("Start sign in from ChatHost.");
  const bootstrap = await fetch(
    `/api/auth/bootstrap?clientId=${encodeURIComponent(clientId)}`,
    { cache: "no-store", credentials: "same-origin" },
  );
  if (!bootstrap.ok)
    throw new Error("This client cannot start inline authentication.");
  const { csrfToken, parentOrigin } = (await bootstrap.json()) as {
    csrfToken: string;
    parentOrigin: string;
  };
  onBootstrap({ parentOrigin, state });
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("message", receive);
      window.clearTimeout(timer);
    };
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== parentOrigin ||
        event.source !== window.parent ||
        event.data?.version !== 1 ||
        event.data.type !== "IAM_AUTH_CONFIRM" ||
        event.data.state !== state
      )
        return;
      cleanup();
      resolve();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("ChatHost did not confirm this request."));
    }, 10_000);
    window.addEventListener("message", receive);
    window.parent.postMessage(
      { type: "IAM_AUTH_READY", version: 1, state },
      parentOrigin,
    );
  });
  const response = await fetch("/api/auth/contexts", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify({ clientId, state }),
  });
  if (!response.ok)
    throw new Error(
      "This authentication request could not be initialized. Start again from ChatHost.",
    );
  return response.json() as Promise<InitializedContext>;
}
