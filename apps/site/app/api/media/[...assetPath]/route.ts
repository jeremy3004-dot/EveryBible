import { Readable } from 'node:stream';

import { GetObjectCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3';

import {
  getBibleMediaClient,
  getBibleMediaEnv,
  resolveLegacyBibleMediaUrl,
  resolveBibleMediaObjectKey,
} from '../../../../lib/bible-media';

export const dynamic = 'force-dynamic';

function getResponseHeaders(result: GetObjectCommandOutput): Headers {
  const headers = new Headers();

  if (result.ContentType) {
    headers.set('content-type', result.ContentType);
  }

  if (typeof result.ContentLength === 'number' && Number.isFinite(result.ContentLength)) {
    headers.set('content-length', `${result.ContentLength}`);
  }

  if (result.ETag) {
    headers.set('etag', result.ETag);
  }

  headers.set('cache-control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  return headers;
}

function resolveBodyStream(body: GetObjectCommandOutput['Body']): ReadableStream | null {
  if (!body) {
    return null;
  }

  if (typeof body.transformToWebStream === 'function') {
    return body.transformToWebStream();
  }

  if (body instanceof Readable) {
    return Readable.toWeb(body) as ReadableStream;
  }

  return null;
}

function isMissingObjectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'NoSuchKey' || error.name === 'NotFound';
}

interface RouteContext {
  params: Promise<{
    assetPath?: string[];
  }>;
}

async function fetchLegacyMediaResponse(
  request: Request,
  objectKey: string
): Promise<Response | null> {
  const legacyUrl = resolveLegacyBibleMediaUrl(objectKey);
  if (!legacyUrl) {
    return null;
  }

  const response = await fetch(legacyUrl, {
    headers: {
      Accept: request.headers.get('accept') ?? '*/*',
      Range: request.headers.get('range') ?? '',
    },
    method: request.method,
  });

  if (!response.ok) {
    return null;
  }

  return new Response(request.method === 'HEAD' ? null : response.body, {
    headers: response.headers,
    status: response.status,
  });
}

async function handleRequest(request: Request, context: RouteContext): Promise<Response> {
  const { assetPath = [] } = await context.params;
  const objectKey = resolveBibleMediaObjectKey(assetPath);

  if (!objectKey) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const env = getBibleMediaEnv();
    const client = getBibleMediaClient(env);
    const result = await client.send(
      new GetObjectCommand({
        Bucket: env.bucket,
        Key: objectKey,
      })
    );
    const bodyStream = resolveBodyStream(result.Body);

    if (!bodyStream) {
      return new Response('Not found', { status: 404 });
    }

    return new Response(bodyStream, {
      headers: getResponseHeaders(result),
      status: 200,
    });
  } catch (error) {
    if (isMissingObjectError(error)) {
      const legacyResponse = await fetchLegacyMediaResponse(request, objectKey);
      return legacyResponse ?? new Response('Not found', { status: 404 });
    }

    throw error;
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleRequest(request, context);
}

export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
  return handleRequest(request, context);
}
