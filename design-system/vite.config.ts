import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import rehypePrettyCode from "rehype-pretty-code";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
// Resolve actual node_modules root (may differ from project root in git worktrees)
const nodeModulesRoot = resolve(dirname(_require.resolve("vite/package.json")), "../..");

export default defineConfig({
  root: __dirname,
  plugins: [
    {
      enforce: "pre",
      ...mdx({
        providerImportSource: "@mdx-js/react",
        remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
        rehypePlugins: [[rehypePrettyCode, { theme: "github-dark" }]],
      }),
    },
    react({
      babel: { plugins: ["babel-plugin-react-compiler"] },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@/": `${resolve(__dirname, "../src/renderer/src")}/`,
      "@features/": `${resolve(__dirname, "../src/features")}/`,
      "@docs/": `${resolve(__dirname, "src")}/`,
    },
  },
  server: {
    port: 5200,
    fs: {
      allow: [resolve(__dirname, ".."), nodeModulesRoot],
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
