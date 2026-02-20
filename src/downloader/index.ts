import { identifyPlatform } from "./parser";
import { downloadMedia } from "./gallery";
import { config } from "../config";
import { mkdirSync } from "fs";

export async function processUrl(url: string, groupName: string): Promise<string[]> {
  const platform = identifyPlatform(url);
  if (platform === "unknown") {
    throw new Error("Unsupported platform");
  }

  const outputDir = `${config.downloadsDir}/${groupName}/${platform}`;

  const galleryDLPath = config.galleryDLPath;
  mkdirSync(outputDir, { recursive: true });
  const result = await downloadMedia(url, outputDir, galleryDLPath);

  if (!result.success || !result.filePaths || result.filePaths.length === 0) {
    console.error('❌ gallery-dl error:', result.error);
    throw new Error(result.error || "Failed to download media");
  }

  return result.filePaths;
}
