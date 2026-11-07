import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

export const loopback = "127.0.0.1";

export function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

export async function listen(
  handle: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>,
) {
  const server = createServer((request, response) => {
    Promise.resolve()
      .then(() => handle(request, response))
      .catch(() => json(response, 500, { code: "FIXTURE_ERROR" }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, loopback, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected a TCP fixture address.");
  return {
    port: address.port,
    origin: `http://localhost:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
