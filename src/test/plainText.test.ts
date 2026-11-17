import { describe, expect, it } from "vitest";
import { plainText } from "@/lib/titles";

describe("plainText", () => {
  it("strips markdown links, emphasis, rules and headings", () => {
    const md = "**Bold** start with _italic_.\n\n---\n# Links\n- [Official](https://x.y) site\n[b]bb[/b]";
    expect(plainText(md)).toBe("Bold start with italic.\n\nLinks\n- Official site\nbb");
  });
});
