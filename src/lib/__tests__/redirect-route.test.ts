// @ts-nocheck
import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";

const mockFindFirst = mock(async () => ({
  id: "link-1",
  url: "https://example.com/target",
  password: "secret",
  expiresAt: null,
  expirationUrl: null,
  domain: "custom.example.com",
}));

mock.module("@/server/db", () => ({
  db: { link: { findFirst: mockFindFirst } },
}));

const { POST } = await import("../../app/api/redirect/[slug]/route");

function makeRequest(host: string) {
  return new Request("https://custom.example.com/api/redirect/abc", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host,
    },
    body: JSON.stringify({ password: "secret" }),
  });
}

describe("redirect password verification route", () => {
  beforeEach(() => {
    mockFindFirst.mockClear();
    process.env.NEXT_PUBLIC_APP_DOMAIN = "slugy.co";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_DOMAIN;
  });

  it("infers the active custom domain from the host header when body.domain is absent", async () => {
    const request = makeRequest("custom.example.com");

    const response = await POST(request as never, {
      params: Promise.resolve({ slug: "abc" }),
    });

    expect(response.status).toBe(200);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        slug: "abc",
        domain: "custom.example.com",
        isArchived: false,
      },
      select: {
        id: true,
        url: true,
        password: true,
        expiresAt: true,
        expirationUrl: true,
        domain: true,
      },
    });
  });

  it("keeps the system-domain fallback for localhost hosts", async () => {
    const request = makeRequest("localhost:3000");

    await POST(request as never, {
      params: Promise.resolve({ slug: "abc" }),
    });

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        slug: "abc",
        domain: "slugy.co",
        isArchived: false,
      },
      select: {
        id: true,
        url: true,
        password: true,
        expiresAt: true,
        expirationUrl: true,
        domain: true,
      },
    });
  });
});
