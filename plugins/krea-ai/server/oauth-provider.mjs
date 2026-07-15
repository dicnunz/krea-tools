import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { CALLBACK_URL, UPSTREAM_URL } from "./config.mjs";

const execFileAsync = promisify(execFile);

export class PersistentOAuthProvider {
  constructor(store, { openBrowser = true } = {}) {
    this.store = store;
    this.openBrowser = openBrowser;
    this.pendingAuthorizationUrl = undefined;
  }

  get redirectUrl() {
    return CALLBACK_URL;
  }

  get clientMetadata() {
    return {
      client_name: "Krea Local Companion",
      client_uri: "https://www.krea.ai/mcp",
      redirect_uris: [CALLBACK_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    };
  }

  async state() {
    const value = randomBytes(24).toString("base64url");
    await this.#merge({ oauthState: value });
    return value;
  }

  async clientInformation() {
    return (await this.store.load()).clientInformation;
  }

  async saveClientInformation(clientInformation) {
    await this.#merge({ clientInformation });
  }

  async tokens() {
    return (await this.store.load()).tokens;
  }

  async saveTokens(tokens) {
    await this.#merge({ tokens });
  }

  async redirectToAuthorization(authorizationUrl) {
    this.pendingAuthorizationUrl = authorizationUrl;
    if (this.openBrowser) await execFileAsync("open", [authorizationUrl.toString()]);
    else process.stderr.write(`KREA_AUTH_URL=${authorizationUrl.toString()}\n`);
  }

  async saveCodeVerifier(codeVerifier) {
    await this.#merge({ codeVerifier });
  }

  async codeVerifier() {
    const codeVerifier = (await this.store.load()).codeVerifier;
    if (!codeVerifier) throw new Error("No OAuth PKCE verifier is stored");
    return codeVerifier;
  }

  async discoveryState() {
    return (await this.store.load()).discoveryState;
  }

  async saveDiscoveryState(discoveryState) {
    await this.#merge({ discoveryState });
  }

  async validateResourceURL(serverUrl, resource) {
    const expected = new URL(UPSTREAM_URL);
    const candidate = new URL(resource ?? serverUrl);
    if (candidate.origin !== expected.origin || candidate.pathname !== expected.pathname) {
      throw new Error(`Krea OAuth returned an unexpected resource: ${candidate}`);
    }
    return candidate;
  }

  async invalidateCredentials(scope) {
    const current = await this.store.load();
    if (scope === "all") return this.store.clear();
    if (scope === "tokens") delete current.tokens;
    if (scope === "client") delete current.clientInformation;
    if (scope === "verifier") delete current.codeVerifier;
    if (scope === "discovery") delete current.discoveryState;
    await this.store.save(current);
  }

  async expectedState() {
    return (await this.store.load()).oauthState;
  }

  async #merge(patch) {
    await this.store.save({ ...(await this.store.load()), ...patch });
  }
}
