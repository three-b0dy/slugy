import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockCreate = mock(async () => ({ id: "ev_1" }));

mock.module("@/server/db", () => ({
  db: { clickEvent: { create: mockCreate } },
}));

process.env.ANALYTICS_INGEST_SECRET = "test-secret-abc";

const { POST } = await import("../../app/api/analytics/ingest/route");

function makeRequest(
  body: BodyInit | unknown,
  secret: string | null = "test-secret-abc",
): Request {
  return new Request("http://localhost/api/analytics/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body:
      typeof body === "string" || body instanceof ReadableStream
        ? (body as BodyInit)
        : JSON.stringify(body),
  });
}

const validPayload = {
  linkId: "link_1",
  workspaceId: "ws_1",
  slug: "hello",
  url: "https://example.com",
  domain: "slugy.co",
  ip: "1.2.3.4",
  country: "us",
  city: "New York",
  continent: "na",
  device: "desktop",
  browser: "chrome",
  os: "windows",
  ua: "Mozilla/5.0",
  referer: "Direct",
  trigger: "qr",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  utmTerm: "",
  utmContent: "",
};

describe("POST /api/analytics/ingest", () => {
  beforeEach(() => {
    mockCreate.mockClear();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await POST(makeRequest(validPayload, null) as never);

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 401 when secret is wrong", async () => {
    const res = await POST(makeRequest(validPayload, "wrong-secret") as never);

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when body is missing required fields", async () => {
    const res = await POST(makeRequest({ linkId: "link_1" }) as never);

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("writes the click event and returns 201 on success", async () => {
    const res = await POST(makeRequest(validPayload) as never);

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    const callArg = mockCreate.mock.calls[0]?.[0] as {
      data: typeof validPayload;
    };

    expect(callArg.data.linkId).toBe("link_1");
    expect(callArg.data.workspaceId).toBe("ws_1");
  });
});
