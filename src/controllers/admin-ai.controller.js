import { asyncHandler, ok } from '../utils/response.js';

/**
 * Intelligent E-Commerce Rewrite & Semantic Polishing Engine
 */
function semanticEcommerceRewrite(text, type) {
  const lower = text.toLowerCase();

  const hasDelivery = /ship|deliver|courier|bhej|transport|reach|pan[\s-]*india|all[\s-]*india|desh|all over|har jagah/i.test(lower);
  const hasHandmade = /hand[\s-]*made|handcraft|hath\s*se|custom|resin|curing|art\b|kala/i.test(lower);
  const hasCancel = /cancel|return|wapas|refund|exchange/i.test(lower);
  const hasTrack = /track|whatsapp|msg|call|sms|status/i.test(lower);
  const hasFragile = /fragile|glass|tut|damage|safe|pack|care/i.test(lower);
  const hasDays = /(\d+)\s*[-to\s]+\s*(\d+)\s*(days?|din)?/i.exec(lower);

  const daysStr = hasDays ? `${hasDays[1]}–${hasDays[2]} business days` : '4–7 business days';

  if (type === 'badge') {
    if (hasDelivery && /pan|all/i.test(lower)) return 'Pan-India Delivery';
    if (hasHandmade) return 'Handcrafted & Custom';
    if (/express|fast|quick|urgent/i.test(lower)) return 'Express Shipping';
    if (/quality|best|premium/i.test(lower)) return 'Premium Quality';
    if (hasDelivery) return 'All-India Shipping';
    
    // Capitalize each word cleanly
    return text
      .split(' ')
      .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '')
      .join(' ')
      .slice(0, 30);
  }

  if (type === 'title') {
    if (hasHandmade && hasCancel) return 'Important: Custom Order & Cancellation Guidelines';
    if (hasDelivery && (hasHandmade || /resin/i.test(lower))) return 'Pan-India Shipping & Handcrafted Order Notice';
    if (hasDelivery) return 'Pan-India Shipping & Delivery Guidelines';
    if (hasHandmade) return 'Important Notice for Resin Art Customers';
    if (hasFragile) return 'Fragile Handling & Protective Transit Notice';
    return 'Important Notice & Customer Guidelines';
  }

  // Type === 'message'
  const sentences = [];

  if (hasHandmade) {
    sentences.push('Every piece is meticulously handcrafted with premium resin and undergoes an artistic curing process.');
  }

  if (hasDelivery) {
    sentences.push(`We provide reliable Pan-India courier delivery directly to your doorstep within ${daysStr}.`);
  }

  if (hasCancel) {
    sentences.push('Because each item is custom-crafted specifically for you, orders cannot be cancelled or modified once crafting begins.');
  }

  if (hasFragile) {
    sentences.push('All orders are wrapped in multi-layer protective bubble packaging to guarantee zero transit damage.');
  }

  if (hasTrack) {
    sentences.push('A live courier tracking link will be sent to your registered WhatsApp number as soon as your package is dispatched.');
  }

  if (sentences.length === 0) {
    // If input is general English or unique text, clean and structure it properly
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^[a-z]/, c => c.toUpperCase());
    if (!/[.!?]$/.test(cleaned)) cleaned += '.';
    sentences.push(cleaned);
    sentences.push('Thank you for choosing us for your unique handcrafted needs!');
  }

  return sentences.join(' ');
}

export const correctEnglishText = asyncHandler(async (req, res) => {
  const { text, type } = req.body;
  if (!text || !String(text).trim()) {
    return ok(res, { original: '', corrected: '', changesMade: false });
  }

  const original = String(text).trim();
  let rewritten = '';

  // 1. Check if Google Gemini API key is configured in environment
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
      
      const prompt = `You are a professional e-commerce copywriter for an online store in India.
The user wrote: "${original}"
Rewrite this draft into attractive, high-converting, professional English for an e-commerce website.
Type of field: ${type} (badge = 2-4 word punchy tag, title = clean Title Case heading, message = 1-3 polished, customer-friendly sentences).
Return ONLY the final rewritten text without quotes, markdown headers, or explanations.`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 120, temperature: 0.3 }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate && candidate.trim()) {
          rewritten = candidate.trim().replace(/^["']|["']$/g, '');
        }
      }
    } catch (err) {
      console.warn('[AI] Gemini API attempt notice:', err.message);
    }
  }

  // 2. If Gemini is not set or failed, use Google Translate auto-detection to convert any Hindi/Hinglish to English
  if (!rewritten) {
    try {
      const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(original)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const gtRes = await fetch(gtUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (gtRes.ok) {
        const gtData = await gtRes.json();
        const translated = gtData?.[0]?.map(chunk => chunk[0]).join('') || '';
        if (translated && translated.trim()) {
          rewritten = semanticEcommerceRewrite(translated, type);
        }
      }
    } catch {
      // Fallback to local semantic rewriter
    }
  }

  // 3. Fallback to smart semantic e-commerce polisher
  if (!rewritten) {
    rewritten = semanticEcommerceRewrite(original, type);
  }

  return ok(res, {
    original,
    corrected: rewritten,
    changesMade: rewritten.trim() !== original.trim()
  });
});
