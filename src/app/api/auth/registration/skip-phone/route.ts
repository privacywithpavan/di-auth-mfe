import { handleRegistrationAction } from "@/server/auth/registration";

export async function POST(request: Request) {
  return handleRegistrationAction(request, "skip-phone");
}
