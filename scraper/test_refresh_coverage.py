import json
import tempfile
import unittest
from collections import Counter
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import Mock, patch

import general_shop_refresh as general
import slot_ingest as legacy


class RefreshCoverageTests(unittest.TestCase):
    def test_all_partitions_compete_on_due_age_when_cron_runs_late(self):
        def page(path):
            part = int(path.split('part=')[1].split('&')[0])
            return {'ready':True,'targets':[
                {'id':f'p{part}','attempted':'2025' if part == 7 else '2026','lane':0},
                {'id':f'f{part}','attempted':None if part == 6 else '2026','lane':1}]}
        with patch.object(general,'api_get',side_effect=page) as get:
            rows = general.due_targets('slots',4)
        self.assertEqual(get.call_count, 8)
        self.assertEqual([r['id'] for r in rows[:2]], ['f6','p7'])
        self.assertEqual([r['lane'] for r in rows],[1,0,1,0])

    def test_position_waits_for_a_whole_shop_and_contains_no_identifiers(self):
        with tempfile.TemporaryDirectory() as d:
            cursor = Path(d)/'progress.json'
            rows = [{'id':s} for s in ('1010','3090','5050')]
            totals = Counter({'1010':1,'3090':2,'5050':1})
            complete = Counter({'1010':1,'3090':1})
            legacy.checkpoint_legacy(cursor,0,rows,complete,totals)
            self.assertEqual(json.loads(cursor.read_text()),{'nextPosition':1})
            ordered, at = legacy.resume_legacy_targets(list(reversed(rows)),cursor)
            self.assertEqual((ordered[0]['id'],at),('3090',1))

    def test_only_acknowledged_snapshot_and_summary_advance_progress(self):
        for failure in ('snapshot','summary','ack','success'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as d, ExitStack() as stack:
                cursor = Path(d)/'progress.json'
                stack.enter_context(patch.dict(legacy.ENV, {'LEGACY_SLOT_CURSOR':str(cursor)}))
                stack.enter_context(patch('general_source_budget.SourceBudget'))
                stack.enter_context(patch.object(legacy,'load_targets',return_value=[{'id':'1234','biz_id':'11','item_id':'22'}]))
                stack.enter_context(patch.object(legacy,'fetch_slots',return_value=[]))
                stack.enter_context(patch.object(legacy,'notify_new_slots'))
                snapshot=stack.enter_context(patch.object(legacy,'slot_sync',return_value={'inserted':0,'newCount':0,'newSlots':[]}))
                summary=stack.enter_context(patch.object(legacy,'api_post',return_value={'updated':1}))
                if failure == 'snapshot': snapshot.side_effect=RuntimeError()
                if failure == 'summary': summary.side_effect=RuntimeError()
                if failure == 'ack': snapshot.return_value={}
                if failure == 'success':
                    legacy.main()
                    self.assertTrue(cursor.exists())
                else:
                    with self.assertRaises(RuntimeError): legacy.main()
                    self.assertFalse(cursor.exists())
                self.assertEqual(summary.call_count, int(failure in ('success','summary')))

    def test_cooldown_avoids_both_target_lookup_and_writes(self):
        from general_source_budget import SourcePaused
        with patch('general_source_budget.SourceBudget') as budget, patch.object(legacy,'load_targets') as get, patch.object(legacy,'slot_sync') as write:
            budget.return_value.check.side_effect = SourcePaused()
            legacy.main()
            get.assert_not_called()
            write.assert_not_called()
