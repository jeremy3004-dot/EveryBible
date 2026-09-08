"""Measure an installed release build; never install, clear data, or reset a device."""
import argparse
import json
import statistics
import subprocess
import time
from pathlib import Path
from android_startup_metrics import parse_startup_sample


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
    deadline = time.monotonic() + 15
    while True:
        logs = adb('logcat', '-d', '-v', 'epoch', '-s', 'EBPerf:I', 'ReactNativeJS:I', 'AndroidRuntime:E')
        current_logs = logs.split(marker, 1)[-1] if marker in logs else ''
        if ('Home:interaction-ready' in current_logs or 'FATAL EXCEPTION' in current_logs
                or time.monotonic() >= deadline):
            break
        time.sleep(0.25)
    sample = parse_startup_sample(launch, logs, marker, run)
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
    'medianHomeInteractionReadyMs': statistics.median(row['homeInteractionReadyMs'] for row in samples),
    'limitation': 'Home readiness is layout plus completed interactions and an animation-frame callback; verify actual taps separately. It is not verse content readiness or frame smoothness.',
}
args.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
