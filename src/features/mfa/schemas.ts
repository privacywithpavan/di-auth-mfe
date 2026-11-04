import { z } from "zod";

export const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter all six digits"),
});

export type OtpValues = z.infer<typeof otpSchema>;
