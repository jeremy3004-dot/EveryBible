export interface CspViolationSummary {
  directive: string;
  blocked: string;
  document: string;
  source: string;
}

type ReportFields = Record<string, unknown>;

const MAX_REPORTS_PER_REQUEST = 10;

function text(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 300) : '';
}

function summarize(report: ReportFields): CspViolationSummary {
  return {
    directive: text(report['effective-directive'] ?? report.effectiveDirective),
    blocked: text(report['blocked-uri'] ?? report.blockedURL),
    document: text(report['document-uri'] ?? report.documentURL),
    source: text(report['source-file'] ?? report.sourceFile),
  };
}

/**
 * Normalizes both report formats: the legacy `{ "csp-report": {...} }` body sent for
 * `report-uri`, and the Reporting API's `[{ type: "csp-violation", body: {...} }]` array.
 * Anything else is ignored.
 */
export function parseCspReports(body: unknown): CspViolationSummary[] {
  const entries = Array.isArray(body) ? body : [body];
  const summaries: CspViolationSummary[] = [];
  for (const entry of entries.slice(0, MAX_REPORTS_PER_REQUEST)) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as ReportFields;
    const report = record['csp-report'] ?? (record.type === 'csp-violation' ? record.body : null);
    if (report && typeof report === 'object') summaries.push(summarize(report as ReportFields));
  }
  return summaries;
}
