import esbuild from "esbuild"

export const config = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  // Readable stack traces in the container log matter more than bundle size.
  minify: false,
  platform: "node",
  outfile: "dist/index.cjs",
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
}

void esbuild.build(config)
