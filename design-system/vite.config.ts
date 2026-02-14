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
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
