import type { SupabaseClient } from '@supabase/supabase-js';



export function formatChangeRequestDisplayLabel(

  batchNumber: number | null | undefined,

  changeNumber: number | null | undefined,

): string | null {

  if (

    batchNumber != null &&

    Number.isFinite(Number(batchNumber)) &&

    changeNumber != null &&

    Number.isFinite(Number(changeNumber))

  ) {

    return `Change ${batchNumber}.${changeNumber}`;

  }

  if (changeNumber != null && Number.isFinite(Number(changeNumber))) {

    return `Change ${changeNumber}`;

  }

  return null;

}



/** Resolve batch_id / batch_number / change_number for the next insert in a submission batch. */

export async function resolveNextChangeRequestNumbers(

  supabase: SupabaseClient,

  reviewId: string,

  batchIdInput?: string | null,

): Promise<{ batchId: string; batchNumber: number; changeNumber: number }> {

  const batchId = batchIdInput?.trim() || crypto.randomUUID();



  const { data: sameBatchRows } = await supabase

    .from('change_requests')

    .select('batch_number, change_number')

    .eq('review_id', reviewId)

    .eq('batch_id', batchId);



  if ((sameBatchRows ?? []).length > 0) {

    const batchNumber = Number(

      (sameBatchRows as Array<{ batch_number?: number | null }>)[0]?.batch_number ?? 1,

    );

    const maxInBatch = (sameBatchRows ?? []).reduce((max, row) => {

      const n = Number((row as { change_number?: number | null }).change_number ?? 0);

      return Number.isFinite(n) && n > max ? n : max;

    }, 0);

    return {

      batchId,

      batchNumber: Number.isFinite(batchNumber) && batchNumber > 0 ? batchNumber : 1,

      changeNumber: maxInBatch + 1,

    };

  }



  const { data: batchRows } = await supabase

    .from('change_requests')

    .select('batch_id, batch_number')

    .eq('review_id', reviewId)

    .not('batch_id', 'is', null);



  const batchNumbers = new Set<number>();

  for (const row of batchRows ?? []) {

    const n = Number((row as { batch_number?: number | null }).batch_number ?? NaN);

    if (Number.isFinite(n) && n > 0) batchNumbers.add(n);

  }

  const distinctBatchIds = new Set(

    (batchRows ?? [])

      .map((row) => String((row as { batch_id?: string | null }).batch_id ?? '').trim())

      .filter(Boolean),

  );



  const nextBatchNumber =

    batchNumbers.size > 0

      ? Math.max(...batchNumbers) + 1

      : distinctBatchIds.size + 1;



  return {

    batchId,

    batchNumber: Math.max(1, nextBatchNumber),

    changeNumber: 1,

  };

}



/** Assign sequential numbers within one new batch (Compare final decision multi-insert). */

export async function resolveBatchStartForNewSubmission(

  supabase: SupabaseClient,

  reviewId: string,

  batchId?: string,

): Promise<{ batchId: string; batchNumber: number; startChangeNumber: number }> {

  const first = await resolveNextChangeRequestNumbers(supabase, reviewId, batchId);

  return {

    batchId: first.batchId,

    batchNumber: first.batchNumber,

    startChangeNumber: first.changeNumber,

  };

}

