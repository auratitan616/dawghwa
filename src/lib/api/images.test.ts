import { describe, expect, it } from "vitest";
import { coverSrc } from "./images";

describe("coverSrc", () => {
  it("routes MangaDex covers through the API relay", () => {
    const u = "https://uploads.mangadex.org/covers/32d76d19-8a05-4db0-9fc2-e0b0648fe9d0/e90bdc47-c8b9-4df7-b2c0-17641b645ee1.jpg.512.jpg";
    expect(coverSrc(u)).toBe(`/api/image?url=${encodeURIComponent(u)}`);
  });
  it("leaves other images and empty values alone", () => {
    expect(coverSrc(undefined)).toBeUndefined();
    expect(coverSrc("")).toBe("");
    const a = "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105778-euxXZEIfDY2u.png";
    expect(coverSrc(a)).toBe(a);
    expect(coverSrc("https://cmdxd98sb0x3yprd.mangadex.network/data/x/1.jpg")).toBe("https://cmdxd98sb0x3yprd.mangadex.network/data/x/1.jpg");
  });
});
