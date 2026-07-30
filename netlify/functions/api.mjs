import { api, ready } from "../../server.js";

const headerObject = (headers) => Object.fromEntries(headers.entries());

const nodeLikeRequest = async (request) => {
  const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  return {
    method: request.method,
    headers: headerObject(request.headers),
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    }
  };
};

const responseAdapter = () => {
  let status = 200;
  let headers = {};
  let body = "";
  return {
    node: {
      writeHead(nextStatus, nextHeaders = {}) {
        status = nextStatus;
        headers = nextHeaders;
      },
      end(nextBody = "") {
        body = nextBody;
      }
    },
    web() {
      return new Response(body, { status, headers });
    }
  };
};

export default async (request) => {
  const databaseUrl = globalThis.Netlify?.env?.get?.("DATABASE_URL");
  if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
  await ready;
  const adapter = responseAdapter();
  const url = new URL(request.url);
  await api(await nodeLikeRequest(request), adapter.node, url);
  return adapter.web();
};

export const config = {
  path: "/api/*"
};
