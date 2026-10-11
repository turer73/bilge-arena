import { pathToFileURL } from 'node:url'

// Read-only existing-authority audit; runs BEFORE the measurement migration too.
// Counts are whole-bank by subject/exam, not selected or calibrated forms.
export function measurementReadinessSql() {
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
WITH candidates AS (
 SELECT q.game::text game,q.exam_ref::text exam,q.id,
   jsonb_array_length(q.content->'options') option_count,
   public.question_revision_single_review_ready(q.published_revision_id) accepted,
   EXISTS(SELECT 1 FROM public.question_content_revisions r WHERE r.question_id=q.id
     AND r.status IN ('draft','stage1_approved','stage2_approved')
     AND jsonb_array_length(r.content->'options')=4) has_four_option_draft
 FROM public.questions q WHERE q.is_active
 AND ((q.game='matematik' AND q.exam_ref='TYT') OR q.exam_ref='LGS')
), totals AS (
 SELECT game,exam,count(*)::integer active,
   count(*) FILTER(WHERE option_count=CASE exam WHEN 'LGS' THEN 4 ELSE 5 END)::integer correct_option_count,
   count(*) FILTER(WHERE accepted)::integer source_outcome_quality_accepted,
   count(*) FILTER(WHERE exam='LGS' AND has_four_option_draft)::integer four_option_draft
 FROM candidates GROUP BY game,exam
)
SELECT jsonb_build_object('version','measurement-readiness@1','checkedAt',transaction_timestamp(),
 'databaseWrites',0,'calibrated',false,'publicationAuthorized',false,
 'subjects',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY game,exam) FROM totals t),'[]'::jsonb)) AS snapshot;
COMMIT;`
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 if(process.argv[2]!=='sql') throw new Error('Usage: node database/measurement-readiness.mjs sql')
 process.stdout.write(measurementReadinessSql()+'\n')
}
