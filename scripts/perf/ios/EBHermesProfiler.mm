// PROFILING ONLY. Never part of the app target or a shipped build.
//
// Linked into a local Release simulator build to profile EveryBible (see
// docs/research/ios-profiling-2026-10-01.md and scripts/perf/ios/ebperf.py):
//
//   SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
//   xcrun --sdk iphonesimulator clang++ -std=c++20 -fobjc-arc -x objective-c++ \
//     -target arm64-apple-ios15.1-simulator -isysroot "$SDK" -O2 -Wno-arc-performSelector-leaks \
//     -I ios/Pods/hermes-engine/destroot/include -c EBHermesProfiler.mm -o EBHermesProfiler.o
//   libtool -static -o libEBHermesProfiler.a EBHermesProfiler.o
//   EXPO_PUBLIC_EB_PERF_MARKS=1 SOURCEMAP_FILE=/abs/main.map xcodebuild \
//     -workspace ios/EveryBible.xcworkspace -scheme EveryBible -configuration Release \
//     -sdk iphonesimulator -destination id=<UDID> ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
//     'OTHER_LDFLAGS=$(inherited) -force_load /abs/libEBHermesProfiler.a' build
//
// Xcode does not track the archive, so delete the built EveryBible binary to relink.
// Everything here is opt-in per launch through the environment (simctl launch with
// SIMCTL_CHILD_<NAME>):
//   - always: [EB-P] native:<event> marks (+load, didFinishLaunching, JS load and
//     execution, first content) and, 3 s after first content, React Native's
//     RCTPerformanceLogger values as [EB-P] rctpl:<Label> lines;
//   - EB_LAUNCH_GATE=1: hold +load until <data container>/tmp/eb-go exists, so an
//     external sampler can attach before any app work;
//   - EB_HERMES_PROFILE=1 (EB_HERMES_PROFILE_HZ, default 1000): run the Hermes sampling
//     profiler from before the runtime exists. Darwin notifications from the host
//     (xcrun simctl spawn <udid> notifyutil -p <name>) control it:
//       com.everybible.hprof.start  restart sampling (drops earlier samples)
//       com.everybible.hprof.dump   write Documents/hprof-<ms>.json, stop sampling
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#include <notify.h>
#include <unistd.h>
#include <string>
#include <hermes/hermes.h>

using facebook::hermes::IHermesRootAPI;

extern "C" NSString *RCTPLLabelForTag(NSUInteger tag);

static long long EBEpochMs() { return (long long)([[NSDate date] timeIntervalSince1970] * 1000); }
static double EBMediaToEpochOffset() { return [[NSDate date] timeIntervalSince1970] * 1000 - CACurrentMediaTime() * 1000; }
static __weak id EBBridge;

// Native timing marks in the same [EB-P] <name> <epoch ms> format the JS marks use.
static void EBInstallNativeMarks() {
  NSLog(@"[EB-P] native:load %lld", EBEpochMs());
  NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
  [nc addObserverForName:UIApplicationDidFinishLaunchingNotification object:nil queue:nil usingBlock:^(NSNotification *n) {
    NSLog(@"[EB-P] native:didFinishLaunching %lld", EBEpochMs());
  }];
  [nc addObserverForName:@"RCTJavaScriptWillStartLoadingNotification" object:nil queue:nil usingBlock:^(NSNotification *n) {
    NSLog(@"[EB-P] native:jsWillStartLoading %lld", EBEpochMs());
  }];
  [nc addObserverForName:@"RCTJavaScriptWillStartExecutingNotification" object:nil queue:nil usingBlock:^(NSNotification *n) {
    NSLog(@"[EB-P] native:jsWillStartExecuting %lld", EBEpochMs());
  }];
  [nc addObserverForName:@"RCTJavaScriptDidLoadNotification" object:nil queue:nil usingBlock:^(NSNotification *n) {
    NSLog(@"[EB-P] native:jsDidLoad %lld", EBEpochMs());
    EBBridge = n.userInfo[@"bridge"];
  }];
  __block BOOL appeared = NO;
  [nc addObserverForName:@"RCTContentDidAppearNotification" object:nil queue:nil usingBlock:^(NSNotification *n) {
    NSLog(@"[EB-P] native:contentDidAppear %lld", EBEpochMs());
    if (appeared) return;
    appeared = YES;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
      id bridge = EBBridge;
      id logger = [bridge valueForKey:@"performanceLogger"];
      NSArray<NSNumber *> *values = [logger performSelector:@selector(valuesForTags)];
      double offset = EBMediaToEpochOffset();
      for (NSUInteger tag = 0; tag * 2 + 1 < values.count; tag++) {
        double a = values[tag * 2].doubleValue, b = values[tag * 2 + 1].doubleValue;
        NSString *label = RCTPLLabelForTag(tag);
        if (a > 0 && b > 0) {
          NSLog(@"[EB-P] rctpl:%@ %lld dur=%.1f", label, (long long)(a + offset), b - a);
        } else if (b != 0) {
          NSLog(@"[EB-P] rctpl:%@ %lld value=%.1f", label, EBEpochMs(), b);
        }
      }
    });
  }];
}

static IHermesRootAPI *EBRoot() {
  return facebook::jsi::castInterface<IHermesRootAPI>(facebook::hermes::makeHermesRootAPI());
}

static double EBHz() {
  const char *hz = getenv("EB_HERMES_PROFILE_HZ");
  return hz ? atof(hz) : 1000.0;
}

@interface EBHermesProfiler : NSObject
@end

@implementation EBHermesProfiler
+ (void)load {
  EBInstallNativeMarks();
  // EB_LAUNCH_GATE=1: hold launch here until the host posts com.everybible.go, so an
  // external sampler (`sample <pid>`) can attach before any app work starts.
  const char *gate = getenv("EB_LAUNCH_GATE");
  if (gate && strcmp(gate, "1") == 0) {
    // Poll for <data container>/tmp/eb-go (a Darwin notification is not delivered this early).
    NSString *goPath = [NSTemporaryDirectory() stringByAppendingPathComponent:@"eb-go"];
    NSLog(@"[EB-PROF] launch gate waiting for %@", goPath);
    for (int i = 0; i < 20000 && access(goPath.fileSystemRepresentation, F_OK) != 0; i++) usleep(1000);
    NSLog(@"[EB-PROF] launch gate released");
  }
  const char *flag = getenv("EB_HERMES_PROFILE");
  if (!flag || strcmp(flag, "1") != 0) return;
  IHermesRootAPI *root = EBRoot();
  if (!root) { NSLog(@"[EB-PROF] no root api"); return; }
  root->enableSamplingProfiler(EBHz());
  NSLog(@"[EB-PROF] sampling enabled at load");
  static int startToken, dumpToken;
  dispatch_queue_t q = dispatch_queue_create("eb.hprof", DISPATCH_QUEUE_SERIAL);
  notify_register_dispatch("com.everybible.hprof.start", &startToken, q, ^(int) {
    EBRoot()->disableSamplingProfiler();
    EBRoot()->enableSamplingProfiler(EBHz());
    NSLog(@"[EB-PROF] sampling restarted");
  });
  notify_register_dispatch("com.everybible.hprof.dump", &dumpToken, q, ^(int) {
    NSString *docs = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    long long ms = (long long)([[NSDate date] timeIntervalSince1970] * 1000);
    NSString *path = [docs stringByAppendingPathComponent:[NSString stringWithFormat:@"hprof-%lld.json", ms]];
    EBRoot()->dumpSampledTraceToFile(std::string(path.UTF8String));
    EBRoot()->disableSamplingProfiler();
    NSLog(@"[EB-PROF] dumped %@", path);
  });
}
@end
