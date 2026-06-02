import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

type SendEmailPayload = Parameters<Resend["emails"]["send"]>[0];

export const resend = {
  emails: {
    send(payload: SendEmailPayload) {
      return getResendClient().emails.send(payload);
    },
  },
};
