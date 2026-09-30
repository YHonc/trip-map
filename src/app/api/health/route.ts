import { localRequest, noStore } from '@/services/server/local-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { localRequest(request); return Response.json({ app: 'trip-map', version: '1.1.0', instance: process.env.TRIP_MAP_INSTANCE || 'web' }, { headers: noStore }); }
  catch { return new Response('Forbidden', { status: 403 }); }
}
