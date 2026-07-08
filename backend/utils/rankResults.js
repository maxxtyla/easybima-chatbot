function rankResults(results, userMessage) {
  const words = userMessage.toLowerCase().split(/\W+/).filter(w => w.length > 2);

  return results
    .map(row => {
      const haystack = [
        row.question, row.answer, row.title, row.content,
        row.description, row.benefits,
        row.name, row.city, row.region, row.address,
        ...(row.keywords || [])
      ].join(' ').toLowerCase();

      const matchCount = words.filter(w => haystack.includes(w)).length;
      const score = matchCount / words.length; // 0.0 – 1.0

      return { ...row, _score: score };
    })
    .filter(r => r._score > 0)           // drop zero-match results
    .sort((a, b) => b._score - a._score); // best match first
}

module.exports = { rankResults };