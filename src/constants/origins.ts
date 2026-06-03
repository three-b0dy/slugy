const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "slugy.co";
const appUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${appDomain}`;
const appSubUrl = process.env.NEXT_PUBLIC_APP_URL || `https://app.${appDomain}`;
const authUrl = process.env.BETTER_AUTH_URL;

export const origins = [appUrl, appSubUrl, ...(authUrl ? [authUrl] : [])];
