// from https://gist.github.com/timfish/a69dd7457b8d6d97c0a8018675be6c23
const SLUG = '/tunnel/';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  "Access-Control-Allow-Headers": "Content-Type",
  'Access-Control-Max-Age': '86400',
};
function handleOptions(request) {
  if (request.headers.get("Origin") !== null &&
      request.headers.get("Access-Control-Request-Method") !== null &&
      request.headers.get("Access-Control-Request-Headers") !== null) {
    // Handle CORS pre-flight request.
    return new Response(null, {
      headers: corsHeaders
    })
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      headers: {
        "Allow": "GET, HEAD, POST, OPTIONS",
      }
    })
  }
}

async function handleRequest(request) {

	if (request.method === 'OPTIONS') {
    return handleOptions(request);
	}

  const url = new URL(request.url)

  // Handle requests for Sentry CDN JavaScript
  if (request.method === 'GET' && url.pathname.startsWith(SLUG) && (url.pathname.endsWith('.js') || url.pathname.endsWith('.js.map'))) {
    const path = url.pathname.slice(SLUG.length);
    // Fetch and pass the same response, including headers
    const response = await fetch(`https://browser.sentry-cdn.com/${path}`);
		return new Response(response.body, {
			headers: {...response.headers, ...corsHeaders},
			status: response.status,
			statusText: response.statusText
		});
  }

  if (request.method === 'POST' && (url.pathname === SLUG || url.pathname === SLUG.slice(0, -1))) {
    let { readable, writable } = new TransformStream()
    request.body.pipeTo(writable);

    // We tee the stream so we can pull the header out of one stream
    // and pass the other straight as the fetch POST body
    const [header, body] = readable.tee();

    let decoder = new TextDecoder()
    let chunk = '';

    const headerReader = header.getReader();

    while (true) {
      const { done, value } = await headerReader.read();

      if (done) {
        break;
      }

      chunk += decoder.decode(value);

      const index = chunk.indexOf('\n');

      if (index >= 0) {
        // Get the first line
        const firstLine = chunk.slice(0, index);
        const event = JSON.parse(firstLine);
        const dsn = new URL(event.dsn);
        // Post to the Sentry endpoint!
        const response = await fetch(`https://${dsn.host}/api${dsn.pathname}/envelope/`, { method: 'POST', body });
				return new Response(response.body, {
					headers: {...response.headers, ...corsHeaders},
					status: response.status,
					statusText: response.statusText
				});
      }
    }
  }

  // If the above routes don't match, return 404
  return new Response(null, { status: 404 });
}

export default {
	async fetch(request, env, ctx) {
		return handleRequest(request);
	},
};
