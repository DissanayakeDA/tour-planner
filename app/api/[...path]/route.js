// Every /api/* request goes to the framework-independent router in lib/api.js.
import { dispatch } from '@/lib/api.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request, { params }) {
  const { path = [] } = await params;
  return dispatch(request, path);
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE, handle as HEAD };
