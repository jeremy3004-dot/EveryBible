import gzip
import json
import unittest
from pathlib import Path
from audit_naming_equivalence import leaf_forms, normalized, direction_leaf

PARENT = {'name':'Kirghiz','aliases':['Kyrgyz','Kyrgyz: China']}

def leaves(name, parent=PARENT):
    return {f['leaf'] for f in leaf_forms(name,parent)}

class NamingEquivalenceTests(unittest.TestCase):
    def test_kyrgyz_parent_alias_transforms(self):
        self.assertIn('northern', leaves('Kyrgyz: Northern') & leaves('Northern Kirghiz'))
        self.assertIn('southern', leaves('Kyrgyz: Southern') & leaves('Southern Kirghiz'))

    def test_direction_and_china_preserved(self):
        self.assertFalse(leaves('Kyrgyz: Northern') & leaves('Kyrgyz: Southern'))
        self.assertFalse(leaves('Kyrgyz: Northern') & leaves('Kyrgyz: China'))

    def test_exact_boundaries(self):
        self.assertNotIn('stan northern', leaves('Kyrgyzstan Northern'))
        self.assertNotIn('northern', leaves('Unknown: Northern'))

    def test_parent_only_and_contaminated_alias(self):
        self.assertEqual(leaves('Kirghiz'),set())
        self.assertEqual(leaves('Kyrgyz'),set())
        self.assertNotIn('northern', leaves('Kyrgyz: China: Northern'))

    def test_nested_direction_retained(self):
        parent={'name':'Tosk','aliases':[]}
        self.assertFalse(leaves('Eastern Northern Tosk',parent) & leaves('Northern Tosk',parent))

    def test_entire_direction_leaf_only(self):
        self.assertEqual(direction_leaf('north'), direction_leaf('northern'))
        self.assertEqual(direction_leaf('southwest'), direction_leaf('southwestern'))
        self.assertEqual(direction_leaf('eastern northern'), 'eastern northern')
        self.assertIn('northern', leaves('Kyrgyz: North') & leaves('Northern Kirghiz'))

    def test_meaning_bearing_symbols_preserved(self):
        parent={'name':'Kxoe','aliases':[]}
        self.assertFalse(leaves('Kxoe: [[Xo-Kxoe',parent) & leaves('||Xo-Kxoe',parent))
        self.assertIn('||xo', leaves('Kxoe: ||Xo',parent) & leaves('||Xo-Kxoe',parent))
        for a,b in [('!Xo','ǃXo'), ('ǀXo','ǁXo'), ('ǂXo','Xo'), ("X'o",'Xo'), ('Ng|u||en','Ng|u|en'), ("Miri'",'Miri'), ("Pua'",'Pua'), ("Ulu Ai'",'Ulu Ai')]:
            self.assertNotEqual(normalized(a),normalized(b))

    def test_report_uniqueness_children_and_alias_controls(self):
        path=Path(__file__).resolve().parents[2]/'docs/research/language-atlas/reconciliation-naming-candidates.json.gz'
        report=json.loads(gzip.decompress(path.read_bytes()))
        for r in report['candidates']:
            self.assertTrue(r['primaryLabelUnique'])
            self.assertNotIn('has-variety-children',r['exclusions'])
            self.assertTrue(not r['competingAliases'] or r['userApprovedKyrgyzChinaException'])
        self.assertTrue(any(r['nameMatchClass'] == 'direct-label-or-alias-overlap' for r in report['candidates']))
        self.assertNotIn('direct-name-or-alias-owned-by-other-pass', report['exclusionCounts'])
        self.assertGreater(report['exclusionCounts']['ambiguous-normalized-leaf'],0)
        self.assertGreater(report['exclusionCounts']['has-variety-children'],0)
        self.assertGreater(report['exclusionCounts']['competing-normalized-alias'],0)

if __name__=='__main__': unittest.main()
