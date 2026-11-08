"""A runtime identity is valid only when every shipped package file matches."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1] / 'custom_components' / 'water_treatment'


class BuildIdentityTests(unittest.TestCase):
    def test_identity_matches_package_and_detects_changed_file(self):
        self.assertTrue((ROOT / '_notification_build.py').exists(), 'generated identity is missing')
        spec = importlib.util.spec_from_file_location('_test_notification_identity', ROOT / '_notification_build.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertTrue(module.verify_package(ROOT))
        with tempfile.TemporaryDirectory() as temp:
            from shutil import copytree
            target = Path(temp) / 'package'
            copytree(ROOT, target, ignore=lambda directory, names: {'__pycache__'} & set(names))
            (target / 'filter_model.py').write_text('tampered', encoding='utf-8')
            self.assertFalse(module.verify_package(target))

    def test_manifest_and_extra_runtime_files_are_checked(self):
        self.assertTrue((ROOT / '_notification_build.py').exists())
        spec = importlib.util.spec_from_file_location('_identity_test_extra', ROOT / '_notification_build.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temp:
            from shutil import copytree
            target = Path(temp) / 'package'
            copytree(ROOT, target, ignore=lambda directory, names: {'__pycache__'} & set(names))
            (target / 'notification_build.json').write_text('{}', encoding='utf-8')
            self.assertFalse(module.verify_package(target))
            (target / 'notification_build.json').write_bytes((ROOT / 'notification_build.json').read_bytes())
            (target / 'unexpected.py').write_text('pass', encoding='utf-8')
            self.assertFalse(module.verify_package(target))
