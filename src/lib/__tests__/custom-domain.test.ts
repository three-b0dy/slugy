// @ts-nocheck
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { NextRequest } from "next/server";

const mockGetLink = mock(async () => ({ success: true, url: null }));

mock.module("@/lib/middleware/get-link", () => ({
  getLink: mockGetLink,
}));

const { handleCustomDomainRequest } =
  await import("../middleware/custom-domain");

function makeRequest(pathname = "/abc", cookie?: string) {
  return new NextRequest(`https://custom.example.com${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("handleCustomDomainRequest", () => {
  beforeEach(() => {
    mockGetLink.mockClear();
  });

  it("rewrites password-protected custom-domain links to the slug page", async () => {
    mockGetLink.mockResolvedValue({
      success: true,
      url: null,
      requiresPassword: true,
    });

    const response = await handleCustomDomainRequest(
      makeRequest("/abc"),
      "custom.example.com",
    );

    expect(response).not.toBeNull();
    expect(response?.headers.get("x-middleware-rewrite")).toBe(
      "https://custom.example.com/abc",
    );
  });

  it("rewrites same-origin not-found results to /not-found", async () => {
    mockGetLink.mockResolvedValue({
      success: true,
      url: "https://custom.example.com/?status=not-found",
    });

    const response = await handleCustomDomainRequest(
      makeRequest("/missing"),
      "custom.example.com",
    );

    expect(response).not.toBeNull();
    expect(response?.headers.get("x-middleware-rewrite")).toBe(
      "https://custom.example.com/not-found",
    );
  });

  it("rewrites same-origin expired results to /?status=expired", async () => {
    mockGetLink.mockResolvedValue({
      success: true,
      url: "https://custom.example.com/?status=expired",
    });

    const response = await handleCustomDomainRequest(
      makeRequest("/expired-slug"),
      "custom.example.com",
    );

    expect(response).not.toBeNull();
    expect(response?.headers.get("x-middleware-rewrite")).toBe(
      "https://custom.example.com/?status=expired",
    );
  });
});
