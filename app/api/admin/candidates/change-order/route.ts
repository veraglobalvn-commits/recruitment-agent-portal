import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';

type CandidateRow = {
  id_ld: string;
  order_id: string | null;
  agent_id: string | null;
};

type OrderAgentRow = {
  agent_id: string;
  assigned_labor_number: number | null;
};

export async function POST(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const body = await req.json() as {
    candidate_ids?: string[];
    target_order_id?: string;
  };

  const candidateIds = Array.from(new Set(body.candidate_ids ?? [])).filter(Boolean);
  const targetOrderId = body.target_order_id?.trim();

  if (candidateIds.length === 0 || !targetOrderId) {
    return NextResponse.json({ error: 'candidate_ids và target_order_id là bắt buộc' }, { status: 400 });
  }

  const { data: targetOrder, error: orderError } = await auth.supabase
    .from('orders')
    .select('id, total_labor, agent_ids')
    .eq('id', targetOrderId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }
  if (!targetOrder) {
    return NextResponse.json({ error: 'Đơn hàng đích không tồn tại' }, { status: 400 });
  }

  const { data: selectedCandidates, error: candidateError } = await auth.supabase
    .from('candidates')
    .select('id_ld, order_id, agent_id')
    .in('id_ld', candidateIds);

  if (candidateError) {
    return NextResponse.json({ error: candidateError.message }, { status: 500 });
  }

  const candidates = (selectedCandidates ?? []) as CandidateRow[];
  if (candidates.length !== candidateIds.length) {
    return NextResponse.json({ error: 'Một hoặc nhiều ứng viên không tồn tại' }, { status: 400 });
  }
  if (candidates.some((c) => c.order_id === targetOrderId)) {
    return NextResponse.json({ error: 'Đơn hàng đích phải khác đơn hàng hiện tại của ứng viên đã chọn' }, { status: 400 });
  }

  const movedAgentIds = Array.from(new Set(candidates.map((c) => c.agent_id).filter((id): id is string => !!id)));

  const warnings: string[] = [];
  const orderAgentUpdates: { agent_id: string; assigned_labor_number: number }[] = [];
  const plannedOrderAgentUpdates: { agent_id: string; assigned_labor_number: number }[] = [];

  if (movedAgentIds.length > 0) {
    const { data: targetCandidates, error: countError } = await auth.supabase
      .from('candidates')
      .select('agent_id')
      .eq('order_id', targetOrderId)
      .in('agent_id', movedAgentIds);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const actualCounts = new Map<string, number>();
    for (const row of (targetCandidates ?? []) as { agent_id: string | null }[]) {
      if (!row.agent_id) continue;
      actualCounts.set(row.agent_id, (actualCounts.get(row.agent_id) ?? 0) + 1);
    }
    for (const candidate of candidates) {
      if (!candidate.agent_id) continue;
      actualCounts.set(candidate.agent_id, (actualCounts.get(candidate.agent_id) ?? 0) + 1);
    }

    const { data: existingOrderAgents, error: oaError } = await auth.supabase
      .from('order_agents')
      .select('agent_id, assigned_labor_number')
      .eq('order_id', targetOrderId);

    if (oaError) {
      return NextResponse.json({ error: oaError.message }, { status: 500 });
    }

    const existingRows = (existingOrderAgents ?? []) as OrderAgentRow[];
    const totalLabor = targetOrder.total_labor === null || targetOrder.total_labor === undefined
      ? null
      : Number(targetOrder.total_labor);
    let assignedByUnaffected = existingRows
      .filter((row) => !movedAgentIds.includes(row.agent_id))
      .reduce((sum, row) => sum + Number(row.assigned_labor_number ?? 0), 0);

    for (const agentId of movedAgentIds) {
      const actualCount = actualCounts.get(agentId) ?? 0;
      const remainingQuota = totalLabor === null ? actualCount : Math.max(0, totalLabor - assignedByUnaffected);
      const assignedLaborNumber = totalLabor === null ? actualCount : Math.min(actualCount, remainingQuota);

      if (assignedLaborNumber < actualCount) {
        warnings.push(`Agent ${agentId} có ${actualCount} ứng viên trong đơn đích nhưng chỉ còn quota ${assignedLaborNumber}`);
      }

      plannedOrderAgentUpdates.push({ agent_id: agentId, assigned_labor_number: assignedLaborNumber });
      assignedByUnaffected += assignedLaborNumber;
    }
  }

  const { error: moveError } = await auth.supabase
    .from('candidates')
    .update({ order_id: targetOrderId })
    .in('id_ld', candidateIds);

  if (moveError) {
    return NextResponse.json({ error: moveError.message }, { status: 500 });
  }

  if (movedAgentIds.length > 0) {
    for (const update of plannedOrderAgentUpdates) {
      const { error: upsertError } = await auth.supabase
        .from('order_agents')
        .upsert({
          order_id: targetOrderId,
          agent_id: update.agent_id,
          assigned_labor_number: update.assigned_labor_number,
        }, { onConflict: 'order_id,agent_id' });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }

      orderAgentUpdates.push(update);
    }

    const nextAgentIds = Array.from(new Set([...(targetOrder.agent_ids ?? []), ...movedAgentIds]));
    const { error: orderUpdateError } = await auth.supabase
      .from('orders')
      .update({ agent_ids: nextAgentIds })
      .eq('id', targetOrderId);

    if (orderUpdateError) {
      return NextResponse.json({ error: orderUpdateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    moved_count: candidateIds.length,
    target_order_id: targetOrderId,
    order_agent_updates: orderAgentUpdates,
    warnings,
  });
}
