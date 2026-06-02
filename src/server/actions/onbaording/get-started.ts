"use server";

export async function createFreeSubscription(userId: string) {
  void userId;

  return {
    success: false as const,
    message: "This onboarding flow is no longer available.",
  };
}
