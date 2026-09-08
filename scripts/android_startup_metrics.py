"""Pure parsing for startup probes; missing readiness is a failed sample."""
import re


def parse_startup_sample(launch, logs, marker, run):
    start = re.search(r'(\d+\.\d+)\s+.*EBPerf\s*: ' + re.escape(marker), logs)
    if not start:
        raise RuntimeError('Missing start marker; no timing may be inferred')
    current_logs = logs[start.end():]
    if 'FATAL EXCEPTION' in current_logs or 'supabaseUrl is required' in current_logs:
        raise RuntimeError('Runtime failure invalidates the sample')
    module = re.search(r'(\d+\.\d+)\s+.*App:module-start', current_logs)
    native = re.search(r'TotalTime: (\d+)', launch)
    home = re.search(r'(\d+\.\d+)\s+.*Home:interaction-ready', current_logs)
    if not (module and native):
        raise RuntimeError('Missing startup marker; no timing may be inferred')
    if not home:
        raise RuntimeError('Missing Home readiness marker; complete onboarding and unlock the app before measuring')
    return {
        'run': run,
        'activityDisplayMs': int(native[1]),
        'appModuleReadyMs': round((float(module[1]) - float(start[1])) * 1000),
        'homeInteractionReadyMs': round((float(home[1]) - float(start[1])) * 1000),
    }
