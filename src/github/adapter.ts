export interface GitHubRepositoryInfo {
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface GitHubChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}

export interface PullRequestResult {
  number: number;
  url: string;
  state: string;
  draft: boolean;
}

export interface CheckStatus {
  name: string;
  status: string;
  conclusion?: string;
  url?: string;
}

export interface ReviewRequest {
  reviewers: string[];
  teams: string[];
}

export interface GitHubAdapterOptions {
  token: string;
  repository: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

function splitRepository(value: string): [string, string] {
  const [owner, name, ...rest] = value.split("/");
  if (!owner || !name || rest.length > 0) throw new Error("GITHUB_REPOSITORY must be owner/name");
  return [owner, name];
}

export class GitHubAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly apiUrl: string;
  private readonly owner: string;
  private readonly name: string;

  constructor(private readonly options: GitHubAdapterOptions) {
    [this.owner, this.name] = splitRepository(options.repository);
    this.apiUrl = (options.apiUrl ?? "https://api.github.com").replace(/\/$/u, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!options.token) throw new Error("GitHub token is required for live GitHub adapter operations");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.options.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text.slice(0, 1_000)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async inspectRepository(): Promise<GitHubRepositoryInfo> {
    const response = await this.request<{ full_name: string; default_branch: string; private: boolean }>("GET", `/repos/${this.owner}/${this.name}`);
    return { fullName: response.full_name, defaultBranch: response.default_branch, private: response.private };
  }

  async createBranch(branch: string, fromRef: string): Promise<void> {
    const ref = await this.request<{ object: { sha: string } }>("GET", `/repos/${this.owner}/${this.name}/git/ref/heads/${encodeURIComponent(fromRef)}`);
    await this.request("POST", `/repos/${this.owner}/${this.name}/git/refs`, { ref: `refs/heads/${branch}`, sha: ref.object.sha });
  }

  async collectChangedFiles(base: string, head: string): Promise<GitHubChangedFile[]> {
    const response = await this.request<{ files?: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number }> }>("GET", `/repos/${this.owner}/${this.name}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
    return (response.files ?? []).map((file) => ({ ...file }));
  }

  async inspectDiff(base: string, head: string): Promise<string> {
    const response = await this.fetchImpl(`${this.apiUrl}/repos/${this.owner}/${this.name}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`, {
      headers: { Accept: "application/vnd.github.v3.diff", Authorization: `Bearer ${this.options.token}`, "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) throw new Error(`GitHub diff request failed (${response.status})`);
    return response.text();
  }

  async createPullRequest(title: string, head: string, base: string, body: string, draft = true): Promise<PullRequestResult> {
    const response = await this.request<{ number: number; html_url: string; state: string; draft: boolean }>("POST", `/repos/${this.owner}/${this.name}/pulls`, { title, head, base, body, draft });
    return { number: response.number, url: response.html_url, state: response.state, draft: response.draft };
  }

  async getCheckStatus(ref: string): Promise<CheckStatus[]> {
    const response = await this.request<{ check_runs?: Array<{ name: string; status: string; conclusion?: string | null; html_url?: string }> }>("GET", `/repos/${this.owner}/${this.name}/commits/${encodeURIComponent(ref)}/check-runs`);
    return (response.check_runs ?? []).map((check) => ({ name: check.name, status: check.status, ...(check.conclusion ? { conclusion: check.conclusion } : {}), ...(check.html_url ? { url: check.html_url } : {}) }));
  }

  prepareReviewRequest(reviewers: string[] = [], teams: string[] = []): ReviewRequest {
    return { reviewers: [...new Set(reviewers)], teams: [...new Set(teams)] };
  }

  async requestReview(pullNumber: number, request: ReviewRequest): Promise<void> {
    await this.request("POST", `/repos/${this.owner}/${this.name}/pulls/${pullNumber}/requested_reviewers`, { reviewers: request.reviewers, team_reviewers: request.teams });
  }

  async addEscalationComment(pullNumber: number, body: string): Promise<void> {
    await this.request("POST", `/repos/${this.owner}/${this.name}/issues/${pullNumber}/comments`, { body });
  }

  async addEscalationLabels(pullNumber: number, labels: string[]): Promise<void> {
    await this.request("POST", `/repos/${this.owner}/${this.name}/issues/${pullNumber}/labels`, { labels });
  }

  // Deliberately no merge method: autonomous merging is outside this adapter's contract.
}

export class MockGitHubAdapter {
  readonly operations: Array<{ name: string; data: Record<string, unknown> }> = [];

  async inspectRepository(): Promise<GitHubRepositoryInfo> {
    this.operations.push({ name: "inspectRepository", data: {} });
    return { fullName: "local/mock", defaultBranch: "main", private: true };
  }

  async createBranch(branch: string, fromRef: string): Promise<void> {
    this.operations.push({ name: "createBranch", data: { branch, fromRef } });
  }

  async collectChangedFiles(): Promise<GitHubChangedFile[]> { return []; }
  async inspectDiff(): Promise<string> { return ""; }
  async createPullRequest(title: string, head: string, base: string, body: string, draft = true): Promise<PullRequestResult> {
    this.operations.push({ name: "createPullRequest", data: { title, head, base, body, draft } });
    return { number: 1, url: "https://example.invalid/mock/pull/1", state: "open", draft };
  }
  async getCheckStatus(): Promise<CheckStatus[]> { return [{ name: "Repository Checks", status: "completed", conclusion: "success" }]; }
  prepareReviewRequest(reviewers: string[] = [], teams: string[] = []): ReviewRequest { return { reviewers, teams }; }
  async requestReview(pullNumber: number, request: ReviewRequest): Promise<void> { this.operations.push({ name: "requestReview", data: { pullNumber, request } }); }
  async addEscalationComment(pullNumber: number, body: string): Promise<void> { this.operations.push({ name: "addEscalationComment", data: { pullNumber, body } }); }
  async addEscalationLabels(pullNumber: number, labels: string[]): Promise<void> { this.operations.push({ name: "addEscalationLabels", data: { pullNumber, labels } }); }
}
