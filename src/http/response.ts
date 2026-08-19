export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export function notFound(): Response {
  return json({ error: "Not found" }, 404);
}
