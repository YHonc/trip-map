import { addReference, deleteReference, getReference, listReferences } from '@/services/server/reference-store';
import { jsonBody, localRequest, noStore } from '@/services/server/local-http';

function failure(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : '参考库操作失败' }, { status: 400, headers: noStore });
}
export async function GET(request: Request) {
  try {
    localRequest(request);
    const query = new URL(request.url).searchParams;
    return Response.json(query.has('id') ? getReference(query.get('planId'), query.get('id')) : { references: listReferences(query.get('planId')) }, { headers: noStore });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    localRequest(request);
    const body = await jsonBody(request, 650_000);
    return Response.json(addReference(body.planId, body.name, body.text), { headers: noStore });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try {
    localRequest(request); const body = await jsonBody(request);
    return Response.json(deleteReference(body.planId, body.id), { headers: noStore });
  } catch (error) { return failure(error); }
}
