import { defineConfig } from "@neon/config/v1";

// mbaprep uses Lakebase Postgres only (every Neon project ships with it).
// No AI gateway, object storage, functions or realtime: the brief rules out AI inside the app,
// and nothing in Tier 1 needs the others.
export default defineConfig({
  auth: false,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) return {};
    // New non-default branches auto-expire. `neon checkout <name> --create` applies this.
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
