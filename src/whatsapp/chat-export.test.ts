import { expect, test } from "bun:test";
import { parseChatExport } from "./chat-export";

test("saca remitente y hora de exportaciones iOS y Android", () => {
  const chat = [
    "‎[1/10/26, 10:00:00] Ana: mira https://x.com/user/status/1",
    "1/10/26, 10:01 - Luis: https://www.youtube.com/watch?v=abc",
    "1/10/26, 10:02 - Luis: primera línea",
    "y en la segunda https://www.instagram.com/p/AAA/",
    "[1/10/26, 10:03:00] Ana: repetido https://x.com/user/status/1",
    "1/10/26, 10:04 - Los mensajes están cifrados de extremo a extremo.",
  ].join("\n");

  const { lines, links } = parseChatExport(chat);
  expect(lines).toBe(6);
  expect(links).toEqual([
    { url: "https://x.com/user/status/1", sender: "Ana", date: "1/10/26", time: "10:00" },
    { url: "https://www.instagram.com/p/AAA/", sender: "Luis", date: "1/10/26", time: "10:02" },
  ]);
});
