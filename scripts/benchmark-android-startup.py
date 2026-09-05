"""Measure an installed release build; never install, clear data, or reset a device."""
import argparse
import json
import re
import statistics
import subprocess
import time
from pathlib import Path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial', required=True, help='Explicit adb device serial')
parser.add_argument('--label', required=True, help='Revision/build being measured')
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--runs', type=int, default=7)
args = parser.parse_args()
if args.runs < 3:
    parser.error('Use at least three measured runs')


def adb(*command):
    return subprocess.check_output(
        ['adb', '-s', args.serial, *command], text=True, timeout=20
    )


device = {
    'model': adb('shell', 'getprop', 'ro.product.model').strip(),
    'api': adb('shell', 'getprop', 'ro.build.version.sdk').strip(),
    'serial': args.serial,
}
samples = []
for run in range(args.runs + 1):
    adb('shell', 'am', 'force-stop', 'com.everybible.app')
    time.sleep(0.5)
    marker = f'START-{time.monotonic_ns()}'
    adb('shell', 'log', '-t', 'EBPerf', marker)
    launch = adb('shell', 'am', 'start', '-W', '-n', 'com.everybible.app/.MainActivity')
    time.sleep(3)
    logs = adb('logcat', '-d', '-v', 'epoch', '-s', 'EBPerf:I', 'ReactNativeJS:I', 'AndroidRuntime:E')
    start = re.search(r'(\d+\.\d+)\s+.*EBPerf\s*: ' + re.escape(marker), logs)
    if not start:
        raise RuntimeError('Missing start marker; no timing may be inferred')
    current_logs = logs[start.end():]
    if 'FATAL EXCEPTION' in current_logs or 'supabaseUrl is required' in current_logs:
        raise RuntimeError('Runtime failure invalidates the sample')
    module = re.search(r'(\d+\.\d+)\s+.*App:module-start', current_logs)
    native = re.search(r'TotalTime: (\d+)', launch)
    if not (start and module and native):
        raise RuntimeError('Missing startup marker; no timing may be inferred')
    sample = {
        'run': run,
        'activityDisplayMs': int(native[1]),
        'appModuleReadyMs': round((float(module[1]) - float(start[1])) * 1000),
    }
    print(json.dumps(sample), flush=True)
    if run:
        samples.append(sample)

result = {
    'label': args.label,
    'device': device,
    'warmups': 1,
    'samples': samples,
    'medianActivityDisplayMs': statistics.median(row['activityDisplayMs'] for row in samples),
    'medianAppModuleReadyMs': statistics.median(row['appModuleReadyMs'] for row in samples),
    'limitation': 'Activity display and App module evaluation are not time-to-interactive or frame smoothness.',
}
args.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
