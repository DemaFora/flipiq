// Patch script: adds /api/similar endpoint + similar listings UI to FlipIQ
const fs = require('fs');

// ── SERVER PATCH ─────────────────────────────────────────────────────────────
const serverPath = 'C:/Users/Jorden/apps/flipiq/server.js';
let server = fs.readFileSync(serverPath, 'utf8');

// Add similar endpoint before app.listen
const similarEndpoint = `
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
    const url = \`https://svcs.ebay.com/services/search/FindingService/v1\` +
      \`?OPERATION-NAME=findCompletedItems\` +
      \`&SERVICE-VERSION=1.0.0\` +
      \`&SECURITY-APPNAME=\${EBAY_APP_ID}\` +
      \`&RESPONSE-DATA-FORMAT=JSON\` +
      \`&REST-PAYLOAD\` +
      \`&keywords=\${query}\` +
      \`&sortOrder=EndTimeSoonest\` +
      \`&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true\` +
      \`&outputSelector(0)=SellerInfo\` +
      \`&paginationInput.entriesPerPage=6\`;

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
    { platform: 'eBay', url: \`https://www.ebay.com/sch/i.html?_nkw=\${enc}&LH_Sold=1&LH_Complete=1\`, color: '#e53238' },
    { platform: 'Depop', url: \`https://www.depop.com/search/?q=\${enc}\`, color: '#ff2300' },
    { platform: 'Poshmark', url: \`https://poshmark.com/search?query=\${enc}&availability=sold_out\`, color: '#f05537' },
    { platform: 'Mercari', url: \`https://www.mercari.com/search/?keyword=\${enc}\`, color: '#ff0211' },
    { platform: 'ThredUp', url: \`https://www.thredup.com/products?search_text=\${enc}\`, color: '#5fa81b' }
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

`;

server = server.replace(
  `app.get('/docs',`,
  similarEndpoint + `app.get('/docs',`
);

fs.writeFileSync(serverPath, server, 'utf8');
console.log('server.js patched');

// ── FRONTEND PATCH ──────────────────────────────────────────────────────────
const htmlPath = 'C:/Users/Jorden/apps/flipiq/public/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');

// Add CSS for similar section
const similarCSS = `
.similar-section{margin-top:0;}
.similar-loading{text-align:center;padding:20px 0;color:var(--text-muted);font-size:13px;}
.similar-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;}
.sim-card{background:var(--card2);border:1px solid var(--border);border-radius:10px;overflow:hidden;text-decoration:none;display:block;transition:border-color .15s;}
.sim-card:hover{border-color:var(--accent);}
.sim-img{width:100%;height:110px;object-fit:cover;background:var(--card);display:block;}
.sim-img-placeholder{width:100%;height:110px;background:var(--card);display:flex;align-items:center;justify-content:center;}
.sim-img-placeholder svg{width:28px;height:28px;stroke:var(--text-muted);}
.sim-info{padding:8px 10px 10px;}
.sim-title{font-size:11px;color:var(--text-dim);line-height:1.4;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.sim-price{font-size:15px;font-weight:800;color:var(--success);}
.sim-badge{display:inline-block;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 6px;border-radius:4px;background:rgba(46,204,113,.12);color:var(--success);border:1px solid rgba(46,204,113,.25);margin-left:5px;vertical-align:middle;}
.search-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;}
.search-link-btn{padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;color:#fff;background:var(--card2);border:1px solid var(--border);transition:opacity .15s;display:flex;align-items:center;gap:5px;}
.search-link-btn:hover{opacity:.85;}
.search-links-label{font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px;}
`;

html = html.replace('</style>', similarCSS + '</style>');

// Add similar section card in results div, after pricing card and before profit calc card
const similarHTML = `
    <div class="result-card similar-section" id="similarSection" style="display:none;">
      <h3>Similar Sold Listings</h3>
      <div id="similarLoading" class="similar-loading">Loading comparable sales...</div>
      <div id="similarGrid" class="similar-grid" style="display:none;"></div>
      <div id="searchLinksWrap" style="display:none;">
        <div class="search-links-label">Search live listings</div>
        <div class="search-links" id="searchLinks"></div>
      </div>
    </div>
`;

html = html.replace(
  `<div class="result-card">
      <h3>Profit Calculator</h3>`,
  similarHTML + `<div class="result-card">
      <h3>Profit Calculator</h3>`
);

// Add JS for fetching similar listings
const similarJS = `
async function loadSimilarListings(analysis) {
  const sec = document.getElementById('similarSection');
  const loading = document.getElementById('similarLoading');
  const grid = document.getElementById('similarGrid');
  const linksWrap = document.getElementById('searchLinksWrap');
  const linksEl = document.getElementById('searchLinks');
  sec.style.display = 'block';
  loading.style.display = 'block';
  grid.style.display = 'none';
  linksWrap.style.display = 'none';
  grid.innerHTML = '';
  linksEl.innerHTML = '';
  try {
    const q = [analysis.brand !== 'Unknown' ? analysis.brand : '', analysis.item_name].filter(Boolean).join(' ').trim();
    const res = await fetch('/api/similar?q=' + encodeURIComponent(q) + '&category=' + encodeURIComponent(analysis.category || ''));
    const data = await res.json();
    loading.style.display = 'none';
    if (data.results && data.results.length > 0) {
      data.results.forEach(item => {
        const card = document.createElement('a');
        card.className = 'sim-card';
        card.href = item.url || '#';
        card.target = '_blank';
        card.rel = 'noopener';
        const imgHTML = item.image
          ? '<img class="sim-img" src="' + item.image + '" alt="" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=sim-img-placeholder><svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke-width=\\'1.5\\' stroke-linecap=\\'round\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><polyline points=\\'21 15 16 10 5 21\\'/></svg></div>\'">'
          : '<div class="sim-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
        const price = item.price ? '$' + parseFloat(item.price).toFixed(2) : 'Sold';
        card.innerHTML = imgHTML + '<div class="sim-info"><div class="sim-title">' + esc(item.title) + '</div><div class="sim-price">' + price + '<span class="sim-badge">Sold</span></div></div>';
        grid.appendChild(card);
      });
      grid.style.display = 'grid';
    }
    if (data.search_links && data.search_links.length > 0) {
      data.search_links.forEach(sl => {
        const a = document.createElement('a');
        a.className = 'search-link-btn';
        a.href = sl.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.borderColor = sl.color + '44';
        a.style.color = sl.color;
        a.textContent = sl.platform;
        linksEl.appendChild(a);
      });
      linksWrap.style.display = 'block';
    }
    if (data.no_key && (!data.results || !data.results.length)) {
      loading.style.display = 'block';
      loading.textContent = 'Add EBAY_APP_ID to enable sold price data.';
    }
  } catch(e) {
    loading.textContent = 'Could not load comparables.';
  }
}

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
`;

// Inject similarJS before closing </script>
html = html.replace('</script>', similarJS + '\n</script>');

// Call loadSimilarListings after renderResults
html = html.replace(
  `results.style.display='block';results.scrollIntoView({behavior:'smooth',block:'start'});`,
  `results.style.display='block';results.scrollIntoView({behavior:'smooth',block:'start'});loadSimilarListings(d);`
);

// Also reset similar section on newScan
html = html.replace(
  `listingOutput.style.display='none';hideResults();hideError();`,
  `listingOutput.style.display='none';document.getElementById('similarSection').style.display='none';hideResults();hideError();`
);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('index.html patched, size:', html.length);
