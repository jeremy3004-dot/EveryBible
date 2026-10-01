#!/usr/bin/env python3
"""Timing harness for EveryBible release builds on an iOS simulator.

Method and results: docs/research/ios-profiling-2026-10-01.md. In short: build Release
for the simulator with EXPO_PUBLIC_EB_PERF_MARKS=1 (src/services/diagnostics/perfMarks.ts)
and, for profiles, link EBHermesProfiler.mm. This script reads the app's `[EB-T]`/`[EB-P]`
lines (name + epoch ms) from the simulator's unified log and lines them up with the app
process's kernel start time; a simulator app is a Mac process, so Date.now() in the app
and the host clock agree. Interaction latency is measured from the root `touch:end` mark
to the screen's own mark. Taps go through fb-idb (`pip install fb-idb`; set EB_IDB).

  ebperf.py cold N                       N cold starts to Home
  ebperf.py scenario N OUT.json          N x (cold start + reader/audio/tab interactions)
  ebperf.py profile-cold OUT.json        cold start with the Hermes sampling profiler
  ebperf.py profile-scenario OUT.json    one scenario with the Hermes sampling profiler
  ebperf.py native-sample OUT.txt        `sample` the whole launch (needs the shim's gate)
  ebperf.py ab APPDIR B1,B2 ROUNDS PER   interleave scenarios across APPDIR/<B>.app builds

Environment: EB_UDID (simulator), EB_IDB (idb binary). Tap coordinates are for an
iPhone 17 (402 x 874 pt) with a reader position of Psalm 119 (open it once first).
"""
import ctypes
import json
import os
import re
import statistics
import subprocess
import sys
import threading
import time

UDID = os.environ.get('EB_UDID', 'booted')
BUNDLE = 'com.everybible.app'
IDB = os.environ.get('EB_IDB', 'idb')
MARK_RE = re.compile(r"\[(EB-[TP])\] ([^\s',]+)'?,? (\d{13})(?: (.*))?")


def proc_start_ms(pid):
    """Kernel start time of a process (sysctl KERN_PROC_PID), epoch ms."""
    libc = ctypes.CDLL('/usr/lib/libc.dylib')
    mib = (ctypes.c_int * 4)(1, 14, 1, pid)  # CTL_KERN, KERN_PROC, KERN_PROC_PID
    buf = ctypes.create_string_buffer(1024)
    size = ctypes.c_size_t(1024)
    if libc.sysctl(mib, 4, buf, ctypes.byref(size), None, 0) != 0:
        raise OSError('sysctl failed')
    sec = int.from_bytes(buf.raw[0:8], 'little')
    usec = int.from_bytes(buf.raw[8:12], 'little', signed=True)
    return sec * 1000 + usec / 1000


def uptime_offset_ms():
    """Epoch ms minus mach_absolute_time ms; Hermes trace timestamps use the latter."""
    return time.time() * 1000 - time.clock_gettime_ns(time.CLOCK_UPTIME_RAW) / 1e6


class LogStream:
    """Collects [EB-T]/[EB-P] marks from the simulator's unified log."""

    def __init__(self):
        self.marks = []  # (kind, name, epoch_ms, detail, host_ms)
        self.lock = threading.Lock()
        self.proc_start = None
        self.proc = subprocess.Popen(
            ['xcrun', 'simctl', 'spawn', UDID, 'log', 'stream', '--level', 'info', '--style', 'ndjson',
             '--predicate', 'eventMessage CONTAINS "[EB-"'],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
        threading.Thread(target=self._read, daemon=True).start()
        time.sleep(1.5)

    def _read(self):
        for line in self.proc.stdout:
            try:
                msg = json.loads(line).get('eventMessage', '')
            except ValueError:
                continue
            m = MARK_RE.search(msg)
            if m:
                with self.lock:
                    self.marks.append((m.group(1), m.group(2), int(m.group(3)), m.group(4), time.time() * 1000))

    def clear(self):
        with self.lock:
            self.marks.clear()

    def wait_for(self, name, detail=None, timeout=30.0, after_ms=0):
        end = time.time() + timeout
        while time.time() < end:
            with self.lock:
                for mk in self.marks:
                    if mk[1] == name and mk[2] >= after_ms and (detail is None or (mk[3] or '').endswith(detail)):
                        return mk
            time.sleep(0.02)
        return None

    def find(self, name, after_ms=0):
        with self.lock:
            return [mk for mk in self.marks if mk[1] == name and mk[2] >= after_ms]

    def close(self):
        self.proc.terminate()


def simctl(*args, check=True, env=None):
    return subprocess.run(['xcrun', 'simctl', *args], capture_output=True, text=True, check=check, env=env)


def container():
    return simctl('get_app_container', UDID, BUNDLE, 'data').stdout.strip()


def terminate():
    simctl('terminate', UDID, BUNDLE, check=False)
    time.sleep(0.8)


def launch(extra_env=None):
    env = dict(os.environ)
    for key, value in (extra_env or {}).items():
        env['SIMCTL_CHILD_' + key] = value
    out = simctl('launch', UDID, BUNDLE, env=env).stdout.strip()
    return int(out.split(':')[-1].strip())


def tap(x, y):
    t0 = time.time() * 1000
    subprocess.run([IDB, 'ui', 'tap', str(x), str(y), '--udid', UDID], check=True, capture_output=True)
    return t0


def cold_start(log, extra_env=None, settle=2.0, timeout=40):
    terminate()
    log.clear()
    pid = launch(extra_env)
    t0 = proc_start_ms(pid)
    log.proc_start = t0
    ready = log.wait_for('Home:interaction-ready', timeout=timeout, after_ms=t0)
    time.sleep(settle)
    res = {'pid': pid, 'ok': ready is not None, 'marks': {}}
    with log.lock:
        for _, name, ms, detail, _ in log.marks:
            if ms >= t0 - 1000 and name not in res['marks']:
                res['marks'][name] = {'start': round(ms - t0), 'detail': detail} if name.startswith('rctpl:') else round(ms - t0)
    for name in ('App:module-start', 'home:first-layout', 'Home:interaction-ready'):
        res[name] = res['marks'].get(name)
    return res


def interact(log, x, y, mark, detail=None, timeout=10.0, settle=1.5):
    t_host = tap(x, y)
    mk = log.wait_for(mark, detail, timeout=timeout, after_ms=t_host)
    res = {'mark': mark, 'detail': detail, 'ok': mk is not None}
    if mk:
        touches = [t for t in log.find('touch:end', after_ms=t_host - 50) if t[2] <= mk[2]]
        res['touch_to_mark'] = mk[2] - touches[-1][2] if touches else None
        if mark == 'reader:painted' and touches:
            committed = [c for c in log.find('reader:committed', after_ms=touches[-1][2])
                         if (c[3] or '').endswith(detail or '')]
            res['touch_to_committed'] = committed[0][2] - touches[-1][2] if committed else None
    time.sleep(settle)
    return res


# iPhone 17 (402 x 874 pt)
TAB = {'Home': 57, 'Bible': 129, 'Learn': 201, 'Plans': 272, 'More': 343}
TAB_Y = 822
CONTINUE_CARD = (117, 655)
NEXT_CHAPTER = (257, 758)
PREVIOUS_CHAPTER = (145, 758)
AUDIO_BUTTON = (271, 88)
AUDIO_CLOSE = (366, 137)


def hprof_start():
    simctl('spawn', UDID, 'notifyutil', '-p', 'com.everybible.hprof.start')


def hprof_dump(dest, wait=4.0):
    docs = os.path.join(container(), 'Documents')
    before = {f for f in os.listdir(docs) if f.startswith('hprof-')}
    simctl('spawn', UDID, 'notifyutil', '-p', 'com.everybible.hprof.dump')
    end = time.time() + 30
    while time.time() < end:
        new = [f for f in os.listdir(docs) if f.startswith('hprof-') and f not in before]
        if new:
            time.sleep(wait)
            subprocess.run(['cp', os.path.join(docs, new[0]), dest], check=True)
            os.remove(os.path.join(docs, new[0]))
            return dest
        time.sleep(0.3)
    raise RuntimeError('no profile dumped')


def save_meta(log, dest, extra=None):
    """hprof.cjs reads <trace>.meta.json to put marks and process start on the trace's clock."""
    meta = {'uptime_offset_ms': uptime_offset_ms(), 'proc_start_ms': log.proc_start,
            'marks': [list(m) for m in log.marks]}
    meta.update(extra or {})
    with open(dest + '.meta.json', 'w') as out:
        json.dump(meta, out, indent=1)


PROFILE_ENV = {'EB_HERMES_PROFILE': '1', 'EB_HERMES_PROFILE_HZ': '1000'}


def scenario(log, profile_dest=None):
    """Cold start on Home, then: open the reader from Continue (Psalm 119), next and
    previous chapter, the Audio sheet, then the Gather, Plans, More, Home and Bible tabs."""
    out = {'cold': cold_start(log, extra_env=PROFILE_ENV if profile_dest else None, settle=2.5)}
    if profile_dest:
        hprof_start()  # drop the launch samples; profile-cold covers those
        time.sleep(0.5)
    out['reader_open'] = interact(log, *CONTINUE_CARD, 'reader:painted', 'PSA:119', settle=2.5)
    out['next_chapter'] = interact(log, *NEXT_CHAPTER, 'reader:painted', 'PSA:120')
    out['previous_chapter'] = interact(log, *PREVIOUS_CHAPTER, 'reader:painted', 'PSA:119')
    out['audio_sheet'] = interact(log, *AUDIO_BUTTON, 'audioSheet:painted')
    tap(*AUDIO_CLOSE)
    time.sleep(1.5)
    for tab in ('Learn', 'Plans', 'More', 'Home', 'Bible'):
        out['tab_' + tab] = interact(log, TAB[tab], TAB_Y, 'tab:focus', tab)
    if profile_dest:
        hprof_dump(profile_dest)
        save_meta(log, profile_dest, {'result': out})
    return out


def native_launch_sample(dest, seconds=8, lead=3.0):
    """Hold the launch at +load (EB_LAUNCH_GATE), attach `sample` at 1 ms, then release it.
    `sample` needs a few seconds after printing its banner before it really samples."""
    terminate()
    go = os.path.join(container(), 'tmp', 'eb-go')
    if os.path.exists(go):
        os.remove(go)
    waiter = subprocess.Popen(['xcrun', 'simctl', 'spawn', UDID, 'log', 'stream', '--level', 'debug',
                               '--predicate', 'eventMessage CONTAINS "launch gate waiting"'],
                              stdout=subprocess.PIPE, text=True)
    time.sleep(1.5)
    pid = launch({'EB_LAUNCH_GATE': '1'})
    for line in waiter.stdout:
        if '[EB-PROF] launch gate waiting for' in line:
            break
    waiter.terminate()
    sampler = subprocess.Popen(['sample', str(pid), str(seconds), '1', '-mayDie', '-file', dest],
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    sampler.stdout.readline()
    time.sleep(lead)
    open(go, 'w').close()
    sampler.wait()
    os.remove(go)
    return {'pid': pid}


def summarize(values):
    values = [v for v in values if v is not None]
    if not values:
        return None
    return {'median': statistics.median(values), 'min': min(values), 'max': max(values), 'n': len(values)}


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ''
    if cmd == 'cold':
        log = LogStream()
        rows = [cold_start(log) for _ in range(int(argv[2]))]
        log.close()
        for key in ('App:module-start', 'home:first-layout', 'Home:interaction-ready'):
            print(key, summarize([r[key] for r in rows]))
    elif cmd == 'scenario':
        log = LogStream()
        rows = []
        for _ in range(int(argv[2])):
            rows.append(scenario(log))
            print(json.dumps(rows[-1]), flush=True)
        log.close()
        with open(argv[3], 'w') as out:
            json.dump(rows, out, indent=1)
    elif cmd == 'profile-cold':
        log = LogStream()
        print(cold_start(log, extra_env=PROFILE_ENV, settle=1.0))
        hprof_dump(argv[2])
        save_meta(log, argv[2])
        log.close()
    elif cmd == 'profile-scenario':
        log = LogStream()
        scenario(log, profile_dest=argv[2])
        log.close()
    elif cmd == 'native-sample':
        print(native_launch_sample(argv[2]))
    elif cmd == 'ab':
        app_dir, builds, rounds, per = argv[2], argv[3].split(','), int(argv[4]), int(argv[5])
        results = {b: [] for b in builds}
        for _ in range(rounds):
            for build in builds:
                simctl('install', UDID, os.path.join(app_dir, build + '.app'))
                log = LogStream()
                for _ in range(per):
                    results[build].append(scenario(log))
                log.close()
                with open('results-ab.json', 'w') as out:
                    json.dump(results, out, indent=1)
    else:
        print(__doc__)


if __name__ == '__main__':
    main(sys.argv)
