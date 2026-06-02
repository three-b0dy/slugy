import DymoAPI from "dymo-api";

let dymoClient: DymoAPI | null = null;

function getDymoClient() {
  if (!process.env.DYMO_API_KEY) {
    throw new Error("Missing DYMO_API_KEY");
  }

  dymoClient ??= new DymoAPI({
    apiKey: process.env.DYMO_API_KEY,
  });
  return dymoClient;
}

type ValidDataPayload = Parameters<DymoAPI["isValidData"]>[0];

export const dymo = {
  isValidData(payload: ValidDataPayload) {
    return getDymoClient().isValidData(payload);
  },
};
