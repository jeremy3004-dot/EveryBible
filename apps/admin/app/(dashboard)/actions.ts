'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminServiceClient } from '@/lib/supabase/service';
import { normalizeOptionalString, parseDateTimeInput, slugifyFilename } from '@/lib/format';
import { requireAdminIdentity } from '@/lib/admin-auth';
import { writeAdminAuditLog } from '@/lib/audit-log';
import { runUpstreamTranslationSync } from '@/lib/upstream-sync';

async function lookupVerseSnapshot(
  translationId: string,
  bookId: string,
  chapter: number,
  verse: number
) {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('bible_verses')
    .select('text')
    .eq('translation_id', translationId)
    .eq('book_id', bookId)
    .eq('chapter', chapter)
    .eq('verse', verse)
    .maybeSingle<{ text: string }>();

  if (error) {
    throw new Error(`Unable to load verse snapshot: ${error.message}`);
  }

  if (!data) {
    throw new Error('That verse is not present in the synced Bible library yet.');
  }

  return {
    referenceLabel: `${bookId} ${chapter}:${verse} (${translationId})`,
    verseText: data.text,
  };
}

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

export async function saveVerseOfDayAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const id = normalizeOptionalString(formData.get('id'));
  const translationId = normalizeOptionalString(formData.get('translationId'));
  const bookId = normalizeOptionalString(formData.get('bookId'));
  const chapter = Number(formData.get('chapter'));
  const verse = Number(formData.get('verse'));

  if (!translationId || !bookId || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
    redirect('/content/verse-of-day?error=Translation, book, chapter, and verse are required');
  }

  const snapshot = await lookupVerseSnapshot(translationId, bookId, chapter, verse);
  const payload = {
    book_id: bookId,
    chapter,
    created_by: id ? undefined : admin.id,
    ends_at: parseDateTimeInput(formData.get('endsAt')),
    id: id ?? undefined,
    image_id: normalizeOptionalString(formData.get('imageId')),
    reflection: normalizeOptionalString(formData.get('reflection')),
    reference_label: snapshot.referenceLabel,
    starts_at: parseDateTimeInput(formData.get('startsAt')),
    state: normalizeOptionalString(formData.get('state')) ?? 'draft',
    title: normalizeOptionalString(formData.get('title')),
    translation_id: translationId,
    updated_by: admin.id,
    verse,
    verse_text: snapshot.verseText,
  };

  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('verse_of_day_entries')
    .upsert(payload)
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    redirect(`/content/verse-of-day?error=${encodeURIComponent(error?.message ?? 'Unable to save entry')}`);
  }

  await writeAdminAuditLog({
    action: 'verse_of_day.upsert',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: data.id,
    entityType: 'verse_of_day_entry',
    metadata: {
      targetUserId: null,
      translationId,
      bookId,
      chapter,
      verse,
      state: payload.state,
    },
    summary: `Saved verse-of-the-day entry ${snapshot.referenceLabel}.`,
  });

  revalidatePath('/content/verse-of-day');
  revalidatePath('/health');
  redirect('/content/verse-of-day?notice=Verse of the Day saved');
}

export async function archiveVerseOfDayAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const id = normalizeOptionalString(formData.get('id'));

  if (!id) {
    redirect('/content/verse-of-day?error=Missing entry id');
  }

  const service = createAdminServiceClient();
  const { error } = await service
    .from('verse_of_day_entries')
    .update({ state: 'archived', updated_by: admin.id })
    .eq('id', id);

  if (error) {
    redirect(`/content/verse-of-day?error=${encodeURIComponent(error.message)}`);
  }

  await writeAdminAuditLog({
    action: 'verse_of_day.archive',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: id,
    entityType: 'verse_of_day_entry',
    summary: 'Archived a verse-of-the-day entry.',
  });

  revalidatePath('/content/verse-of-day');
  revalidatePath('/health');
  redirect('/content/verse-of-day?notice=Entry archived');
}

export async function uploadContentImageAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const file = formData.get('file');
  const title = normalizeOptionalString(formData.get('title'));
  const kind = normalizeOptionalString(formData.get('kind'));
  const altText = normalizeOptionalString(formData.get('altText'));

  if (!(file instanceof File) || !title || !kind || !altText) {
    redirect('/content/images?error=Image, title, kind, and alt text are required');
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${kind}/${slugifyFilename(title)}-${Date.now()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const service = createAdminServiceClient();
  const uploadResult = await service.storage.from('content-images').upload(path, buffer, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });

  if (uploadResult.error) {
    redirect(`/content/images?error=${encodeURIComponent(uploadResult.error.message)}`);
  }

  const { data: publicUrlData } = service.storage.from('content-images').getPublicUrl(path);

  const { data, error } = await service
    .from('content_images')
    .insert({
      alt_text: altText,
      caption: normalizeOptionalString(formData.get('caption')),
      kind,
      public_url: publicUrlData.publicUrl,
      starts_at: parseDateTimeInput(formData.get('startsAt')),
      state: normalizeOptionalString(formData.get('state')) ?? 'draft',
      storage_path: path,
      title,
      uploaded_by: admin.id,
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    redirect(`/content/images?error=${encodeURIComponent(error?.message ?? 'Unable to save image')}`);
  }

  await writeAdminAuditLog({
    action: 'content_image.upload',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: data.id,
    entityType: 'content_image',
    metadata: { kind, path, title },
    summary: `Uploaded content image "${title}".`,
  });

  revalidatePath('/content/images');
  revalidatePath('/health');
  redirect('/content/images?notice=Image uploaded');
}

export async function updateContentImageAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const id = normalizeOptionalString(formData.get('id'));

  if (!id) {
    redirect('/content/images?error=Missing image id');
  }

  const payload = {
    alt_text: normalizeOptionalString(formData.get('altText')) ?? 'EveryBible content image',
    caption: normalizeOptionalString(formData.get('caption')),
    ends_at: parseDateTimeInput(formData.get('endsAt')),
    starts_at: parseDateTimeInput(formData.get('startsAt')),
    state: normalizeOptionalString(formData.get('state')) ?? 'draft',
    title: normalizeOptionalString(formData.get('title')) ?? 'Untitled image',
  };

  const service = createAdminServiceClient();
  const { error } = await service.from('content_images').update(payload).eq('id', id);

  if (error) {
    redirect(`/content/images?error=${encodeURIComponent(error.message)}`);
  }

  await writeAdminAuditLog({
    action: 'content_image.update',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: id,
    entityType: 'content_image',
    metadata: payload,
    summary: `Updated content image ${id}.`,
  });

  revalidatePath('/content/images');
  revalidatePath('/health');
  redirect('/content/images?notice=Image updated');
}
