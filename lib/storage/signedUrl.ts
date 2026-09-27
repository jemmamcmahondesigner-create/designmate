import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * TTL for in-app private-object reads. One hour covers a typical review
 * session (read, comment, switch tabs) and is short enough that a leaked
 * URL is useless after lunch. Page loads mint a fresh URL. Emails and
 * other long-lived contexts must not use this — they belong in
 * `public-assets` or a server proxy.
 */
export const PRIVATE_STORAGE_TTL_SECONDS = 60 * 60;

export const STORAGE_BUCKET = {
  projectReferences: "project-references",
  reviewArtifacts: "review-artifacts",
  artifactSnapshots: "artifact-snapshots",
  publicAssets: "public-assets",
} as const;

export type StorageObjectRef = {
  bucket: string;
  path: string;
};

const PUBLIC_OBJECT_RE = /\/storage\/v1\/object\/public\/([^/?#]+)\/(.+?)(?:\?|#|$)/;
const SIGNED_OBJECT_RE = /\/storage\/v1\/object\/sign\/([^/?#]+)\/(.+?)(?:\?|#|$)/;
const STORAGE_SCHEME_RE = /^storage:\/\/([^/]+)\/(.+)$/;

function decodePath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function parseStorageObjectRef(
  value: string | null | undefined,
  fallbackBucket?: string,
): StorageObjectRef | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const publicMatch = raw.match(PUBLIC_OBJECT_RE);
  if (publicMatch) {
    return { bucket: decodePath(publicMatch[1]), path: decodePath(publicMatch[2]) };
  }

  const signedMatch = raw.match(SIGNED_OBJECT_RE);
  if (signedMatch) {
    return { bucket: decodePath(signedMatch[1]), path: decodePath(signedMatch[2]) };
  }

  const schemeMatch = raw.match(STORAGE_SCHEME_RE);
  if (schemeMatch) {
    return { bucket: decodePath(schemeMatch[1]), path: decodePath(schemeMatch[2]) };
  }

  if (
    fallbackBucket &&
    !raw.startsWith("http://") &&
    !raw.startsWith("https://")
  ) {
    return { bucket: fallbackBucket, path: raw.replace(/^\//, "") };
  }

  return null;
}

/** Persist a path for private objects; leave external https URLs alone. */
export function persistableStorageValue(
  value: string | null | undefined,
  fallbackBucket?: string,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const ref = parseStorageObjectRef(raw, fallbackBucket);
  if (ref) return ref.path;
  return raw;
}

export async function createSignedStorageUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = PRIVATE_STORAGE_TTL_SECONDS,
): Promise<string | null> {
  const objectPath = path.trim();
  if (!objectPath) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresIn);
  if (error || !data?.signedUrl) {
    console.error("createSignedUrl failed:", bucket, objectPath, error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function resolveViewableStorageUrl(
  supabase: SupabaseClient,
  input: {
    url?: string | null;
    storagePath?: string | null;
    bucket: string;
  },
): Promise<string | null> {
  const fromPath = String(input.storagePath ?? "").trim();
  if (fromPath) {
    const signed = await createSignedStorageUrl(supabase, input.bucket, fromPath);
    if (signed) return signed;
  }

  const ref = parseStorageObjectRef(input.url, input.bucket);
  if (ref) {
    return createSignedStorageUrl(supabase, ref.bucket, ref.path);
  }

  const raw = String(input.url ?? "").trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return null;
}

export async function signProjectReferenceUrls<
  T extends { url: string | null; storage_path: string | null },
>(supabase: SupabaseClient, rows: T[]): Promise<T[]> {
  await Promise.all(
    rows.map(async (row) => {
      const signed = await resolveViewableStorageUrl(supabase, {
        url: row.url,
        storagePath: row.storage_path,
        bucket: STORAGE_BUCKET.projectReferences,
      });
      if (signed) row.url = signed;
    }),
  );
  return rows;
}
