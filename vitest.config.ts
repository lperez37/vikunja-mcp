import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test environment
    environment: "node",
    
    // Global setup
    globals: true,
    
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.config.*",
        "**/*.d.ts",
        "**/types.ts", // Type definitions only
      ],
      // Coverage thresholds
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    
    // Test file patterns
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    
    // Exclude patterns
    exclude: ["node_modules/**", "dist/**"],
  },
});
