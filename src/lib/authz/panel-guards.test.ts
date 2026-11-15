import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El layout de `/panel` no redirige ni deniega: la frontera de seguridad es
 * cada página. Este test falla si una página nueva de `/panel` olvida llamar a
 * `requireSession` o `requirePermission`.
 */
const PANEL_DIR = path.resolve(process.cwd(), "src/app/panel");

function findPages(dir: string): string[] {
  const pages: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) {
      pages.push(...findPages(full));
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry)) {
      pages.push(full);
    }
  }

  return pages;
}

describe("guards de las páginas de /panel", () => {
  const pages = findPages(PANEL_DIR);

  it("encuentra al menos /panel, /panel/usuarios, /panel/empresa y las páginas de clientes y avisos", () => {
    const relative = pages.map((page) =>
      path.relative(PANEL_DIR, page).split(path.sep).join("/"),
    );
    expect(relative).toEqual(
      expect.arrayContaining([
        "page.tsx",
        "usuarios/page.tsx",
        "empresa/page.tsx",
        "clientes/page.tsx",
        "clientes/nuevo/page.tsx",
        "clientes/[id]/page.tsx",
        "avisos/page.tsx",
        "avisos/nuevo/page.tsx",
        "avisos/[id]/page.tsx",
      ]),
    );
  });

  for (const page of pages) {
    const relative = path.relative(PANEL_DIR, page).split(path.sep).join("/");

    it(`${relative} llama a requireSession o requirePermission`, () => {
      const source = readFileSync(page, "utf8");
      expect(source).toMatch(/\b(requireSession|requirePermission)\(/);
    });
  }
});
