const express = require('express');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3071;

app.use(express.json({ limit: '10mb' }));
app.get('/', (req, res) => res.sendFile(require('path').join(__dirname, 'public', 'landing.html')));
app.get('/app', (req, res) => res.sendFile(require('path').join(__dirname, 'public', 'index.html')));
app.use(express.static(__dirname + '/public'));

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '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';

app.post('/api/analyze', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });

    // Strip data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const payload = JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are a resale pricing expert. Analyze this item and return JSON only, no other text:
{
  "item_name": "specific item name with brand if visible",
  "brand": "brand name or Unknown",
  "category": "clothing/electronics/shoes/accessories/home/other",
  "condition_estimate": "excellent/good/fair/poor",
  "resale_price_low": 0,
  "resale_price_high": 0,
  "best_platform": "Depop/Poshmark/eBay",
  "why": "one sentence on why this item sells well or not",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}
Estimate realistic sold prices based on your knowledge of the resale market. Be accurate and honest â€” if something is worth $5, say $5.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Data}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });

    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://flipiq.app',
        'X-Title': 'FlipIQ'
      }
    };

    const result = await new Promise((resolve, reject) => {
      const req2 = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message || 'API error'));
            const content = parsed.choices[0].message.content.trim();
            // Extract JSON from response (strip markdown code fences if present)
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return reject(new Error('No JSON in response'));
            const analysis = JSON.parse(jsonMatch[0]);
            resolve(analysis);
          } catch (e) {
            reject(new Error('Failed to parse API response: ' + e.message));
          }
        });
      });
      req2.on('error', reject);
      req2.write(payload);
      req2.end();
    });

    res.json(result);
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-listing', async (req, res) => {
  try {
    const { item } = req.body;
    if (!item) return res.status(400).json({ error: 'No item data provided' });

    const prompt = `You are a resale listing copywriter for Gen Z thrift sellers. Generate a listing for this item and return JSON only, no other text:
{
  "title": "optimized listing title under 80 characters",
  "description": "2-3 sentences in casual Gen Z tone, mention condition and key features",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7", "hashtag8"]
}

Item details:
- Name: ${item.item_name}
- Brand: ${item.brand}
- Category: ${item.category}
- Condition: ${item.condition_estimate}
- Keywords: ${(item.keywords || []).join(', ')}

Keep the title under 80 chars. Make description sound natural and cool, not robotic. Include relevant hashtags for Depop/Instagram.`;

    const payload = JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400
    });

    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://flipiq.app',
        'X-Title': 'FlipIQ'
      }
    };

    const result = await new Promise((resolve, reject) => {
      const req2 = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message || 'API error'));
            const content = parsed.choices[0].message.content.trim();
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return reject(new Error('No JSON in response'));
            resolve(JSON.parse(jsonMatch[0]));
          } catch (e) {
            reject(new Error('Failed to parse API response: ' + e.message));
          }
        });
      });
      req2.on('error', reject);
      req2.write(payload);
      req2.end();
    });

    res.json(result);
  } catch (err) {
    console.error('Listing gen error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/similar', async (req, res) => {
  try {
    const { q, category } = req.query;
    if (!q) return res.status(400).json({ error: 'No query provided' });

    const EBAY_APP_ID = process.env.EBAY_APP_ID;
    if (!EBAY_APP_ID) {
      // No key — return search links only
      return res.json({
        no_key: true,
        search_links: buildSearchLinks(q, category)
      });
    }

    const query = encodeURIComponent(q.slice(0, 100));
    const url = `https://svcs.ebay.com/services/search/FindingService/v1` +
      `?OPERATION-NAME=findCompletedItems` +
      `&SERVICE-VERSION=1.0.0` +
      `&SECURITY-APPNAME=${EBAY_APP_ID}` +
      `&RESPONSE-DATA-FORMAT=JSON` +
      `&REST-PAYLOAD` +
      `&keywords=${query}` +
      `&sortOrder=EndTimeSoonest` +
      `&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true` +
      `&outputSelector(0)=SellerInfo` +
      `&paginationInput.entriesPerPage=6`;

    const data = await fetchJSON(url);
    const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];

    const results = items.map(item => ({
      title: item.title?.[0] || '',
      price: item.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.['__value__'] || null,
      currency: item.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.['@currencyId'] || 'USD',
      image: item.galleryURL?.[0] || null,
      url: item.viewItemURL?.[0] || null,
      condition: item.condition?.[0]?.conditionDisplayName?.[0] || null,
      sold: true
    }));

    res.json({ results, search_links: buildSearchLinks(q, category) });
  } catch (err) {
    console.error('Similar error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function buildSearchLinks(q, category) {
  const enc = encodeURIComponent(q);
  return [
    { platform: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${enc}&LH_Sold=1&LH_Complete=1`, color: '#e53238' },
    { platform: 'Depop', url: `https://www.depop.com/search/?q=${enc}`, color: '#ff2300' },
    { platform: 'Poshmark', url: `https://poshmark.com/search?query=${enc}&availability=sold_out`, color: '#f05537' },
    { platform: 'Mercari', url: `https://www.mercari.com/search/?keyword=${enc}`, color: '#ff0211' },
    { platform: 'ThredUp', url: `https://www.thredup.com/products?search_text=${enc}`, color: '#5fa81b' }
  ];
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('JSON parse failed')); }
      });
    }).on('error', reject);
  });
}

app.get('/docs', (req, res) => {
  res.sendFile('docs.html', { root: __dirname + '/public' });
});

app.listen(PORT, () => console.log(`FlipIQ running on port ${PORT}`));
