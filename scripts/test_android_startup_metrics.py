import unittest

from android_startup_metrics import parse_startup_sample


class StartupMetricsTest(unittest.TestCase):
    def test_reads_only_current_launch_and_separates_home_from_activity(self):
        logs = ('99.0 1 I ReactNativeJS: Home:interaction-ready\n'
                '100.0 1 I EBPerf : START-123\n'
                '100.2 1 I ReactNativeJS: App:module-start\n'
                '100.8 1 I ReactNativeJS: Home:interaction-ready\n')
        self.assertEqual(parse_startup_sample('TotalTime: 250', logs, 'START-123', 1), {
            'run': 1, 'activityDisplayMs': 250, 'appModuleReadyMs': 200,
            'homeInteractionReadyMs': 800,
        })

    def test_missing_home_readiness_is_not_inferred_from_activity(self):
        logs = '100.0 1 I EBPerf : START-123\n100.2 1 I ReactNativeJS: App:module-start\n'
        with self.assertRaisesRegex(RuntimeError, 'Home readiness'):
            parse_startup_sample('TotalTime: 250', logs, 'START-123', 1)

    def test_runtime_failure_invalidates_ready_sample(self):
        logs = ('100.0 1 I EBPerf : START-123\n'
                '100.2 1 I ReactNativeJS: App:module-start\n'
                '100.8 1 I ReactNativeJS: Home:interaction-ready\nFATAL EXCEPTION')
        with self.assertRaisesRegex(RuntimeError, 'Runtime failure'):
            parse_startup_sample('TotalTime: 250', logs, 'START-123', 1)


if __name__ == '__main__':
    unittest.main()
