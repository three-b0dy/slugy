import { redirect } from "next/navigation";
import { SignupForm } from "@/components/web/_auth/signup-form";
import { isRegistrationAllowed } from "@/lib/auth";

export default function SignupPage() {
  if (!isRegistrationAllowed()) {
    redirect("/login?error=registration_disabled");
  }

  return <SignupForm />;
}
