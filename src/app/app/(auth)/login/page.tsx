import { LoginForm } from "@/components/web/_auth/login-form";
import { isRegistrationAllowed } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <LoginForm
      registrationEnabled={isRegistrationAllowed()}
      registrationDisabled={params.error === "registration_disabled"}
    />
  );
}
