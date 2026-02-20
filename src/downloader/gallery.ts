import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface DownloadResult {
  success: boolean;
  filePaths?: string[];
  error?: string;
}

export async function downloadMedia(
  url: string,
  outputDir: string,
  galleryDLPath: string,
): Promise<DownloadResult> {
  try {
    const { stdout, stderr } = await execFileAsync(galleryDLPath, [
      url,
      "-D", outputDir,
      "--range", "1-100",
    ]);

    console.log('gallery-dl stdout:', stdout);
    console.log('gallery-dl stderr:', stderr);

    // gallery-dl imprime los archivos descargados en stdout (uno por línea)
    const filePaths = stdout.trim().split("\n").filter(line => line.trim());

    return { success: true, filePaths };
  } catch (error: any) {
    console.error('gallery-dl failed:', error);
    console.error('gallery-dl stderr:', error.stderr);
    return {
      success: false,
      error: error.stderr || error.message || String(error),
    };
  }
}
