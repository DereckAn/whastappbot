import { existsSync } from "fs";
import path from "path";

// Prefiere el binario en ./bin (descargado por `bun run tools`); si no, usa el del PATH.
// Una ruta explícita (con separador) se respeta tal cual.
export function resolveTool(name: string): string {
  if (name.includes("/") || name.includes("\\")) return name;
  const local = path.resolve("./bin", process.platform === "win32" ? `${name}.exe` : name);
  return existsSync(local) ? local : name;
}
