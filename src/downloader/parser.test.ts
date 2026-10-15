import { expect, test } from "bun:test";
import { extractSupportedUrls } from "./parser";

test("extrae solo links de X/Instagram, en orden y sin repetir", () => {
  const chat = `[1/10/26, 10:00:00] Ana: mira https://x.com/user/status/1
1/10/26, 10:01 - Luis: https://www.youtube.com/watch?v=abc
[1/10/26, 10:02:00] Ana: https://www.instagram.com/p/AAA/ y https://x.com/user/status/1
1/10/26, 10:03 - Luis: https://instagram.com/reel/BBB/`;

  const urls = extractSupportedUrls(chat);
  expect(urls).toEqual([
    "https://x.com/user/status/1",
    "https://www.instagram.com/p/AAA/",
    "https://instagram.com/reel/BBB/",
  ]);
  expect(urls.slice(-2)).toEqual(["https://www.instagram.com/p/AAA/", "https://instagram.com/reel/BBB/"]);
});
