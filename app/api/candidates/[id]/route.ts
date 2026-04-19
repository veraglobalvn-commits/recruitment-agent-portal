import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getAuthenticatedUser(req);
  if (!result) return unauthorizedResponse();

  const { id } = await params;
  const adminClient = getAdminClient();

  // Fetch current user profile
  const { data: currentUser } = await result.supabase
    .from('users')
    .select('id, role, status, agency_id, permissions')
    .eq('supabase_uid', result.user.id)
    .maybeSingle();

  if (!currentUser || currentUser.status !== 'active') {
    return unauthorizedResponse('Tài khoản không hoạt động');
  }

  // Check delete permission
  if (!hasPermission(currentUser, PERMISSIONS.DELETE_CANDIDATES)) {
    return NextResponse.json({ error: 'Không có quyền xóa ứng viên' }, { status: 403 });
  }

  // Fetch candidate
  const { data: candidate, error: fetchErr } = await adminClient
    .from('candidates')
    .select('id_ld, agent_id, interview_status, passport_link, video_link, photo_link, pcc_link, health_cert_link')
    .eq('id_ld', id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: 'Không tìm thấy ứng viên' }, { status: 404 });

  // Block delete if candidate has Passed status
  if (candidate.interview_status === 'Passed') {
    return NextResponse.json({ error: 'Không thể xóa ứng viên đã trúng tuyển' }, { status: 403 });
  }

  // Non-admin users can only delete their own candidates
  if (currentUser.role !== 'admin' && candidate.agent_id !== currentUser.id) {
    return NextResponse.json({ error: 'Không có quyền xóa ứng viên này' }, { status: 403 });
  }

  // Delete storage files
  const bucket = 'agent-media';
  const fileLinks = [
    candidate.passport_link,
    candidate.video_link,
    candidate.photo_link,
    candidate.pcc_link,
    candidate.health_cert_link,
  ].filter(Boolean) as string[];

  for (const link of fileLinks) {
    try {
      // Extract path after /agent-media/
      const match = link.match(/agent-media\/(.+)$/);
      if (match) {
        await adminClient.storage.from(bucket).remove([match[1]]);
      }
    } catch {
      // continue even if file removal fails
    }
  }

  const { error: deleteErr } = await adminClient
    .from('candidates')
    .delete()
    .eq('id_ld', id);

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
