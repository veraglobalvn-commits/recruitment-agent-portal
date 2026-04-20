import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
    const auth = await getAdminUser(req);
    if (!auth) return unauthorizedResponse();

    const body = await req.json() as {
        order_id?: string;
        agent_id?: string;
        assigned_labor_number?: number;
    };

    if (!body.order_id || !body.agent_id) {
        return NextResponse.json({ error: 'order_id và agent_id là bắt buộc' }, { status: 400 });
    }

    const { data, error } = await auth.supabase
        .from('order_agents')
        .upsert({
            order_id: body.order_id,
            agent_id: body.agent_id,
            assigned_labor_number: body.assigned_labor_number ?? 0,
        }, { onConflict: 'order_id,agent_id' })
        .select()
        .single();

    if (error) {
        console.error('[order_agents.upsert] Error:', JSON.stringify(error));
        return NextResponse.json({ error: error.message || error.code || JSON.stringify(error) }, { status: 500 });
    }

    return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
    const auth = await getAdminUser(req);
    if (!auth) return unauthorizedResponse();

    const body = await req.json() as {
        order_id?: string;
        agent_id?: string;
    };

    if (!body.order_id || !body.agent_id) {
        return NextResponse.json({ error: 'order_id và agent_id là bắt buộc' }, { status: 400 });
    }

    const { error } = await auth.supabase
        .from('order_agents')
        .delete()
        .eq('order_id', body.order_id)
        .eq('agent_id', body.agent_id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}