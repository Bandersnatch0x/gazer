import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHELL_PALETTE } from "../src/shell/palette";

interface ManifestIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
}

interface Manifest {
  readonly name: string;
  readonly short_name: string;
  readonly display: string;
  readonly start_url: string;
  readonly background_color: string;
  readonly theme_color: string;
  readonly icons: readonly ManifestIcon[];
}

const manifestUrl = new URL("../public/manifest.webmanifest", import.meta.url);
const manifest = JSON.parse(readFileSync(fileURLToPath(manifestUrl), "utf8")) as Manifest;

const PNG_SIGNATURE = "89504e470d0a1a0a";

function pngSize(src: string): string {
  const bytes = readFileSync(fileURLToPath(new URL(src, manifestUrl)));
  expect(bytes.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("web app manifest", () => {
  it("names the app GAZER and declares a standalone launch", () => {
    expect(manifest.name).toBe("GAZER");
    expect(manifest.short_name).toBe("GAZER");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("./");
  });

  it("paints the browser chrome with the shell palette", () => {
    expect(manifest.theme_color).toBe(SHELL_PALETTE.void);
    expect(manifest.background_color).toBe(SHELL_PALETTE.void);
  });

  it("ships 192 and 512 icons that exist at their declared size", () => {
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    for (const icon of manifest.icons) {
      expect(icon.type).toBe("image/png");
      expect(pngSize(icon.src)).toBe(icon.sizes);
    }
  });
});
