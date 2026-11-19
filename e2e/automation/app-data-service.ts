import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  createFakeAppDataService,
  type FakeAppDataOptions,
} from "../../src/test-utils/fake-app-data-service";

/** Serve the fake app-data-service on 127.0.0.1, which sync allows over plain HTTP. */
export async function startAppDataService(options: FakeAppDataOptions = {}) {
  const service = createFakeAppDataService(options);
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const result = await service.handle(
      new Request(`http://127.0.0.1${request.url}`, {
        method: request.method,
        headers: request.headers as Record<string, string>,
        ...(body.length ? { body } : {}),
      }),
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    ...service,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
