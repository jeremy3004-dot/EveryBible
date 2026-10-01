/** Records a handled reader failure. The crash queue is loaded only when something failed. */
export function reportReaderFailure(scope: string, error: unknown) {
  void import('../../../services/diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError(scope, error))
    .catch(() => undefined);
}
