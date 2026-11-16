// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol
// detail view with the model's own inputs and the farm plan, the live-token
// market the multiples come from, and the model's own page. No network: every
// byte it shows is in data.js. The page recomputes each row from the snapshot
// figures and checks the number board.json carries, so the page's code and the
// board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var MODEL = DATA.model;
  var ROWS = DATA.rows;
  var WATCH = {};
  DATA.watchlist_rows.forEach(function (s) { WATCH[s] = true; });
  var state = { q: '', category: 'all', chain: 'all', tab: 'board', sort: 'implied', watch: false, selected: null, page: 0 };
  var PAGE = 50;

  var app = document.getElementById('app');
  var detail = document.getElementById('detail');
  var foot = document.getElementById('foot');

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function ageFmt(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The model in one function: the same arithmetic lib/model.ts runs, so the
  // number on screen is the number board.json carries.
  function impliedOf(row) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthF = 1 + (growth / 100) * MODEL.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturityF = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    var breadthF = 1 + MODEL.breadth_step * Math.min(Math.max((row.chains || []).length - 1, 0), MODEL.breadth_max);
    return { implied: Math.max(1, Math.round(row.tvl_usd * row.multiple * growthF * maturityF * breadthF)), growth: growth, growthF: growthF, maturityF: maturityF, breadthF: breadthF, age: age };
  }

  // The farm plan is the same derivation main.ts writes to board.json: category,
  // chains, TVL and age decide the action, the capital, the hold and every cost
  // and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 120;
    if (p.tvl_usd >= 1e7) return 60;
    return 30;
  }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 'about $8 of gas';
    if (c.indexOf('solana') >= 0) return 'under $0.10 of fees';
    if (c.indexOf('bitcoin') >= 0 || c.indexOf('tron') >= 0) return 'about $2 of fees';
    return 'about $1 of gas';
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 45;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('onchain capital allocator') >= 0 || c.indexOf('curator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateralized') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the deposit open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the position in range.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-yield vault on " + chain + ' and leave it compounding.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the yield-bearing asset on ' + name + ' on ' + chain + ' and hold it in your wallet.';
    if (c.indexOf('basis trading') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('stablecoin') >= 0 || c.indexOf('stable') >= 0) return 'Mint $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ', then use the bridged funds in its app.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and take one position in a market on ' + name + ' that settles after the snapshot.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipts in the app.';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + ' of the governance asset through ' + name + ' on ' + chain + ' and vote on one proposal.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + "'s chain and use one of its native apps.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + Math.round(capital / 4) + ' against the deposit on ' + name + ' and repay it within a week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Swap $' + Math.round(capital / 2) + " through " + name + "'s pool on " + chain + ' and keep the receipt.';
    if (c.indexOf('yield') >= 0 || c.indexOf('risk curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('curator') >= 0) return 'Deposit a second $' + Math.round(capital / 2) + ' into a different vault on ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Buy another $' + Math.round(capital / 2) + ' of the asset after one week and hold both lots.';
    if (c.indexOf('basis') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Close the first position, then open a second one half its size on ' + name + '.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Delegate a further $' + Math.round(capital / 2) + ' through ' + name + ' to a second validator.';
    if (c.indexOf('governance') >= 0) return 'Vote on a second proposal on ' + name + ' and leave a comment in its forum.';
    return 'Use ' + name + ' a second time on ' + chain + ': one more deposit, swap or vote, on a different day.';
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var steps = [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + Math.max(5, Math.round(capital / 4)) + ' of capital and ' + gas, time: '10 minutes' },
      { text: 'Do one qualifying action a week — a deposit, a swap, a borrow or a vote — so the wallet stays active.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days, so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points page from the link it publishes and claim only there; write every transaction in a farm log.", cost: 'no fee to check, and never pay anyone to claim', time: '10 minutes' }
    ];
    return steps.map(function (s) {
      var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      if (t.length > 600) t = t.slice(0, 596) + '...';
      if (t.length < 20) t = t + " Hold the position and check the protocol's own page.";
      return { text: s.text, cost: s.cost, time: s.time };
    });
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = ROWS.filter(function (r) {
      if (state.watch && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var dir = 1;
    var key = state.sort;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d === null ? -Infinity : a.change_7d; vb = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else { va = a.implied_value_usd; vb = b.implied_value_usd; }
      return (vb - va) * dir || (a.slug < b.slug ? -1 : 1);
    });
    return rows;
  }

  function renderStats() {
    var s = document.getElementById('stats');
    s.innerHTML = '';
    var top = ROWS[0];
    [['Board rows', DATA.board_size], ['Watchlist', DATA.watchlist_size], ['Top implied', top ? usd(top.implied_value_usd) : '—'], ['Snapshot', DATA.as_of]].forEach(function (kv) {
      var d = el('div', {}, el('dt', { text: kv[0] }), el('dd', { text: String(kv[1]) }));
      s.appendChild(d);
    });
  }

  function fillSelects() {
    var cats = {};
    var chains = {};
    ROWS.forEach(function (r) {
      cats[r.category || 'Uncategorised'] = true;
      (r.chains || []).forEach(function (c) { chains[c] = true; });
    });
    var cat = document.getElementById('category');
    cat.innerHTML = '<option value="all">All categories</option>' + Object.keys(cats).sort().map(function (c) { return '<option' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    var ch = document.getElementById('chain');
    ch.innerHTML = '<option value="all">All chains</option>' + Object.keys(chains).sort().map(function (c) { return '<option' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  }

  function rowHtml(r, maxImplied) {
    var v = impliedOf(r);
    var checked = v.implied === r.implied_value_usd ? '' : ' ⚠';
    var g = r.change_7d === null ? '<span class="muted">n/a</span>' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>';
    var tr = el('tr', { 'data-slug': r.slug, 'class': state.selected === r.slug ? 'sel' : '', onclick: function () { select(r.slug); } },
      el('td', { 'class': 'rank', text: '#' + r.rank }),
      el('td', { 'class': 'name' },
        el('b', { text: r.name }),
        el('span', { text: (r.category || 'Uncategorised') + ' · ' + (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '') })),
      el('td', { 'class': 'num', text: usd(r.tvl_usd) }),
      el('td', { 'class': 'num', html: g }),
      el('td', { 'class': 'num', text: ageFmt(r.age_days) }),
      el('td', { 'class': 'num' },
        el('div', { text: usd(r.implied_value_usd) + checked }),
        el('div', { 'class': 'bar' }, el('i', { style: 'width:' + Math.max(2, Math.round(100 * r.implied_value_usd / maxImplied)) + '%' }))));
    if (WATCH[r.slug]) {
      var nameCell = tr.children[1];
      nameCell.insertBefore(el('span', { 'class': 'pill watch', text: 'WATCHLIST' }), nameCell.firstChild);
    }
    return tr;
  }

  function renderBoard() {
    var rows = filtered();
    var maxImplied = ROWS.length ? ROWS[0].implied_value_usd : 1;
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    var slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
    app.innerHTML = '';
    app.appendChild(el('p', { 'class': 'count', html: '<b>' + rows.length + '</b> of ' + ROWS.length + ' pre-token protocols · ranked by implied value · every watchlist protocol is on the board' }));
    if (rows.length === 0) { app.appendChild(el('p', { 'class': 'empty', text: 'No protocol matches this filter.' })); return; }
    var table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { text: 'Rank' }), el('th', { text: 'Protocol' }), el('th', { 'class': 'num', text: 'TVL' }),
        el('th', { 'class': 'num', text: '7d' }), el('th', { 'class': 'num', text: 'Age' }), el('th', { 'class': 'num', text: 'Implied value' }))),
      el('tbody', {}));
    var tb = table.querySelector('tbody');
    slice.forEach(function (r) { tb.appendChild(rowHtml(r, maxImplied)); });
    app.appendChild(table);
    var pager = el('div', { 'class': 'pager' },
      el('button', { text: '← Previous', disabled: state.page === 0 ? true : null, onclick: function () { state.page--; render(); } }),
      el('span', { text: 'Page ' + (state.page + 1) + ' of ' + pages }),
      el('button', { text: 'Next →', disabled: state.page >= pages - 1 ? true : null, onclick: function () { state.page++; render(); } }));
    app.appendChild(pager);
  }

  function renderLive() {
    app.innerHTML = '';
    app.appendChild(el('p', { 'class': 'count', html: '<b>' + DATA.live.length + '</b> live-token protocols by market cap — the market the multiples are calibrated from. Their token already trades, so the board shows the market\u2019s own value, never a model\u2019s.' }));
    var table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { text: 'Protocol' }), el('th', { 'class': 'num', text: 'TVL' }),
        el('th', { 'class': 'num', text: 'Market cap' }), el('th', { 'class': 'num', text: 'Mcap / TVL' }), el('th', { 'class': 'num', text: '7d' }))),
      el('tbody', {}));
    var tb = table.querySelector('tbody');
    DATA.live.forEach(function (r) {
      tb.appendChild(el('tr', {},
        el('td', { 'class': 'name' }, el('b', { text: r.name }), el('span', { text: (r.category || 'Uncategorised') + ' · ' + (r.chains || []).slice(0, 3).join(', ') })),
        el('td', { 'class': 'num', text: usd(r.tvl_usd) }),
        el('td', { 'class': 'num', text: usd(r.mcap_usd) }),
        el('td', { 'class': 'num', text: r.multiple.toFixed(3) + '×' }),
        el('td', { 'class': 'num', html: r.change_7d === null ? 'n/a' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>' })));
    });
    app.appendChild(table);
  }

  function renderModelTab() {
    app.innerHTML = '';
    var cal = DATA.calibration;
    var rows = Object.keys(cal.by_category).sort().map(function (c) {
      return '<tr><td>' + esc(c) + '</td><td>' + cal.by_category[c].multiple.toFixed(3) + '×</td><td>' + cal.by_category[c].peers + '</td></tr>';
    }).join('');
    app.appendChild(el('div', { html:
      '<h2 style="font-size:18px;margin:4px 0 8px">How the value is built — model ' + esc(DATA.model_version) + '</h2>' +
      '<p style="color:var(--muted);max-width:900px">Every implied value is TVL × a multiple the market itself sets, adjusted for growth, for how long the protocol has run with no token, and for how many chains it runs on. No protocol name is ever special-cased.</p>' +
      '<p><code>implied = TVL × multiple × growth × maturity × breadth</code></p>' +
      '<p style="color:var(--muted);max-width:900px">multiple = the median market-cap / TVL of the live-token protocols in the same category (at least ' + MODEL.min_peers + ' peers), else the median over all ' + cal.global.peers + ' live-token protocols; clamped to [' + MODEL.multiple_floor + ', ' + MODEL.multiple_cap + ']. growth = 1 + clamp(7-day change, ' + MODEL.growth_floor + '%, ' + MODEL.growth_cap + '%) / 100 × ' + MODEL.growth_weight + '. maturity = ' + MODEL.maturity_floor + ' + ' + MODEL.maturity_range + ' × min(age, ' + MODEL.maturity_days + 'd) / ' + MODEL.maturity_days + 'd. breadth = 1 + ' + MODEL.breadth_step + ' × min(chains − 1, ' + MODEL.breadth_max + ').</p>' +
      '<table class="model"><thead><tr><th>Category</th><th>Multiple</th><th>Live peers</th></tr></thead><tbody>' + rows +
      '<tr><td>All live-token protocols (fallback)</td><td>' + cal.global.multiple.toFixed(3) + '×</td><td>' + cal.global.peers + '</td></tr></tbody></table>' +
      '<p class="note">Implied value is this radar\u2019s claim about what a token would be worth if the protocol\u2019s record stayed as it is. It is not a prediction that a token will be issued, or when. A protocol is shown as pre-token when its record carries no token — the record is not proof it has none.</p>'
    }));
  }

  function select(slug) {
    state.selected = state.selected === slug ? null : slug;
    render();
    if (state.selected) {
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function renderDetail() {
    if (!state.selected) { detail.hidden = true; detail.innerHTML = ''; return; }
    var r = null;
    for (var i = 0; i < ROWS.length; i++) if (ROWS[i].slug === state.selected) { r = ROWS[i]; break; }
    if (!r) { detail.hidden = true; return; }
    var v = impliedOf(r);
    var steps = farmSteps(r);
    detail.hidden = false;
    detail.innerHTML = '';
    detail.appendChild(el('button', { 'class': 'close', text: 'Close ×', onclick: function () { state.selected = null; render(); } }));
    detail.appendChild(el('h2', { text: '#' + r.rank + ' · ' + r.name }));
    detail.appendChild(el('p', { 'class': 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains || []).join(', ') + ' · records no token · listed ' + (r.listed_at || 'unknown') + ' · snapshot ' + DATA.as_of }));
    var kv = el('dl', { 'class': 'kv' });
    [['TVL', usd(r.tvl_usd), 'locked in the protocol'], ['7-day change', r.change_7d === null ? 'n/a' : pct(r.change_7d), 'TVL movement, 7 days'], ['Age without a token', ageFmt(r.age_days), 'since first tracked'], ['Implied value', usd(r.implied_value_usd), 'this radar\u2019s claim']].forEach(function (k) {
      kv.appendChild(el('div', {}, el('dt', { text: k[0] }), el('dd', {}, document.createTextNode(k[1]), el('small', { text: k[2] }))));
    });
    detail.appendChild(kv);
    detail.appendChild(el('h3', { text: 'How the value is built' }));
    var rows = [
      ['TVL', usd(r.tvl_usd), ''],
      ['× multiple (' + r.multiple_source + ', ' + r.multiple_peers + ' live peers)', r.multiple.toFixed(3) + '×', 'median mcap / TVL'],
      ['× growth (7d ' + (r.change_7d === null ? 'n/a' : pct(r.change_7d)) + ')', v.growthF.toFixed(3) + '×', ''],
      ['× maturity (' + ageFmt(r.age_days) + ' with no token)', v.maturityF.toFixed(3) + '×', ''],
      ['× breadth (' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + ')', v.breadthF.toFixed(3) + '×', '']
    ];
    var mt = el('table', { 'class': 'model' },
      el('thead', {}, el('tr', {}, el('th', { text: 'Factor' }), el('th', { text: 'Value' }), el('th', { text: 'Note' }))));
    var mb = el('tbody', {});
    rows.forEach(function (row) { mb.appendChild(el('tr', {}, el('td', { text: row[0] }), el('td', { text: row[1] }), el('td', { 'class': 'note', text: row[2] }))); });
    mb.appendChild(el('tr', { 'class': 'total' }, el('td', { text: 'Implied value' }), el('td', { text: usd(r.implied_value_usd) }), el('td', { text: v.implied === r.implied_value_usd ? 'matches board.json' : 'differs from board.json' })));
    mt.appendChild(mb);
    detail.appendChild(mt);
    detail.appendChild(el('h3', { text: 'Farm plan — six steps' }));
    var ol = el('ol', { 'class': 'steps' });
    steps.forEach(function (s) {
      ol.appendChild(el('li', {}, document.createTextNode(s.text), el('div', { 'class': 'meta', html: '<b>Cost:</b> ' + esc(s.cost) + ' &nbsp;·&nbsp; <b>Time:</b> ' + esc(s.time) })));
    });
    detail.appendChild(ol);
    detail.appendChild(el('p', { 'class': 'note', text: 'This plan is derived from the protocol\u2019s own record — its category, chains, TVL and age — and never from a list of names. Costs are estimates; check the protocol\u2019s own page before you move funds. Never pay anyone to claim an airdrop.' }));
  }

  function renderFoot() {
    foot.innerHTML = '<h2>Method</h2>' +
      '<p>Snapshot: ' + esc(DATA.source) + ', as of ' + esc(DATA.as_of) + '. The watchlist holds ' + DATA.watchlist_size + ' protocols at or above ' + usd(DATA.floor_usd) + ' of TVL that record no token and are not a wrapped, staked or bridged product of a token that already trades. This board ranks all ' + DATA.board_size + ' rankable pre-token protocols (' + DATA.watchlist_size + ' watchlist + ' + DATA.early_size + ' early), strongest implied value first.</p>' +
      '<p>Implied value is the radar\u2019s claim, never make.fun\u2019s, and never a prediction that a token will be issued. A protocol shown as pre-token records no token in DefiLlama — that is not proof it has none.</p>';
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    document.getElementById('controls').style.display = tab === 'board' ? '' : 'none';
    render();
  }

  function render() {
    renderStats();
    if (state.tab === 'live') renderLive();
    else if (state.tab === 'model') renderModelTab();
    else renderBoard();
    renderDetail();
    renderFoot();
    writeHash();
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('watch') === '1') state.watch = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.selected) params.set('p', state.selected);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.watch) params.set('watch', '1');
    var h = params.toString();
    var next = h ? '#' + h : '';
    if (window.location.hash !== next) history.replaceState(null, '', next);
  }

  readHash();
  fillSelects();
  document.getElementById('q').value = state.q;
  document.getElementById('watch').checked = state.watch;
  document.getElementById('sort').value = state.sort;
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; state.page = 0; renderBoard(); writeHash(); });  document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; state.page = 0; render(); });
  document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; state.page = 0; render(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  document.getElementById('watch').addEventListener('change', function (e) { state.watch = e.target.checked; state.page = 0; render(); });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
  setTab(state.tab === 'live' || state.tab === 'model' ? state.tab : 'board');
  // A deep link to a protocol (#p=slug) opens on its detail view, not on the
  // top of a fifty-row table: the detail is the point of the link.
  if (state.selected && !detail.hidden) detail.scrollIntoView({ behavior: 'auto', block: 'start' });
  app.setAttribute('aria-busy', 'false');
})();
