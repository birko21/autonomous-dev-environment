import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

interface LockOwner {
  token: string;
  pid: number;
  acquiredAt: string;
}

export class RunExecutionLock {
  private readonly lockDir: string;
  private readonly token = randomUUID();

  constructor(runDir: string, private readonly staleMs: number) {
    this.lockDir = join(runDir, "execution.lock");
  }

  async acquire(): Promise<void> {
    await this.tryAcquire();
  }

  private async tryAcquire(): Promise<void> {
    try {
      await mkdir(this.lockDir);
      const owner: LockOwner = { token: this.token, pid: process.pid, acquiredAt: new Date().toISOString() };
      await writeFile(join(this.lockDir, "owner.json"), `${JSON.stringify(owner)}\n`, { encoding: "utf8", flag: "wx" });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    let owner: LockOwner | undefined;
    try {
      owner = JSON.parse(await readFile(join(this.lockDir, "owner.json"), "utf8")) as LockOwner;
    } catch {
      // A process may have created the directory but not yet written its owner.
    }
    let acquiredAt = owner?.acquiredAt ? Date.parse(owner.acquiredAt) : Number.NaN;
    if (!Number.isFinite(acquiredAt)) {
      try {
        acquiredAt = (await stat(this.lockDir)).mtimeMs;
      } catch {
        acquiredAt = Date.now();
      }
    }
    if (Date.now() - acquiredAt < this.staleMs) {
      throw new Error(`Run is already being processed${owner?.pid ? ` by process ${owner.pid}` : ""}.`);
    }
    await rm(this.lockDir, { recursive: true, force: true });
    try {
      await mkdir(this.lockDir);
      const replacement: LockOwner = { token: this.token, pid: process.pid, acquiredAt: new Date().toISOString() };
      await writeFile(join(this.lockDir, "owner.json"), `${JSON.stringify(replacement)}\n`, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Run execution lock was acquired by another process.");
      throw error;
    }
  }

  async release(): Promise<void> {
    try {
      const owner = JSON.parse(await readFile(join(this.lockDir, "owner.json"), "utf8")) as LockOwner;
      if (owner.token !== this.token) return;
    } catch {
      return;
    }
    await rm(this.lockDir, { recursive: true, force: true });
  }
}
