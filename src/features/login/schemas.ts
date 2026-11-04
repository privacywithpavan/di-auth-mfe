import { z } from "zod";

export const identifierSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Enter your email or phone number")
    .refine(
      (value) =>
        z.email().safeParse(value).success ||
        /^\+?[0-9 ()-]{7,20}$/.test(value),
      "Enter a valid email or phone number",
    ),
});
export const passwordSchema = z.object({
  password: z.string().min(1, "Enter your password"),
});

export type IdentifierValues = z.infer<typeof identifierSchema>;
export type PasswordValues = z.infer<typeof passwordSchema>;
