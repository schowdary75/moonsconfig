import http from 'node:http';
import https from 'node:https';

const apiUrl =
  process.env.API_READY_URL?.trim() ||
  process.env.VITE_API_READY_URL?.trim() ||
  'http://127.0.0.1:4000/api/openapi.json';

const timeoutMs = Number(process.env.API_READY_TIMEOUT_MS || 90_000);
const intervalMs = Number(process.env.API_READY_INTERVAL_MS || 500);
const requestTimeoutMs = Number(process.env.API_READY_REQUEST_TIMEOUT_MS || 2_000);
const startedAt = Date.now();

console.log(`Waiting for the API at ${apiUrl}`);

function probe(url) {
  return new Promise((resolve) => {
    const target = new URL(url);
    const transport = target.protocol === 'https:' ? https : http;
    const request = transport.request(
      target,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          connection: 'close',
        },
        agent: false,
      },
      (response) => {
        response.resume();
        response.once('end', () =>
          resolve(response.statusCode >= 200 && response.statusCode < 400),
        );
      },
    );

    request.setTimeout(requestTimeoutMs, () => request.destroy());
    request.once('error', () => resolve(false));
    request.end();
  });
}

let ready = false;
while (Date.now() - startedAt < timeoutMs) {
  if (await probe(apiUrl)) {
    ready = true;
    break;
  }

  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

if (ready) {
  console.log('API is ready; starting the frontend.');
} else {
  console.error(`API did not become ready within ${Math.round(timeoutMs / 1_000)} seconds.`);
  console.error('Check the [api] output above for database, environment, or port errors.');
  process.exitCode = 1;
}
