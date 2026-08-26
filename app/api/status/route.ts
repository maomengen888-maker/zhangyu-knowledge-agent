export async function GET() {
  return Response.json(
    { configured: Boolean(process.env.DIFY_API_KEY?.trim()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
