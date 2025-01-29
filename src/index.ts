import type { Plugin } from "esbuild";
import fs, { readFile } from "node:fs/promises";
import path from "node:path";
import { PackageJson } from "pkg-types";

function isRecordEntry(
  entry: unknown
): asserts entry is Record<string, string> {
  if (!isRecord(entry)) {
    throw new Error("Entry object must be of type Record<string, string>");
  }
}

function isRecord(val: unknown): val is Record<string, string> {
  if (typeof val !== "object" || val == null) {
    return false;
  }

  if (Array.isArray(val)) {
    return false;
  }

  return true;
}

const hasOutDir = (outdir?: string) => {
  if (outdir == null) {
    throw new Error("An output dir is required when using multiple exports");
  }
};

export type SubExportsOptions = {
  /**
   * An optional whitelist of entries, by name (key in entry object)
   */
  entries?: string[];
};

/**
 * Adds subexports to your package according to an entry object.
 */
export const subExports = (opts: SubExportsOptions = {}): Plugin => {
  return {
    name: "sub-exports",
    async setup(build) {
      const { entryPoints, outdir } = build.initialOptions;

      isRecordEntry(entryPoints);
      hasOutDir(outdir);

      const { entries = Object.keys(entryPoints) } = opts;

      if (entries.length === 0) return;

      build.onEnd(async () => {
        const _exports: Record<
          string,
          { types: string; import: string; require: string }
        > = {};

        const files: string[] = [];

        for (const name in entries) {
          const cjsPath = `${outdir}/${name}.js`;
          const dtsPath = `${outdir}/${name}.d.ts`;
          files.push(`${outdir}/${name}.mjs`);
          files.push(cjsPath);
          files.push(dtsPath);

          _exports[`./${name}`] = {
            types: dtsPath,
            import: `./dist/${name}.mjs`,
            require: cjsPath,
          };

          fs.writeFile(
            `./${name}.js`,
            `module.exports = require("${cjsPath}");`
          );
          fs.writeFile(`./${name}.d.ts`, `export * from "${dtsPath}";`);
        }

        const pkgPath = path.join(process.cwd(), "package.json");

        const pkg: PackageJson = await readFile(pkgPath);

        const oldPkgStr = JSON.stringify(pkg, null, 2);

        const newPkg = {
          ...pkg,
          files: Array.from(new Set([...(pkg.files ?? []), ...files])),
          exports: {
            ...(isRecord(pkg.exports) ? pkg.exports : {}),
            ..._exports,
          },
        };

        const newPkgStr = JSON.stringify(newPkg, null, 2);

        if (oldPkgStr !== newPkgStr) {
          await fs.writeFile("./package.json", newPkgStr);
        }
      });
    },
  };
};
