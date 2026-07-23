//
// Shared keyword extraction — used by policyService (for building ILIKE/
// array-overlap search conditions) AND by intentRouter (for deciding which
// tables are worth querying in the first place). Kept in one place so the
// two never drift out of sync.
//
// NOTE: this file used to live at utils/Keywords.js (capital K). Every
// require() in the codebase already imports it as lowercase
// ('../utils/keywords'), which only resolved because dev machines run a
// case-insensitive filesystem (macOS/Windows). On a case-sensitive Linux
// prod box this throws MODULE_NOT_FOUND. Renamed to match the requires
// exactly — same fix applied to IntentRouter.js -> intentRouter.js.
//

const STOP_WORDS = new Set([
  'the','and','for','are','but','not','you','all','any','can','her','was',
  'one','our','out','had','his','has','have','him','his','how','its','may',
  'nor','now','own','say','she','too','use','was','way','who','why','will',
  'with','that','this','they','from','been','come','does','done','each',
  'even','find','give','goes','into','just','know','like','make','more',
  'much','need','only','over','same','such','take','tell','than','them',
  'then','thus','till','upon','used','very','want','well','were','what',
  'when','whom','your','about','after','also','back','both','does','down',
  'duly','else','find','first','from','give','good','here','just','keep',
  'kind','last','left','life','live','long','look','most','much','near',
  'next','only','open','part','past','seek','self','show','some','sort',
  'stay','such','tell','tend','time','type','unto','upon','used','view',
  'ways','wish','work','year','years','offer','offers','product','products',
  'insurance','insure','insured','policy','policies','does','have','please',
  'cic',
  'would','could','should','shall','might','must','been','being','where',
  'there','their','those','these','other','every','which','while','before',
]);

// ---------------------------------------------------------------------------
// extractKeywords — lowercase, split on non-word chars, drop short tokens
// and stop-words. Returns a clean array of meaningful search terms.
// ---------------------------------------------------------------------------
function extractKeywords(searchQuery) {
  return (searchQuery || '')
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

module.exports = { STOP_WORDS, extractKeywords };
