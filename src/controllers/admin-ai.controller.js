import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';

export const correctEnglishText = asyncHandler(async (req, res) => {
  const { text, type } = req.body;
  if (!text || !String(text).trim()) {
    return ok(res, { original: '', corrected: '', changesMade: false });
  }

  let original = String(text).trim();
  let corrected = original;

  // 1. Query LanguageTool public free API for advanced spell & grammar correction
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const ltRes = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text: original, language: 'en-US' }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (ltRes.ok) {
      const data = await ltRes.json();
      if (Array.isArray(data.matches) && data.matches.length > 0) {
        // Sort matches from end to start so replacement offsets remain valid
        const sorted = [...data.matches].sort((a, b) => b.offset - a.offset);
        for (const m of sorted) {
          if (Array.isArray(m.replacements) && m.replacements.length > 0) {
            const repl = m.replacements[0].value;
            corrected = corrected.slice(0, m.offset) + repl + corrected.slice(m.offset + m.length);
          }
        }
      }
    }
  } catch (err) {
    // LanguageTool timeout/network failure fallback - proceed to rule enhancer
  }

  // 2. Specialized E-Commerce & Indian Retail Dictionary Fixes
  const DICT = [
    [/\b(pan|all)\s*(indai|indiya|indya)\b/gi, 'Pan-India'],
    [/\bpanindia\b/gi, 'Pan-India'],
    [/\bdelivry|delvery|delivrey|dilvery|delevery\b/gi, 'delivery'],
    [/\bavailble|availabe|avalable|avialable\b/gi, 'available'],
    [/\bshiping|shipin|shippng\b/gi, 'shipping'],
    [/\bresine|reisn|rasin\b/gi, 'resin'],
    [/\bcouriar|coureir|curier\b/gi, 'courier'],
    [/\bprodut|prduct|produc\b/gi, 'product'],
    [/\bhandcraft|handcrafter|hand made|hand-craft\b/gi, 'handcrafted'],
    [/\bdecore\b/gi, 'decor'],
    [/\bgifitng|giftingg\b/gi, 'gifting'],
    [/\bcustmer|customar|custmr\b/gi, 'customer'],
    [/\bguarntee|garantee|guarenty\b/gi, 'guarantee'],
    [/\bdisscount|dicount|discunt\b/gi, 'discount'],
    [/\borderd|ordred\b/gi, 'ordered'],
    [/\breceve|recieved\b/gi, 'received'],
    [/\bbussiness|buisness|busines\b/gi, 'business'],
    [/\bpincod|pincode|pin code\b/gi, 'pincode'],
    [/\bnotis|notce\b/gi, 'notice'],
    [/\bdont\b/gi, "don't"],
    [/\bcant\b/gi, "can't"],
    [/\bwont\b/gi, "won't"],
    [/\bthats\b/gi, "that's"],
    [/\bits\s+(a|an|the|our|your|my)\b/gi, "it's $1"],
    [/\bwe\s+is\b/gi, "we are"],
    [/\bi\b/g, 'I']
  ];

  for (const [pattern, repl] of DICT) {
    corrected = corrected.replace(pattern, repl);
  }

  // Clean extra spaces & spacing before punctuation
  corrected = corrected.replace(/[ \t]+/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();

  if (type === 'badge') {
    // Title Case for badges
    corrected = corrected
      .split(' ')
      .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '')
      .join(' ');
  } else if (type === 'title') {
    // Title Case for titles
    const minorWords = ['and', 'or', 'for', 'to', 'in', 'of', 'at', 'by', 'with', 'the', 'a', 'an'];
    corrected = corrected
      .split(' ')
      .map((w, idx) => {
        const lower = w.toLowerCase();
        if (idx > 0 && minorWords.includes(lower)) {
          return lower;
        }
        return w ? w.charAt(0).toUpperCase() + w.slice(1) : '';
      })
      .join(' ');
  } else {
    // Sentences: capitalize first letter of each sentence & ensure ending period
    corrected = corrected.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
    if (corrected && !/[.!?]$/.test(corrected)) {
      corrected += '.';
    }
  }

  const changesMade = corrected.trim() !== original.trim();
  return ok(res, { original, corrected: corrected.trim(), changesMade });
});
