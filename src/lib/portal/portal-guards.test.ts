import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El layout de `/portal` no redirige ni deniega: la frontera de seguridad es
 * cada página. Este test falla si una página nueva de `/portal` olvida llamar
 * a `requirePortalSession`, o si aparece un route handler `/api/portal/*`
 * (el portal es de solo lectura en esta fase).
 */
const PORTAL_DIR = path.resolve(process.cwd(), "src/app/portal");
const API_PORTAL_DIR = path.resolve(process.cwd(), "src/app/api/portal");

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

describe("guards de las páginas de /portal", () => {
  const pages = findPages(PORTAL_DIR);

  it("encuentra al menos /portal y /portal/sedes/[id]", () => {
    const relative = pages.map((page) =>
      path.relative(PORTAL_DIR, page).split(path.sep).join("/"),
    );
    expect(relative).toEqual(
      expect.arrayContaining(["page.tsx", "sedes/[id]/page.tsx"]),
    );
  });

  for (const page of pages) {
    const relative = path.relative(PORTAL_DIR, page).split(path.sep).join("/");

    it(`${relative} llama a requirePortalSession`, () => {
      const source = readFileSync(page, "utf8");
      expect(source).toMatch(/\brequirePortalSession\(/);
    });
  }

  it("el layout del portal no redirige ni deniega", () => {
    const source = readFileSync(path.join(PORTAL_DIR, "layout.tsx"), "utf8");
    expect(source).not.toMatch(/\b(redirect|forbidden|notFound)\(/);
    expect(source).not.toMatch(/\brequire(PortalSession|Session|Permission)\(/);
  });

  it("no existen route handlers /api/portal/*", () => {
    let exists = true;
    try {
      statSync(API_PORTAL_DIR);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});
