#!/usr/bin/env python3
"""Read-only canonical-label equivalence audit; never changes atlas identities."""
from __future__ import annotations
import collections
import gzip
import hashlib
import itertools
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ATLAS = ROOT / 'apps/admin/data/language-atlas'
OUT = ROOT / 'docs/research/language-atlas'
GENERIC = {'standard', 'common', 'proper', 'nuclear', 'cluster', 'dialect', 'language', 'general'}


def normalized(value):
    # Preserve accents and scripts: no transliteration or fuzzy spelling.
    text = unicodedata.normalize('NFC', value).casefold()
    # Formatting delimiters only. Click consonants, apostrophes, brackets and
    # other potentially phonemic symbols must not disappear during matching.
    return ' '.join(re.sub(r'[:,()\-]', ' ', text).split())


DIRECTIONS = dict(zip(('north','south','east','west','northeast','northwest','southeast','southwest'), ('northern','southern','eastern','western','northeastern','northwestern','southeastern','southwestern')))


def direction_leaf(value):
    return DIRECTIONS.get(value, value)


def leaf_forms(name, parent):
    full = normalized(name)
    aliases = sorted(a for a in {parent['name'], *parent.get('aliases', [])} if ':' not in a)
    parent_forms = {normalized(a) for a in aliases}
    if full in parent_forms:
        return []
    forms = []
    for alias in aliases:
        key = normalized(alias)
        if not key:
            continue
        if ':' in name and normalized(name.split(':', 1)[0]) == key:
            leaf = normalized(name.split(':', 1)[1])
            if leaf and leaf not in parent_forms:
                forms.append({'leaf': leaf, 'parentAlias': alias, 'operation': 'colon-parent'})
        for prefix in (True, False):
            if (full.startswith(key + ' ') if prefix else full.endswith(' ' + key)):
                leaf = full[len(key)+1:] if prefix else full[:-len(key)-1]
                if leaf and leaf not in parent_forms:
                    forms.append({'leaf': leaf, 'parentAlias': alias, 'operation': 'parent-prefix' if prefix else 'parent-suffix'})
    # A standalone distinctive or directional label may match a qualified label.
    forms.append({'leaf': full, 'parentAlias': None, 'operation': 'exact-label'})
    result = []
    for form in forms:
        if form['leaf'] and form['leaf'] not in GENERIC:
            form['originalLeaf'] = form['leaf']
            form['leaf'] = direction_leaf(form['leaf'])
            form['directionAdjectiveRule'] = form['originalLeaf'] != form['leaf']
            result.append(form)
    return result


def main():
    source = ATLAS / 'index.json.gz'
    records = json.loads(gzip.decompress(source.read_bytes()))['records']
    by_id = {r['id']: r for r in records}
    varieties = [r for r in records if r['kind'] in {'language', 'dialect'}]
    children = collections.Counter(r.get('parentId') for r in varieties)
    groups = collections.defaultdict(dict)
    missing = 0
    for r in varieties:
        parent = by_id.get(r.get('parentId'))
        if not parent:
            missing += 1
            continue
        for form in leaf_forms(r['name'], parent):
            groups[(r['parentId'], r['kind'], form['leaf'])].setdefault(r['id'], []).append(form)
    alias_groups = collections.defaultdict(set)
    for r in varieties:
        parent = by_id.get(r.get("parentId"))
        if parent:
            for alias in r.get("aliases", []):
                for form in leaf_forms(alias, parent):
                    alias_groups[(r["parentId"], r["kind"], form["leaf"])].add(r["id"])
    pairs = {}
    neighbors = collections.defaultdict(set)
    for key, members in sorted(groups.items()):
        for a,b in itertools.combinations(sorted(members), 2):
            neighbors[a].add(b)
            neighbors[b].add(a)
            pairs.setdefault((a,b), []).append({'parentId': key[0], 'kind': key[1], 'leaf': key[2], 'forms': {a: members[a], b: members[b]}})
    details = {}
    wanted = {x for pair in pairs for x in pair}
    for path in sorted(ATLAS.glob('details-*.json.gz')):
        for rid, detail in json.loads(gzip.decompress(path.read_bytes())).items():
            if rid in wanted:
                details[rid] = {'sourceFile': str(path.relative_to(ROOT)), 'evidence': detail.get('evidence', []), 'links': detail.get('links', [])}
    rows = []
    for (aid,bid), matches in sorted(pairs.items()):
        a,b = by_id[aid],by_id[bid]
        reasons = []
        if aid.split(':')[0] == bid.split(':')[0]: reasons.append('same-registry')
        if children[aid] or children[bid]: reasons.append('has-variety-children')
        if a.get('needsReview') or b.get('needsReview'): reasons.append('existing-review-flag')
        if len(neighbors[aid]) != 1 or len(neighbors[bid]) != 1: reasons.append('ambiguous-normalized-leaf')
        rivals = sorted({rid for m in matches for rid in alias_groups[(m['parentId'],m['kind'],m['leaf'])]} - {aid,bid})
        kyrgyz_exception = {aid,bid} == {'glottolog:nort2693','rolv:12042'} and set(rivals) <= {'rolv:12041'}
        if rivals and not kyrgyz_exception: reasons.append('competing-normalized-alias')
        ac,bc = set(a.get('countryCodes', [])),set(b.get('countryCodes', []))
        if not ac or not bc: reasons.append('country-unknown')
        elif not ac & bc: reasons.append('country-conflict')
        for field in ['iso6393','glottocode','rolvCode','population','family','scriptureStatus','scriptureScope','languageContextStatus']:
            av,bv=a.get(field),b.get(field)
            if av is not None and bv is not None and av != bv: reasons.append('conflict:'+field)
        an = {normalized(a['name']), *(normalized(x) for x in a.get('aliases', []))}
        bn = {normalized(b['name']), *(normalized(x) for x in b.get('aliases', []))}
        direct_overlap = bool(an & bn)
        rows.append({'ids':[aid,bid], 'names':[a['name'],b['name']], 'parent': {'id': a['parentId'], 'name':by_id[a['parentId']]['name'], 'aliases':by_id[a['parentId']].get('aliases',[])}, 'matches':matches, 'disposition':'retain-separate' if reasons else 'naming-equivalent-candidate', 'exclusions':reasons, 'directionAdjectiveRule':any(f['directionAdjectiveRule'] for m in matches for forms in m['forms'].values() for f in forms), 'nameMatchClass':'direct-label-or-alias-overlap' if direct_overlap else 'newly-reordered', 'primaryLabelUnique':len(neighbors[aid]) == len(neighbors[bid]) == 1, 'competingAliases':[{'id':rid,'name':by_id[rid]['name'],'aliases':by_id[rid].get('aliases',[]),'countries':by_id[rid].get('countryCodes',[])} for rid in rivals], 'userApprovedKyrgyzChinaException':kyrgyz_exception, 'countries':[sorted(ac),sorted(bc)], 'records':[a,b], 'evidence':{rid:details.get(rid,{}) for rid in [aid,bid]}})
    accepted = [r for r in rows if not r['exclusions']]
    report = {'schemaVersion':1,'source':str(source.relative_to(ROOT)), 'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'coverage':{'totalRecords':len(records),'languageDialectRecords':len(varieties),'withoutImmediateParent':missing,'normalizedPairCount':len(rows),'candidateCount':len(accepted), 'candidateSubsets':dict(sorted(collections.Counter(r['nameMatchClass'] for r in accepted).items()))}, 'rules':['Canonical labels only; documented immediate parent names and aliases may be removed at a boundary.','NFC/case and formatting delimiters (colon, comma, parentheses, hyphen) only; clicks, apostrophes and other symbols are preserved. No transliteration, fuzzy spelling or token reordering. Exact entire residual cardinal direction leaves map to adjective forms (north/northern and the seven analogous compass directions); compounds remain unchanged.','Unique bidirectionally across all canonical leaf matches before exclusions; parent and kind must be identical.','Parent-only labels excluded. Missing country evidence retained separately. Existing children/review flags/conflicting nonnull identifiers and scalar or Scripture fields excluded.','Direct name/alias overlap is a classification, not an exclusion. Candidates require review; source ISO alone is not identity evidence.'], 'exclusionCounts':dict(sorted(collections.Counter(x for r in rows for x in r['exclusions']).items())), 'candidates':accepted, 'excluded':[r for r in rows if r['exclusions']]}
    payload=(json.dumps(report,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()
    (OUT/'reconciliation-naming-candidates.json.gz').write_bytes(gzip.compress(payload,mtime=0))
    lines=['# Canonical naming-equivalence audit','',f"Scanned {len(varieties):,} language/dialect records. Found {len(accepted)} eligible naming pairs and {len(rows)-len(accepted)} excluded pairs.",'',*['- '+r for r in report['rules']],'','## Candidates','']
    lines.extend(['- Candidate subsets: '+json.dumps(report['coverage']['candidateSubsets'],sort_keys=True), '- Complete candidate and exclusion rows are in the gzip report; the list below is limited to 30 examples.',''])
    for r in accepted[:30]: lines.append(f"- `{r['ids'][0]}` {r['names'][0]} ↔ `{r['ids'][1]}` {r['names'][1]} under {r['parent']['name']} (`{r['parent']['id']}`).")
    lines.extend(['','## Exclusions','',*['- '+k+': '+str(v) for k,v in report['exclusionCounts'].items()]])
    (OUT/'reconciliation-naming-candidates.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps(report['coverage']))
    print(json.dumps([{'ids':r['ids'],'names':r['names']} for r in accepted if r['parent']['id']=='iso:kir'],ensure_ascii=False))

if __name__ == '__main__': main()
