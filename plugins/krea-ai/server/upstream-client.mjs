import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { CALLBACK_HOST, CALLBACK_PATH, CALLBACK_PORT, UPSTREAM_URL } from "./config.mjs";
import { KeychainStore } from "./keychain-store.mjs";
import { PersistentOAuthProvider } from "./oauth-provider.mjs";

const createClient = () => new Client({ name: "krea-local-companion", version: "0.4.2" }, { capabilities: {} });

const waitForCallback = (provider, timeoutMs = 180_000) => new Promise((resolve, reject) => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${CALLBACK_HOST}:${CALLBACK_PORT}`);
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404).end("Not found");
      return;
    }
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (error || !code || state !== await provider.expectedState()) {
      res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      res.end("<h1>Krea authorization failed</h1><p>Return to the terminal for details.</p>");
      reject(new Error(error ? `Krea OAuth error: ${error}` : "OAuth callback state or code was invalid"));
      server.close();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>Krea connected</h1><p>You can close this window and return to Codex or ChatGPT.</p><script>setTimeout(()=>window.close(),1800)</script>");
    resolve(code);
    server.close();
  });
  const timer = setTimeout(() => {
    server.close();
    reject(new Error("Timed out waiting for Krea authorization"));
  }, timeoutMs);
  server.on("close", () => clearTimeout(timer));
  server.on("error", reject);
  server.listen(CALLBACK_PORT, CALLBACK_HOST);
});

const transportFor = provider => new StreamableHTTPClientTransport(new URL(UPSTREAM_URL), { authProvider: provider });

export async function connectUpstream({ interactive = false, openBrowser = interactive, store = new KeychainStore() } = {}) {
  const provider = new PersistentOAuthProvider(store, { openBrowser });
  let client = createClient();
  let transport = transportFor(provider);
  try {
    await client.connect(transport);
    return { client, transport, provider };
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error;
    if (!interactive) {
      throw new Error("Krea authorization is required. Run the bundled companion with the `auth` command, then start a new Codex task.");
    }
    const callback = waitForCallback(provider);
    const code = await callback;
    await transport.finishAuth(code);
    await client.close().catch(() => {});
    client = createClient();
    transport = transportFor(provider);
    await client.connect(transport);
    return { client, transport, provider };
  }
}
