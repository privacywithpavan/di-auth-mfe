import { handlePasskeyEnrollment } from "@/server/auth/passkey-enrollment";

export async function POST(request: Request) {
  return handlePasskeyEnrollment(request, "verify");
}
