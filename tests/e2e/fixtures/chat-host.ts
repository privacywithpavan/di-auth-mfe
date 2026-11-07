import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";
import { json, listen } from "./http";
import { clientId, sessionCookie, type startIam } from "./iam";

export async function buildChatHost() {
  const result = await build({
    configFile: false,
    envDir: false,
    root: resolve("tests/e2e/fixtures/chat-ui"),
    resolve: { alias: { "@": resolve("src") } },
    plugins: [tailwindcss()],
    logLevel: "warn",
    build: {
      write: false,
      // The fixture bundle renders exclusively in the browser.
      rolldownOptions: { checks: { moduleLevelDirective: false } },
    },
  });
  if (!("output" in result))
    throw new Error("Expected one chat fixture bundle.");
  return new Map(
    result.output.map((file) => [
      `/${file.fileName}`,
      file.type === "asset" ? file.source : file.code,
    ]),
  );
}

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export async function startChatHost(
  assets: Awaited<ReturnType<typeof buildChatHost>>,
  mfeOrigin: string,
  authenticate: Awaited<ReturnType<typeof startIam>>["authenticate"],
) {
  const html = assets.get("/index.html");
  if (typeof html !== "string") throw new Error("Expected chat fixture HTML.");
  const page = html
    .replace("__MFE_ORIGIN__", mfeOrigin)
    .replace("__CLIENT_ID__", clientId);
  const csrfKey = randomBytes(32);
  const csrfToken = (token: string) =>
    createHmac("sha256", csrfKey).update(token).digest("hex");

  const server = await listen(async (request, response) => {
    if (request.url === "/session" || request.url === "/session/logout") {
      const token = request.headers.cookie
        ?.split("; ")
        .find((cookie) => cookie.startsWith(`${sessionCookie}=`))
        ?.slice(sessionCookie.length + 1);
      const user = await authenticate(token);
      if (!user || !token) return json(response, 401, { user: null });
      const csrf = csrfToken(token);
      if (request.method === "GET" && request.url === "/session") {
        return json(response, 200, { user, csrfToken: csrf });
      }
      if (request.method === "POST" && request.url === "/session/logout") {
        const supplied = request.headers["x-csrf-token"];
        if (
          request.headers.origin !== server.origin ||
          typeof supplied !== "string" ||
          !/^[0-9a-f]{64}$/.test(supplied) ||
          !timingSafeEqual(Buffer.from(supplied), Buffer.from(csrf))
        )
          return json(response, 403, { code: "INVALID_LOGOUT_REQUEST" });
        response
          .writeHead(204, {
            "Cache-Control": "no-store",
            "Set-Cookie": `${sessionCookie}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
          })
          .end();
        return;
      }
      return json(response, 405, { code: "METHOD_NOT_ALLOWED" });
    }

    const path = request.url ?? "";
    const asset = path === "/" ? page : assets.get(path);
    const type =
      path === "/"
        ? contentTypes[".html"]
        : contentTypes[path.slice(path.lastIndexOf("."))];
    if (request.method !== "GET" || !asset || !type) {
      return json(response, 404, { code: "NOT_FOUND" });
    }
    response.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store",
    });
    response.end(asset);
  });
  return server;
}
