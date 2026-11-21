import { describe, expect, it } from "vitest";
import { nextBrowseOffset } from "./query";

describe("infinite browse paging", () => {
  it("advances by what the server returned, even when local filters kept fewer items", () => {
    // page 1 of 30 returned 30, 12 survived a device-side filter: next page is offset 30, not 12
    expect(nextBrowseOffset({ hasMore: true, offset: 0, next: 30 })).toBe(30);
    expect(nextBrowseOffset({ hasMore: true, offset: 30, next: 60 })).toBe(60);
  });
  it("stops when the server has no more or made no progress", () => {
    expect(nextBrowseOffset({ hasMore: false, offset: 30, next: 60 })).toBeUndefined();
    expect(nextBrowseOffset({ hasMore: true, offset: 30, next: 30 })).toBeUndefined();
  });
});
