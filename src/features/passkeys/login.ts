type AssertionOptions = Omit<
  PublicKeyCredentialRequestOptions,
  "challenge" | "allowCredentials"
> & {
  challenge: string;
  allowCredentials?: {
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }[];
};
function decode(value: string): ArrayBuffer {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (char) => char.charCodeAt(0),
  ).buffer;
}
function encode(value: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export async function signInWithPasskey(
  init: { contextId: string; csrfToken: string },
  conditional: boolean,
  signal: AbortSignal,
  email?: string,
  onVerifying?: () => void,
) {
  if (!window.PublicKeyCredential || !navigator.credentials?.get)
    throw new Error(
      "This browser does not support passkeys. Use a browser that supports passkeys to sign in.",
    );
  const request = async (action: string, body: object) => {
    const response = await fetch(`/api/auth/passkey/${action}`, {
      method: "POST",
      credentials: "same-origin",
      signal,
      headers: {
        "content-type": "application/json",
        "x-csrf-token": init.csrfToken,
      },
      body: JSON.stringify({ ...body, contextId: init.contextId, conditional }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message ?? "Could not verify your passkey.");
    return result;
  };
  const { publicKey } = (await request("options", { email })) as {
    publicKey: AssertionOptions;
  };
  try {
    const credential = (await navigator.credentials.get({
      signal,
      mediation: conditional ? "conditional" : "required",
      publicKey: {
        ...publicKey,
        challenge: decode(publicKey.challenge),
        allowCredentials: publicKey.allowCredentials?.map((entry) => ({
          ...entry,
          id: decode(entry.id),
        })),
      },
    })) as PublicKeyCredential | null;
    signal.throwIfAborted();
    if (!credential)
      throw new Error("No passkey was selected. Please try again.");
    const response = credential.response as AuthenticatorAssertionResponse;
    onVerifying?.();
    await request("verify", {
      credential: {
        id: credential.id,
        rawId: encode(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: encode(response.authenticatorData),
          clientDataJSON: encode(response.clientDataJSON),
          signature: encode(response.signature),
          userHandle: response.userHandle ? encode(response.userHandle) : null,
        },
        extensions: credential.getClientExtensionResults(),
        clientExtensionResults: credential.getClientExtensionResults(),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError")
      throw new Error(
        "Passkey sign-in was cancelled or timed out. Select Continue to try again.",
      );
    throw error;
  }
}
