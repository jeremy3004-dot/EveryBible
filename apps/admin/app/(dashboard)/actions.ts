'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminServiceClient } from '@/lib/supabase/service';
import { normalizeOptionalString } from '@/lib/format';
import { requireAdminIdentity } from '@/lib/admin-auth';
import { writeAdminAuditLog } from '@/lib/audit-log';
import { runUpstreamTranslationSync } from '@/lib/upstream-sync';

function booleanFromForm(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on';
}

export async function runTranslationSyncAction() {
  const admin = await requireAdminIdentity();
  const result = await runUpstreamTranslationSync(admin.id);

  await writeAdminAuditLog({
    action: 'translation.sync.run',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: result.runId,
    entityType: 'translation_sync_run',
    metadata: result,
    summary: `Triggered upstream translation sync (${result.insertedCount} inserted, ${result.updatedCount} updated).`,
  });

  revalidatePath('/');
  revalidatePath('/translations');
  revalidatePath('/health');
  redirect('/translations?notice=Translation sync completed successfully');
}

export async function updateTranslationMetadataAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const translationId = normalizeOptionalString(formData.get('translationId'));

  if (!translationId) {
    redirect('/translations?error=Missing translation id');
  }

  const distributionState = normalizeOptionalString(formData.get('distributionState')) ?? 'draft';
  const adminNotes = normalizeOptionalString(formData.get('adminNotes'));
  const isAvailable = booleanFromForm(formData, 'isAvailable');

  const service = createAdminServiceClient();
  const { error } = await service
    .from('translation_catalog')
    .update({
      admin_notes: adminNotes,
      distribution_state: distributionState,
      is_available: isAvailable,
    })
    .eq('translation_id', translationId);

  if (error) {
    redirect(`/translations/${translationId}?error=${encodeURIComponent(error.message)}`);
  }

  await writeAdminAuditLog({
    action: 'translation.metadata.update',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: translationId,
    entityType: 'translation',
    metadata: {
      adminNotes,
      distributionState,
      isAvailable,
    },
    summary: `Updated EveryBible-local metadata for ${translationId}.`,
  });

  revalidatePath('/translations');
  revalidatePath(`/translations/${translationId}`);
  revalidatePath('/health');
  redirect(`/translations/${translationId}?notice=Translation metadata saved`);
}
