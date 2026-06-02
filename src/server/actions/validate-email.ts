"use server";

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export async function validateEmail(
  email: string,
): Promise<{ isValid: boolean; isFraud: boolean } | { error: string }> {
  if (!email) return { error: "Email is required" };
  if (!EMAIL_REGEX.test(email)) return { error: "Invalid email format" };
  return { isValid: true, isFraud: false };
}
