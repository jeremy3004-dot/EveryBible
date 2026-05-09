import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type SourceKind = 'pdf' | 'office' | 'html' | 'scan' | 'unknown';
type SourceLocation = 'local' | 'remote';
type ReviewState = 'ready' | 'needs_review' | 'reject';

type CliOptions = {
  source: string;
  kind: SourceKind;
  out: string;
};

type PreflightFinding = {
  severity: 'info' | 'warning' | 'error';
  message: string;
};

type RequiredGate = {
  id: string;
  status: 'required';
  source: string;
  description: string;
};

type DoclingPreflightManifest = {
  source: string;
  kind: SourceKind;
  detected: {
    location: SourceLocation;
    exists?: boolean;
    extension?: string;
  };
  timestamp: string;
  recommendedExecutionMode: string;
  requiredGates: RequiredGate[];
  state: ReviewState;
  findings: PreflightFinding[];
};

const DEFAULT_OUT = path.join('tmp', 'docling-preflight.json');
const ROADMAP_SOURCE = 'docs/oss/audio-ingestion-roadmap.md';
const SUPPORTED_KINDS = new Set<SourceKind>(['pdf', 'office', 'html', 'scan', 'unknown']);

const DOC_TYPES: Record<Exclude<SourceKind, 'unknown'>, Set<string>> = {
  pdf: new Set(['.pdf']),
  office: new Set(['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.odt', '.odp', '.ods']),
  html: new Set(['.html', '.htm']),
  scan: new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.pdf']),
};

const REQUIRED_GATES: RequiredGate[] = [
  {
    id: 'server-side-only',
    status: 'required',
    source: ROADMAP_SOURCE,
    description:
      'Docling must run only in a server-side worker, batch job, or MCP-backed ingestion service; never in the React Native mobile runtime.',
  },
  {
    id: 'private-staging',
    status: 'required',
    source: ROADMAP_SOURCE,
    description:
      'Original source files and generated Docling artifacts must remain in private staging until reviewed and promoted.',
  },
  {
    id: 'checksums',
    status: 'required',
    source: ROADMAP_SOURCE,
    description:
      'Preserve source file checksums and Docling output checksums before any promotion step.',
  },
  {
    id: 'canonical-validation',
    status: 'required',
    source: ROADMAP_SOURCE,
    description:
      'Validate generated verse and chapter mappings against canonical book and chapter counts.',
  },
  {
    id: 'license-provenance',
    status: 'required',
    source: ROADMAP_SOURCE,
    description:
      'Capture source name, URL, owner or publisher, license identifier, license URL, attribution, redistribution terms, and reviewer provenance before promotion.',
  },
  {
    id: 'human-review-for-ocr',
    status: 'required',
    source: ROADMAP_SOURCE,
    description:
      'OCR, table extraction, and scripture-reference mapping need human review or deterministic validation before trust.',
  },
  {
    id: 'no-public-availability',
    status: 'required',
    source: ROADMAP_SOURCE,
    description:
      'Failed or unreviewed conversions cannot set has_audio or equivalent public availability flags.',
  },
  {
    id: 'rollback-ready',
    status: 'required',
    source: ROADMAP_SOURCE,
    description:
      'Previous good versions and original source files must remain available so bad Docling conversions can be rejected or quarantined.',
  },
];

function parseArgs(argv: string[]): CliOptions {
  let source = '';
  let kind: SourceKind = 'unknown';
  let out = DEFAULT_OUT;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--source' && argv[index + 1]) {
      source = argv[index + 1]!;
      index += 1;
      continue;
    }

    if (arg === '--kind' && argv[index + 1]) {
      const parsedKind = argv[index + 1]!;
      if (!SUPPORTED_KINDS.has(parsedKind as SourceKind)) {
        throw new Error(
          `Unsupported --kind "${parsedKind}". Use pdf, office, html, scan, or unknown.`
        );
      }
      kind = parsedKind as SourceKind;
      index += 1;
      continue;
    }

    if (arg === '--out' && argv[index + 1]) {
      out = argv[index + 1]!;
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument "${arg}".`);
  }

  if (!source) {
    throw new Error('Missing required --source <path-or-url>.');
  }

  return { source, kind, out };
}

function detectLocation(source: string): SourceLocation {
  try {
    const url = new URL(source);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return 'remote';
    }
  } catch {
    // Not a URL; treat as a local path.
  }

  return 'local';
}

function isRejectedScheme(source: string): boolean {
  try {
    const url = new URL(source);
    return !['http:', 'https:', 'file:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function extensionFor(source: string, location: SourceLocation): string | undefined {
  const rawPath = location === 'remote' ? new URL(source).pathname : source;
  const extension = path.extname(rawPath).toLowerCase();
  return extension || undefined;
}

function extensionMatchesKind(kind: SourceKind, extension?: string): boolean {
  if (kind === 'unknown' || !extension) {
    return true;
  }

  return DOC_TYPES[kind].has(extension);
}

async function buildManifest(
  options: CliOptions,
  now = new Date()
): Promise<DoclingPreflightManifest> {
  const location = detectLocation(options.source);
  const extension = extensionFor(options.source, location);
  const findings: PreflightFinding[] = [];
  let exists: boolean | undefined;

  if (isRejectedScheme(options.source)) {
    findings.push({
      severity: 'error',
      message: 'Only local paths and http(s) URLs are accepted for Docling ingestion preflight.',
    });
  }

  if (location === 'local') {
    try {
      const fileStat = await stat(options.source);
      exists = fileStat.isFile() || fileStat.isDirectory();
      if (!exists) {
        findings.push({
          severity: 'error',
          message: 'Local source exists but is not a file or directory.',
        });
      }
    } catch {
      exists = false;
      findings.push({
        severity: 'error',
        message:
          'Local source does not exist. Preflight cannot hand off a missing file to a server-side job.',
      });
    }
  } else {
    findings.push({
      severity: 'warning',
      message:
        'Remote source was classified without fetching it. A server-side job must download, checksum, and stage it privately.',
    });
  }

  if (options.kind === 'unknown') {
    findings.push({
      severity: 'warning',
      message: 'Unknown kind requires operator review before Docling conversion.',
    });
  }

  if (options.kind === 'scan') {
    findings.push({
      severity: 'warning',
      message:
        'Scan/OCR inputs require human review or deterministic canonical validation before promotion.',
    });
  }

  if (!extensionMatchesKind(options.kind, extension)) {
    findings.push({
      severity: 'warning',
      message: `Source extension ${extension ?? '(none)'} does not match declared kind ${options.kind}.`,
    });
  }

  const state: ReviewState = findings.some((finding) => finding.severity === 'error')
    ? 'reject'
    : findings.some((finding) => finding.severity === 'warning')
      ? 'needs_review'
      : 'ready';

  return {
    source: options.source,
    kind: options.kind,
    detected: {
      location,
      exists,
      extension,
    },
    timestamp: now.toISOString(),
    recommendedExecutionMode:
      'Docling server-side only: run in a worker, batch job, or MCP-backed ingestion service after private staging; do not import Docling into React Native or mobile code.',
    requiredGates: REQUIRED_GATES,
    state,
    findings,
  };
}

async function writeManifest(manifest: DoclingPreflightManifest, out: string): Promise<void> {
  const outPath = path.resolve(out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await buildManifest(options);
  await writeManifest(manifest, options.out);
  console.log(`Wrote Docling ingestion preflight manifest to ${options.out}`);
  if (manifest.state === 'reject') {
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export {
  DEFAULT_OUT,
  REQUIRED_GATES,
  buildManifest,
  parseArgs,
  writeManifest,
  type DoclingPreflightManifest,
  type SourceKind,
};
