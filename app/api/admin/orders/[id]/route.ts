import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    const auth = await getAdminUser(req);
    if (!auth) return unauthorizedResponse();

    const body = await req.json();
    const { data, error } = await auth.supabase
        .from('orders')
        .update(body)
        .eq('id', params.id)
        .select()
        .single();

    if (error) {
        console.error('[admin/orders PATCH] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
}