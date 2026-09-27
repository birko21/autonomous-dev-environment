import assert from "node:assert/strict";
import test from "node:test";
import { GitHubAdapter } from "../../src/github/adapter.js";

void test("GitHub adapter uses isolated REST contract and deliberately exposes no merge method", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.endsWith("/repos/acme/repo")) return new Response(JSON.stringify({ full_name: "acme/repo", default_branch: "main", private: true }), { status: 200 });
    if (url.includes("/compare/")) return new Response(JSON.stringify({ files: [{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 0, changes: 1 }] }), { status: 200 });
    if (url.includes("/check-runs")) return new Response(JSON.stringify({ check_runs: [{ name: "Repository Checks", status: "completed", conclusion: "success" }] }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  };
  const adapter = new GitHubAdapter({ token: "test-token", repository: "acme/repo", fetchImpl: fakeFetch });
  assert.deepEqual(await adapter.inspectRepository(), { fullName: "acme/repo", defaultBranch: "main", private: true });
  assert.equal((await adapter.collectChangedFiles("main", "feature"))[0]?.filename, "src/a.ts");
  assert.equal((await adapter.getCheckStatus("abc"))[0]?.conclusion, "success");
  assert.equal("mergePullRequest" in adapter, false);
  assert.ok(calls.every((call) => call.url.startsWith("https://api.github.com/repos/acme/repo")));
});
