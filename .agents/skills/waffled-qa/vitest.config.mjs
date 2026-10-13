export default {
  test: {
    include: ["tests/**/*.spec.mjs"],
    globals: true,
    environment: "node",
    // Specs spawn the real CLI, git, and browsers; allow for a loaded machine.
    testTimeout: 30_000,
  },
};
