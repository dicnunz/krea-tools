import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE } from "./config.mjs";

const execFileAsync = promisify(execFile);

export class KeychainStore {
  constructor({ service = KEYCHAIN_SERVICE, account = KEYCHAIN_ACCOUNT } = {}) {
    this.service = service;
    this.account = account;
  }

  async load() {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-a", this.account,
        "-s", this.service,
        "-w"
      ]);
      return JSON.parse(stdout.trim());
    } catch (error) {
      if (error?.code === 44 || /could not be found/i.test(error?.stderr ?? "")) return {};
      throw new Error(`Unable to read Krea OAuth credentials from macOS Keychain: ${error.message}`);
    }
  }

  async save(state) {
    const serialized = JSON.stringify(state);
    try {
      await execFileAsync("security", [
        "add-generic-password",
        "-U",
        "-a", this.account,
        "-s", this.service,
        "-w", serialized
      ]);
    } catch (error) {
      throw new Error(`Unable to save Krea OAuth credentials to macOS Keychain: ${error.message}`);
    }
  }

  async clear() {
    try {
      await execFileAsync("security", [
        "delete-generic-password",
        "-a", this.account,
        "-s", this.service
      ]);
    } catch (error) {
      if (error?.code === 44 || /could not be found/i.test(error?.stderr ?? "")) return;
      throw error;
    }
  }
}
