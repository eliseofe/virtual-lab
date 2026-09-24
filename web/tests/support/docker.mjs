import { spawnSync } from "node:child_process";

// Database-level tests start a disposable Postgres container. CI sets
// VLAB_REQUIRE_DOCKER=1 so they always run there; on a machine without Docker
// they are reported as skipped instead of failing.
export function dockerSkipReason() {
  if (process.env.VLAB_REQUIRE_DOCKER === "1") return null;
  const probe = spawnSync("docker", ["info"], { encoding: "utf8", timeout: 10_000 });
  if (probe.status === 0) return null;
  return "Docker is not available here (set VLAB_REQUIRE_DOCKER=1 to require it)";
}
