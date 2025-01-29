import type { Plugin } from "esbuild";
import fs from "node:fs/promises";
import {
  resolvePackageJSON,
  writePackageJSON,
  readPackageJSON,
} from "pkg-types";

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

const toRelative = (path: string) =>
  path.startsWith("./") ? path : "./" + path;

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

        for (const name of entries) {
          const cjsPath = `${outdir}/${name}.js`;
          const mjsPath = `${outdir}/${name}.mjs`;
          const dtsPath = `${outdir}/${name}.d.ts`;
          const rootCjsPath = `${name}.js`;
          const rootDtsPath = `${name}.d.ts`;

          for (const file of [
            cjsPath,
            dtsPath,
            mjsPath,
            rootCjsPath,
            rootDtsPath,
          ]) {
            files.push(file);
          }

          _exports[`./${name}`] = {
            types: toRelative(dtsPath),
            import: toRelative(mjsPath),
            require: toRelative(cjsPath),
          };

          fs.writeFile(
            toRelative(rootCjsPath),
            `module.exports = require("${toRelative(cjsPath)}");`
          );
          fs.writeFile(
            toRelative(rootDtsPath),
            `export type * from "${toRelative(dtsPath)}";`
          );
        }

        const [pkg, pkgPath] = await Promise.all([
          readPackageJSON(),
          resolvePackageJSON(),
        ]);

        if (pkg == null) {
          console.warn("Subexports: Could not find package JSON");
          return;
        }

        const hasChanged =
          JSON.stringify({
            files: pkg.files,
            exports: pkg.exports,
          }) !==
          JSON.stringify({
            files,
            exports: _exports,
          });

        if (hasChanged) {
          await writePackageJSON(pkgPath, {
            ...pkg,
            files: Array.from(new Set([...(pkg.files ?? []), ...files])),
            exports: {
              ...(isRecord(pkg.exports) ? pkg.exports : {}),
              ..._exports,
            },
          });
        }
      });
    },
  };
};
