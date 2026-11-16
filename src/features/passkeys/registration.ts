type CreationOptions = Omit<
  PublicKeyCredentialCreationOptions,
  "challenge" | "user" | "excludeCredentials"
> & {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
  excludeCredentials?: {
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
export async function createPasskey(
  options: CreationOptions,
  alternative = "choose password",
) {
  if (!window.PublicKeyCredential || !navigator.credentials?.create)
    throw new Error(
      `This browser does not support passkeys. You can ${alternative}.`,
    );
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: decode(options.challenge),
        user: { ...options.user, id: decode(options.user.id) },
        excludeCredentials: options.excludeCredentials?.map((entry) => ({
          ...entry,
          id: decode(entry.id),
        })),
      },
    })) as PublicKeyCredential | null;
    if (!credential)
      throw new Error(
        `Passkey creation was cancelled. Try again or ${alternative}.`,
      );
    const response = credential.response as AuthenticatorAttestationResponse;
    return {
      id: credential.id,
      rawId: encode(credential.rawId),
      type: credential.type,
      response: {
        attestationObject: encode(response.attestationObject),
        clientDataJSON: encode(response.clientDataJSON),
        transports: response.getTransports(),
      },
      extensions: credential.getClientExtensionResults(),
      clientExtensionResults: credential.getClientExtensionResults(),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError")
      throw new Error(
        `Passkey creation was cancelled or timed out. Try again or ${alternative}.`,
      );
    throw error;
  }
}
export type { CreationOptions };
