import { Readable } from 'node:stream';

import { GetObjectCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3';

import {
  getBibleMediaClient,
  getBibleMediaEnv,
  resolveBibleMediaObjectKey,
} from '../../../../lib/bible-media';

export const dynamic = 'force-dynamic';

const RANGE_NOT_SATISFIABLE_HEADERS = {
  'accept-ranges': 'bytes',
  'content-range': 'bytes */*',
};

function resolveRequestRange(request: Request): string | null | false {
  const rangeHeader = request.headers.get('range')?.trim();

  if (!rangeHeader) {
    return null;
  }

  if (rangeHeader.includes(',')) {
    return false;
  }

  const match = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/.exec(rangeHeader);

  if (!match || (!match[1] && !match[2])) {
    return null;
  }

  if (match[1] && match[2] && Number(match[1]) > Number(match[2])) {
    return false;
  }

  return `bytes=${match[1]}-${match[2]}`;
}

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

  if (result.ContentRange) {
    headers.set('content-range', result.ContentRange);
  }

  headers.set('accept-ranges', result.AcceptRanges || 'bytes');
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

function isInvalidRangeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'InvalidRange' || error.name === 'RequestedRangeNotSatisfiable';
}

interface RouteContext {
  params: Promise<{
    assetPath?: string[];
  }>;
}

async function handleRequest(request: Request, context: RouteContext): Promise<Response> {
  const { assetPath = [] } = await context.params;
  const objectKey = resolveBibleMediaObjectKey(assetPath);

  if (!objectKey) {
    return new Response('Not found', { status: 404 });
  }

  const requestRange = resolveRequestRange(request);

  if (requestRange === false) {
    return new Response(null, {
      headers: RANGE_NOT_SATISFIABLE_HEADERS,
      status: 416,
    });
  }

  try {
    const env = getBibleMediaEnv();
    const client = getBibleMediaClient(env);
    const result = await client.send(
      new GetObjectCommand({
        Bucket: env.bucket,
        Key: objectKey,
        Range: requestRange || undefined,
      })
    );
    const bodyStream = request.method === 'HEAD' ? null : resolveBodyStream(result.Body);

    if (request.method !== 'HEAD' && !bodyStream) {
      return new Response('Not found', { status: 404 });
    }

    return new Response(bodyStream, {
      headers: getResponseHeaders(result),
      status: result.ContentRange ? 206 : 200,
    });
  } catch (error) {
    if (isMissingObjectError(error)) {
      return new Response('Not found', { status: 404 });
    }

    if (isInvalidRangeError(error)) {
      return new Response(null, {
        headers: RANGE_NOT_SATISFIABLE_HEADERS,
        status: 416,
      });
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
