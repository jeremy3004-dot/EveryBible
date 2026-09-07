import unittest
from build_public_projects import parse_portfolio, project_projection

HEADER = 'Project Name,ISO Code,Total Books,Chapters Recorded,Total Chapters,Chapters Recorded %,Gospel %,NT %,OT %,Recordings,Last Activity,Category\n'
class PublicProjectsTests(unittest.TestCase):
    def setUp(self):
        self.csv = '# Every Language — Portfolio Status\n# Generated at (UTC),2026-09-07T03:41:14.596Z\n# Source,"lq_project_dashboard (live, unaudited — NOT a pay artifact)"\n' + HEADER
        self.csv += 'Bhujel,,20,463,677,38.9,,,49.8,44583,9d ago,matched\nOther,,1,2,4,0.2,0,0,,5,31d ago,matched\n'
        self.records = [{'id':'iso:byh','kind':'language','name':'Bhujel','countryCodes':['NP']}]
        self.links = {'Bhujel':{'recordId':'iso:byh','languageName':'Bhujel: Andimul','evidence':'Existing exact Every Language entity link'}}

    def test_metadata_and_thirty_day_selection(self):
        rows, stamp, source = parse_portfolio(self.csv)
        self.assertEqual(stamp, '2026-09-07T03:41:14.596Z')
        result = project_projection(rows, self.links, self.records, stamp, source)
        self.assertEqual(len(result['projects']),1)
        self.assertEqual(result['projects'][0]['name'],'Bhujel')

    def test_source_metrics_not_recomputed_from_partial_chapter_total(self):
        rows, stamp, source = parse_portfolio(self.csv)
        p = project_projection(rows,self.links,self.records,stamp,source)['projects'][0]
        self.assertEqual(p['chaptersRecorded'],463)
        self.assertEqual(p['totalChapters'],677)
        self.assertEqual(p['recordedPercentage'],38.9)
        self.assertIsNone(p['gospelPercentage'])
        self.assertEqual(p['otPercentage'],49.8)
        self.assertNotIn('completedChapters',p)

    def test_unlinked_project_is_retained_without_guessed_marker(self):
        rows, stamp, source = parse_portfolio(self.csv)
        result=project_projection(rows,{},self.records,stamp,source)
        self.assertEqual(len(result['projects']),1)
        self.assertIsNone(result['projects'][0]['recordId'])

    def test_boundary_and_missing_activity(self):
        rows, stamp, source = parse_portfolio(self.csv)
        for activity, expected in [('30d ago',1),('31d ago',0),('',0),('0d ago',1)]:
            rows[0]['Last Activity']=activity
            self.assertEqual(len(project_projection(rows[:1],self.links,self.records,stamp,source)['projects']),expected)

    def test_invalid_counts_percentage_and_link_fail(self):
        rows, stamp, source = parse_portfolio(self.csv)
        for field,value in [('Chapters Recorded','-1'),('Chapters Recorded %','101'),('Recordings','abc')]:
            with self.assertRaises(ValueError): project_projection([dict(rows[0],**{field:value})],self.links,self.records,stamp,source)
        with self.assertRaises(ValueError):
            project_projection(rows,{'Bhujel':dict(self.links['Bhujel'],recordId='missing')},self.records,stamp,source)

if __name__ == '__main__': unittest.main()
