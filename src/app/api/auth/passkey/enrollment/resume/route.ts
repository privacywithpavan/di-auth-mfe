import { recoverPasskeySession } from "@/server/auth/passkey-enrollment";

export async function POST(request: Request) {
  return recoverPasskeySession(request);
}
