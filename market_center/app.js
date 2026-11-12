/**
 * 数据中心（原生页面）
 *
 * 数据源：
 * - 指数、板块、概念、涨停池：东方财富公开接口
 * - 涨跌分布、新闻：wx.hqzs.top（原数据中心仍在服役的接口）
 *
 * 运行在扩展页面里，依赖 manifest 的 host_permissions 放行上述域名。
 */
(function () {
  'use strict';

  var EAST_PUSH = 'https://push2.eastmoney.com';
  var EAST_ZT = 'https://push2ex.eastmoney.com';
  var HQZS = 'https://wx.hqzs.top';
  var ZT_UT = '7eea3edcaed734bea9cbfc24409ed989';
  var INDEX_SECIDS = '1.000001,0.399001,0.399006,1.000300';

  var tabsEl = document.getElementById('mc-tabs');
  var viewEl = document.getElementById('mc-view');
  var statusEl = document.getElementById('mc-status');
  var activeKey = 'overview';
  var refreshFn = null;
  var autoFn = null;

  // ---------- 工具 ----------

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function nowTime() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function todayStr() {
    var d = new Date();
    return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function isNum(v) {
    return v !== null && v !== undefined && v !== '' && !isNaN(v);
  }

  function fmtNum(v, digits) {
    return isNum(v) ? Number(v).toFixed(digits === undefined ? 2 : digits) : '--';
  }

  function fmtPct(v) {
    if (!isNum(v)) return '--';
    return (v > 0 ? '+' : '') + Number(v).toFixed(2) + '%';
  }

  function fmtMoney(v) {
    if (!isNum(v)) return '--';
    var n = Number(v);
    var abs = Math.abs(n);
    if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (abs >= 1e4) return (n / 1e4).toFixed(2) + '万';
    return n.toFixed(0);
  }

  function fmtHms(v) {
    if (!isNum(v)) return '--';
    var s = String(v).padStart(6, '0');
    return s.slice(0, 2) + ':' + s.slice(2, 4) + ':' + s.slice(4, 6);
  }

  function fmtNewsTime(ts) {
    if (!isNum(ts)) return '';
    var d = new Date(Number(ts) * 1000);
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function trendClass(v) {
    if (!isNum(v) || Number(v) === 0) return 'mc-flat';
    return Number(v) > 0 ? 'mc-up' : 'mc-down';
  }

  function setStatus(text, isError) {
    statusEl.textContent = text || '';
    statusEl.className = isError ? 'mc-error' : '';
  }

  async function getJSON(url, timeout, retries) {
    var attempts = retries == null ? 2 : retries;
    var lastError;
    for (var i = 0; i < attempts; i++) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, timeout || 12000);
      try {
        var res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        lastError = e;
        if (i < attempts - 1) await new Promise(function (r) { setTimeout(r, 400); });
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  function card(title, hint) {
    var root = el('section', 'mc-card');
    var head = el('div', 'mc-card-head');
    head.appendChild(el('span', null, title));
    if (hint) head.appendChild(el('span', 'mc-hint', hint));
    var body = el('div', 'mc-card-body');
    root.appendChild(head);
    root.appendChild(body);
    return { root: root, head: head, body: body };
  }

  function errorBlock(text) {
    return el('div', 'mc-empty mc-error', text || '数据加载失败');
  }

  // ---------- 数据 ----------

  async function fetchIndices() {
    var url = EAST_PUSH + '/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f6,f12,f13,f14&secids=' + INDEX_SECIDS;
    try {
      var json = await getJSON(url, 8000, 2);
      var diff = json && json.data && json.data.diff;
      if (Array.isArray(diff) && diff.length) return diff;
    } catch (e) {
      // 东财偶发空响应/限流，降到腾讯行情兜底
    }
    return fetchIndicesTencent();
  }

  // 腾讯行情兜底（GBK 文本），字段：name, code, price, change, pct, volume, amount(万元)
  async function fetchIndicesTencent() {
    var res = await fetch('https://qt.gtimg.cn/q=s_sh000001,s_sz399001,s_sz399006,s_sh000300', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var buf = await res.arrayBuffer();
    var text = new TextDecoder('gbk').decode(buf);
    var out = [];
    text.split('\n').forEach(function (line) {
      var match = line.match(/v_s_(\w+)="([^"]*)"/);
      if (!match) return;
      var parts = match[2].split('~');
      if (parts.length < 8) return;
      out.push({
        f14: parts[1],
        f12: parts[2],
        f2: Number(parts[3]),
        f4: Number(parts[4]),
        f3: Number(parts[5]),
        f6: Number(parts[7]) * 10000
      });
    });
    if (!out.length) throw new Error('指数数据异常');
    return out;
  }

  async function fetchDist() {
    var json = await getJSON(HQZS + '/api/market_ZDfenbuData');
    if (!json || json.status !== '000' || !Array.isArray(json.data)) throw new Error((json && json.message) || '涨跌分布异常');
    var counts = {};
    json.data.forEach(function (item) {
      Object.keys(item).forEach(function (key) {
        counts[Number(key)] = item[key];
      });
    });
    return counts;
  }

  async function fetchZtPool() {
    return fetchPool('getTopicZTPool', 'fbt:asc');
  }

  async function fetchDtPool() {
    return fetchPool('getTopicDTPool', 'fund:asc');
  }

  async function fetchPool(api, sort) {
    var date = todayStr();
    var url = EAST_ZT + '/' + api + '?ut=' + ZT_UT + '&dpt=wz.ztzt&Pageindex=0&pagesize=100&sort=' +
      encodeURIComponent(sort) + '&date=' + date;
    var json = await getJSON(url);
    var data = (json && json.data) || {};
    var list = data.pool || data.data || [];
    return {
      date: data.qdate ? String(data.qdate) : date,
      total: isNum(data.tc) ? data.tc : list.length,
      list: list
    };
  }

  async function fetchBoards(kind) {
    var fs = kind === 'concept' ? 'm:90+t:3+f:!50' : 'm:90+t:2+f:!50';
    var fields = 'f12,f14,f2,f3,f4,f62,f184,f66,f69,f104,f105,f106';
    var url = EAST_PUSH + '/api/qt/clist/get?pn=1&pz=300&po=1&np=1&fltt=2&invt=2&fid=f3&fs=' + fs + '&fields=' + fields;
    try {
      var json = await getJSON(url, 10000, 2);
      var diff = json && json.data && json.data.diff;
      if (Array.isArray(diff) && diff.length) return diff;
    } catch (e) {
      // 东财偶发空响应/限流，降到腾讯板块排行兜底
    }
    return fetchBoardsTencent(kind);
  }

  // 腾讯板块排行兜底。zljlr 单位：万元
  async function fetchBoardsTencent(kind) {
    var boardType = kind === 'concept' ? 'gn' : 'hy';
    var pageSize = 200; // 腾讯接口单页上限 200
    var maxPages = kind === 'concept' ? 4 : 1;
    var list = [];
    for (var page = 0; page < maxPages; page++) {
      var url = 'https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=' + boardType +
        '&sort_type=priceRatio&direct=down&offset=' + page * pageSize + '&count=' + pageSize;
      var json = await getJSON(url);
      var batch = json && json.data && json.data.rank_list;
      if (!Array.isArray(batch) || !batch.length) break;
      list = list.concat(batch);
      if (batch.length < pageSize) break;
    }
    if (!list.length) throw new Error('板块数据异常');
    return list.map(function (item) {
      var up = 0;
      var total = 0;
      var parts = String(item.zgb || '').split('/');
      if (parts.length === 2) {
        up = Number(parts[0]) || 0;
        total = Number(parts[1]) || 0;
      }
      return {
        f12: item.code,
        f14: item.name,
        f3: Number(item.zdf),
        f62: Number(item.zljlr) * 10000,
        f184: null,
        f66: null,
        f69: null,
        f104: up,
        f105: Math.max(0, total - up)
      };
    });
  }

  async function fetchNews(page) {
    var json = await getJSON(HQZS + '/news?page=' + page);
    if (!json || !json.data || !Array.isArray(json.data.data)) throw new Error('新闻数据异常');
    return json.data.data;
  }

  // ---------- 通用渲染 ----------

  function statItem(label, value, cls) {
    var wrap = el('span');
    wrap.appendChild(document.createTextNode(label + ' '));
    var b = el('b', cls, String(value));
    wrap.appendChild(b);
    return wrap;
  }

  function sortRows(rows, key, dir) {
    return rows.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      var an = isNum(av) ? Number(av) : -Infinity;
      var bn = isNum(bv) ? Number(bv) : -Infinity;
      return (an - bn) * dir;
    });
  }

  function makeTable(columns, rows, onSort) {
    var wrap = el('div', 'mc-table-wrap');
    var table = el('table', 'mc-table');
    var thead = el('thead');
    var tr = el('tr');
    columns.forEach(function (col) {
      var canSort = !!(col.sortable || col.key);
      var th = el('th', canSort ? 'sortable' : '', col.label);
      if (canSort) {
        th.title = '点击排序';
        th.addEventListener('click', function () {
          if (onSort) onSort(col.key);
        });
      }
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function (row) {
      var trb = el('tr');
      columns.forEach(function (col) {
        var td = el('td');
        col.render(td, row);
        trb.appendChild(td);
      });
      tbody.appendChild(trb);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function textCell(td, text, cls) {
    td.textContent = text;
    if (cls) td.className = cls;
  }

  // ---------- 大盘 ----------

  function renderIndices(grid, result) {
    grid.innerHTML = '';
    if (result.status !== 'fulfilled') {
      grid.appendChild(errorBlock('指数行情加载失败'));
      return;
    }
    result.value.forEach(function (item) {
      var box = el('div', 'mc-index');
      box.appendChild(el('div', 'name', item.f14 || item.f12));
      box.appendChild(el('div', 'price ' + trendClass(item.f3), fmtNum(item.f2, 2)));
      var delta = el('div', 'delta ' + trendClass(item.f3));
      delta.textContent = fmtPct(item.f3) + '  ' + (isNum(item.f4) && item.f4 > 0 ? '+' : '') + fmtNum(item.f4, 2);
      box.appendChild(delta);
      var amount = el('div', 'delta mc-flat');
      amount.textContent = '成交额 ' + fmtMoney(item.f6);
      box.appendChild(amount);
      grid.appendChild(box);
    });
  }

  function sumRange(counts, from, to) {
    var total = 0;
    for (var i = from; i <= to; i++) total += counts[i] || 0;
    return total;
  }

  // 按板块区分 10cm / 20cm / 30cm / ST
  function limitTiers(list) {
    var tiers = { c10: 0, c20: 0, c30: 0, st: 0 };
    (list || []).forEach(function (item) {
      var code = String(item.c || '');
      var name = String(item.n || '');
      if (name.indexOf('ST') > -1) tiers.st++;
      else if (/^(30|68)/.test(code)) tiers.c20++;
      else if (/^(4|8|92)/.test(code)) tiers.c30++;
      else tiers.c10++;
    });
    return tiers;
  }

  function tierText(tiers, total, shown) {
    var text = '10cm ' + tiers.c10 + ' / 20cm ' + tiers.c20 + ' / 30cm ' + tiers.c30 + ' / ST ' + tiers.st;
    if (shown > 0 && shown < total) text += '（按前 ' + shown + ' 只统计）';
    return text;
  }

  function renderDist(body, result, ztResult, dtResult) {
    body.innerHTML = '';
    if (result.status !== 'fulfilled') {
      body.appendChild(errorBlock('涨跌分布加载失败'));
      return;
    }
    var counts = result.value;
    var zt = ztResult.status === 'fulfilled' ? ztResult.value : { total: 0, list: [] };
    var dt = dtResult.status === 'fulfilled' ? dtResult.value : { total: 0, list: [] };
    var ztTotal = zt.total || 0;
    var dtTotal = dt.total || 0;
    var ztTiers = limitTiers(zt.list);
    var dtTiers = limitTiers(dt.list);

    // 上游只给 ±11 的 23 档，20cm/30cm 的票会全挤在第 11 档。
    // 这里并成 9 个区间，并用涨跌停池把 10cm/20cm/30cm/ST 单独拆出来。
    var buckets = [
      { label: '跌停', count: dtTotal, trend: 'down', tier: tierText(dtTiers, dtTotal, (dt.list || []).length) },
      { label: '跌>8%', count: Math.max(0, sumRange(counts, -11, -8) - dtTotal), trend: 'down' },
      { label: '跌5~8%', count: sumRange(counts, -7, -5), trend: 'down' },
      { label: '跌3~5%', count: sumRange(counts, -4, -3), trend: 'down' },
      { label: '跌0~3%', count: sumRange(counts, -2, -1), trend: 'down' },
      { label: '平', count: counts[0] || 0, trend: 'flat' },
      { label: '涨0~3%', count: sumRange(counts, 1, 2), trend: 'up' },
      { label: '涨3~5%', count: sumRange(counts, 3, 4), trend: 'up' },
      { label: '涨5~8%', count: sumRange(counts, 5, 7), trend: 'up' },
      { label: '涨>8%', count: Math.max(0, sumRange(counts, 8, 11) - ztTotal), trend: 'up' },
      { label: '涨停', count: ztTotal, trend: 'up', tier: tierText(ztTiers, ztTotal, (zt.list || []).length) }
    ];

    var up = buckets[6].count + buckets[7].count + buckets[8].count + buckets[9].count + buckets[10].count;
    var flat = buckets[5].count;
    var down = buckets[0].count + buckets[1].count + buckets[2].count + buckets[3].count + buckets[4].count;

    var summary = el('div', 'mc-breadth');
    summary.appendChild(statItem('上涨', up, 'mc-up'));
    summary.appendChild(statItem('平盘', flat, 'mc-flat'));
    summary.appendChild(statItem('下跌', down, 'mc-down'));
    summary.appendChild(statItem('涨停', ztTotal, 'mc-up'));
    summary.appendChild(statItem('跌停', dtTotal, 'mc-down'));
    body.appendChild(summary);

    var tip = el('div', 'mc-dist-tip');
    tip.hidden = true;

    function moveTip(e) {
      var x = e.clientX + 12;
      var y = e.clientY + 12;
      var w = tip.offsetWidth;
      var h = tip.offsetHeight;
      if (x + w > window.innerWidth - 8) x = e.clientX - w - 12;
      if (y + h > window.innerHeight - 8) y = e.clientY - h - 12;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }

    var max = 1;
    buckets.forEach(function (bucket) { max = Math.max(max, bucket.count); });

    var bars = el('div', 'mc-dist-bars');
    var labels = el('div', 'mc-dist-labels');
    buckets.forEach(function (bucket) {
      var col = el('div', 'mc-dist-col');
      var bar = el('div', 'bar ' + bucket.trend);
      bar.style.height = Math.max(1, Math.round(bucket.count / max * 80)) + 'px';
      col.appendChild(bar);
      col.addEventListener('mouseenter', function (e) {
        tip.textContent = bucket.label + '：' + bucket.count + ' 家' + (bucket.tier ? '（' + bucket.tier + '）' : '');
        tip.hidden = false;
        moveTip(e);
      });
      col.addEventListener('mousemove', moveTip);
      col.addEventListener('mouseleave', function () { tip.hidden = true; });
      bars.appendChild(col);
      labels.appendChild(el('span', null, bucket.label));
    });
    body.appendChild(bars);
    body.appendChild(labels);
    body.appendChild(tip);
  }

  function renderZtPreview(body, result) {
    body.innerHTML = '';
    if (result.status !== 'fulfilled') {
      body.appendChild(errorBlock('涨停池加载失败'));
      return;
    }
    var list = result.value.list.slice().sort(function (a, b) {
      return (b.lbc || 0) - (a.lbc || 0) || (a.fbt || 0) - (b.fbt || 0);
    }).slice(0, 10);
    if (!list.length) {
      body.appendChild(el('div', 'mc-empty', '今日暂无涨停数据'));
      return;
    }
    var columns = [
      { label: '名称', render: function (td, r) { td.appendChild(el('div', null, r.n)); td.appendChild(el('div', 'code', r.c)); } },
      { label: '连板', render: function (td, r) { textCell(td, (r.lbc || 0) + '板', 'mc-up'); } },
      { label: '涨幅', render: function (td, r) { textCell(td, fmtPct(r.zdp), 'mc-up'); } },
      { label: '封单额', render: function (td, r) { textCell(td, fmtMoney(r.fund)); } },
      { label: '行业', render: function (td, r) { textCell(td, r.hybk || '--'); } }
    ];
    body.appendChild(makeTable(columns, list));
  }

  function mountOverview(view) {
    var idxGrid = el('div', 'mc-index-grid');
    var dist = card('涨跌分布', '单位：家');
    var zt = card('涨停池', '前 10 名');
    view.appendChild(idxGrid);
    view.appendChild(dist.root);
    view.appendChild(zt.root);

    async function load() {
      setStatus('更新中…');
      var results = await Promise.allSettled([fetchIndices(), fetchDist(), fetchZtPool(), fetchDtPool()]);
      var failed = false;
      results.forEach(function (r) { if (r.status !== 'fulfilled') failed = true; });
      renderIndices(idxGrid, results[0]);
      renderDist(dist.body, results[1], results[2], results[3]);
      renderZtPreview(zt.body, results[2]);
      if (results[2].status === 'fulfilled') {
        var hint = zt.head.querySelector('.mc-hint');
        hint.textContent = results[2].value.date + ' · 共 ' + results[2].value.total + ' 家';
      }
      setStatus('更新于 ' + nowTime() + (failed ? '（部分数据失败）' : ''), failed);
    }
    load();
    return load;
  }

  // ---------- 板块 / 概念 / 资金流 ----------

  function mountBoards(view, kind, initialSort) {
    var title = kind === 'concept' ? '概念板块' : '行业板块';
    var c = card(title, '点击表头排序');
    view.appendChild(c.root);
    var sortKey = initialSort || 'f3';
    var sortDir = -1;
    var rows = [];

    function render() {
      c.body.innerHTML = '';
      if (!rows.length) {
        c.body.appendChild(el('div', 'mc-empty', '暂无数据'));
        return;
      }
      var sorted = sortRows(rows, sortKey, sortDir);
      var columns = [
        { label: '板块', render: function (td, r) { td.appendChild(el('div', null, r.f14)); td.appendChild(el('div', 'code', r.f12)); } },
        { label: '涨跌幅', key: 'f3', sortable: true, render: function (td, r) { textCell(td, fmtPct(r.f3), trendClass(r.f3)); } },
        { label: '主力净额', key: 'f62', sortable: true, render: function (td, r) { textCell(td, fmtMoney(r.f62), trendClass(r.f62)); } },
        { label: '主力占比', key: 'f184', sortable: true, render: function (td, r) { textCell(td, fmtPct(r.f184), trendClass(r.f184)); } },
        { label: '超大单净额', key: 'f66', sortable: true, render: function (td, r) { textCell(td, fmtMoney(r.f66), trendClass(r.f66)); } },
        { label: '超大单占比', key: 'f69', sortable: true, render: function (td, r) { textCell(td, fmtPct(r.f69), trendClass(r.f69)); } },
        { label: '涨/跌', render: function (td, r) { textCell(td, (r.f104 || 0) + ' / ' + (r.f105 || 0)); } }
      ];
      c.body.appendChild(makeTable(columns, sorted, sortKey, sortDir, function (key) {
        if (sortKey === key) sortDir = -sortDir;
        else { sortKey = key; sortDir = -1; }
        render();
      }));
      var hint = c.head.querySelector('.mc-hint');
      hint.textContent = '按' + (sortKey === 'f3' ? '涨跌幅' : '主力净额') + (sortDir > 0 ? '升序' : '降序') + ' · 共 ' + rows.length + ' 个';
    }

    async function load() {
      setStatus('更新中…');
      try {
        rows = await fetchBoards(kind);
        render();
        setStatus('更新于 ' + nowTime());
      } catch (e) {
        c.body.innerHTML = '';
        c.body.appendChild(errorBlock('板块数据加载失败：' + (e && e.message || e)));
        setStatus('板块数据加载失败', true);
      }
    }
    load();
    return load;
  }

  function mountFlow(view) {
    var c = card('资金流排行', '按主力净额排序');
    var toggle = el('div', 'mc-toggle');
    var btnIndustry = el('button', 'active', '行业');
    var btnConcept = el('button', '', '概念');
    toggle.appendChild(btnIndustry);
    toggle.appendChild(btnConcept);
    c.head.appendChild(toggle);
    view.appendChild(c.root);
    var kind = 'industry';
    var rows = [];

    function render() {
      c.body.innerHTML = '';
      if (!rows.length) {
        c.body.appendChild(el('div', 'mc-empty', '暂无数据'));
        return;
      }
      var sorted = rows.slice().sort(function (a, b) { return (Number(b.f62) || 0) - (Number(a.f62) || 0); });
      var columns = [
        { label: '板块', render: function (td, r) { td.appendChild(el('div', null, r.f14)); td.appendChild(el('div', 'code', r.f12)); } },
        { label: '主力净额', render: function (td, r) { textCell(td, fmtMoney(r.f62), trendClass(r.f62)); } },
        { label: '主力占比', render: function (td, r) { textCell(td, fmtPct(r.f184), trendClass(r.f184)); } },
        { label: '超大单净额', render: function (td, r) { textCell(td, fmtMoney(r.f66), trendClass(r.f66)); } },
        { label: '涨跌幅', render: function (td, r) { textCell(td, fmtPct(r.f3), trendClass(r.f3)); } },
        { label: '涨/跌', render: function (td, r) { textCell(td, (r.f104 || 0) + ' / ' + (r.f105 || 0)); } }
      ];
      c.body.appendChild(makeTable(columns, sorted));
      var hint = c.head.querySelector('.mc-hint');
      hint.textContent = '按主力净额排序 · 共 ' + rows.length + ' 个';
    }

    async function load() {
      setStatus('更新中…');
      try {
        rows = await fetchBoards(kind);
        render();
        setStatus('更新于 ' + nowTime());
      } catch (e) {
        c.body.innerHTML = '';
        c.body.appendChild(errorBlock('资金流数据加载失败：' + (e && e.message || e)));
        setStatus('资金流数据加载失败', true);
      }
    }

    function setKind(next) {
      if (kind === next) return;
      kind = next;
      btnIndustry.classList.toggle('active', kind === 'industry');
      btnConcept.classList.toggle('active', kind === 'concept');
      load();
    }
    btnIndustry.addEventListener('click', function () { setKind('industry'); });
    btnConcept.addEventListener('click', function () { setKind('concept'); });
    load();
    return load;
  }

  // ---------- 涨停池 / 跌停池 ----------

  function poolColumns(isDt) {
    var columns = [
      { label: '代码', render: function (td, r) { textCell(td, r.c); } },
      { label: '名称', render: function (td, r) { textCell(td, r.n); } },
      { label: '现价', render: function (td, r) { textCell(td, fmtNum(r.p / 1000, 2), isDt ? 'mc-down' : 'mc-up'); } },
      { label: '涨跌幅', key: 'zdp', render: function (td, r) { textCell(td, fmtPct(r.zdp), isDt ? 'mc-down' : 'mc-up'); } }
    ];
    if (isDt) {
      columns.push({ label: '连跌', key: 'days', render: function (td, r) { textCell(td, (r.days || 0) + '天', 'mc-down'); } });
    } else {
      columns.push({ label: '连板', key: 'lbc', render: function (td, r) { textCell(td, (r.lbc || 0) + '板', 'mc-up'); } });
      columns.push({ label: '首封', render: function (td, r) { textCell(td, fmtHms(r.fbt)); } });
    }
    columns.push({ label: '最后封', render: function (td, r) { textCell(td, fmtHms(r.lbt)); } });
    columns.push({ label: '封单额', key: 'fund', render: function (td, r) { textCell(td, fmtMoney(r.fund)); } });
    if (isDt) {
      columns.push({ label: '开板', key: 'oc', render: function (td, r) { textCell(td, String(r.oc || 0)); } });
    } else {
      columns.push({ label: '炸板', key: 'zbc', render: function (td, r) { textCell(td, String(r.zbc || 0)); } });
    }
    columns.push({ label: '成交额', key: 'amount', render: function (td, r) { textCell(td, fmtMoney(r.amount)); } });
    columns.push({ label: '换手率', key: 'hs', render: function (td, r) { textCell(td, isNum(r.hs) ? Number(r.hs).toFixed(2) + '%' : '--'); } });
    columns.push({ label: '行业', render: function (td, r) { textCell(td, r.hybk || '--'); } });
    return columns;
  }

  function mountPool(view, options) {
    var c = card(options.title, '加载中…');
    view.appendChild(c.root);
    var rows = [];
    var sortKey = options.sortKey;
    var sortDir = -1;
    var meta = { date: '', total: 0 };

    function render() {
      c.body.innerHTML = '';
      c.head.querySelector('.mc-hint').textContent = meta.date + ' · 共 ' + meta.total + ' 家';
      if (!rows.length) {
        c.body.appendChild(el('div', 'mc-empty', options.empty));
        return;
      }
      c.body.appendChild(makeTable(poolColumns(options.isDt), sortRows(rows, sortKey, sortDir), function (key) {
        if (sortKey === key) sortDir = -sortDir;
        else { sortKey = key; sortDir = -1; }
        render();
      }));
    }

    async function load() {
      setStatus('更新中…');
      try {
        var data = await options.fetch();
        rows = data.list;
        meta = { date: data.date, total: data.total };
        render();
        setStatus('更新于 ' + nowTime());
      } catch (e) {
        c.body.innerHTML = '';
        c.body.appendChild(errorBlock(options.title + '加载失败：' + (e && e.message || e)));
        setStatus(options.title + '加载失败', true);
      }
    }
    load();
    return load;
  }

  function mountZt(view) {
    return mountPool(view, { title: '涨停池', isDt: false, sortKey: 'lbc', empty: '今日暂无涨停数据', fetch: fetchZtPool });
  }

  function mountDt(view) {
    return mountPool(view, { title: '跌停池', isDt: true, sortKey: 'days', empty: '今日暂无跌停数据', fetch: fetchDtPool });
  }

  // ---------- 新闻 ----------

  function mountNews(view) {
    var c = card('市场新闻', '每页 30 条');
    view.appendChild(c.root);
    var page = 0;
    var loading = false;

    async function load(reset) {
      if (loading) return;
      loading = true;
      if (reset) {
        page = 0;
        c.body.innerHTML = '';
      }
      setStatus('更新中…');
      try {
        var next = page + 1;
        var items = await fetchNews(next);
        page = next;
        var moreBtn = c.body.querySelector('.mc-more');
        if (moreBtn) moreBtn.remove();
        if (!items.length && page === 1) {
          c.body.appendChild(el('div', 'mc-empty', '暂无新闻'));
        }
        items.forEach(function (item) {
          var root = el('article', 'mc-news-item');
          root.appendChild(el('h3', 'mc-news-title', item.title || ''));

          var meta = el('div', 'mc-news-meta');
          meta.appendChild(el('span', 'mc-news-time', fmtNewsTime(item.time)));
          (item.tags || []).forEach(function (tag) {
            meta.appendChild(el('span', 'mc-tag' + (tag.name === '异动' ? ' alert' : ''), tag.name));
          });
          root.appendChild(meta);

          if (item.digest) {
            var digest = el('p', 'mc-news-digest clamp', item.digest);
            root.appendChild(digest);
          }
          c.body.appendChild(root);

          // 只给真正被截断的新闻加点击展开，短新闻不显示任何展开控件
          if (item.digest && digest.scrollHeight > digest.clientHeight + 1) {
            root.classList.add('mc-news-expandable');
            root.title = '点击展开全文';
            root.addEventListener('click', function () {
              var expanded = !digest.classList.toggle('clamp');
              root.title = expanded ? '点击收起' : '点击展开全文';
            });
          }
        });
        var more = el('button', 'mc-more', '加载更多');
        more.addEventListener('click', function () { load(false); });
        c.body.appendChild(more);
        setStatus('更新于 ' + nowTime());
      } catch (e) {
        if (page === 0) {
          c.body.innerHTML = '';
          c.body.appendChild(errorBlock('新闻加载失败：' + (e && e.message || e)));
        }
        setStatus('新闻加载失败', true);
      } finally {
        loading = false;
      }
    }
    load(true);
    return function () { return load(true); };
  }

  // ---------- 标签页 ----------

  var TABS = [
    { key: 'overview', label: '大盘', mount: mountOverview },
    { key: 'board', label: '板块', mount: function (view) { return mountBoards(view, 'industry', 'f3'); } },
    { key: 'concept', label: '概念', mount: function (view) { return mountBoards(view, 'concept', 'f3'); } },
    { key: 'flow', label: '资金流', mount: mountFlow },
    { key: 'zt', label: '涨停池', mount: mountZt },
    { key: 'dt', label: '跌停池', mount: mountDt },
    // 新闻不做 30 秒自动刷新，避免打断阅读
    { key: 'news', label: '新闻', mount: mountNews, auto: function () {} }
  ];

  function switchTab(key) {
    var tab = TABS.find(function (t) { return t.key === key; });
    if (!tab) return;
    activeKey = key;
    Array.prototype.forEach.call(tabsEl.children, function (btn) {
      btn.classList.toggle('active', btn.dataset.key === key);
    });
    viewEl.innerHTML = '';
    refreshFn = tab.mount(viewEl);
    autoFn = tab.auto || refreshFn;
  }

  function init() {
    TABS.forEach(function (tab) {
      var btn = el('button', 'mc-tab', tab.label);
      btn.type = 'button';
      btn.dataset.key = tab.key;
      btn.addEventListener('click', function () { switchTab(tab.key); });
      tabsEl.appendChild(btn);
    });
    switchTab(activeKey);
    document.getElementById('mc-refresh').addEventListener('click', function () {
      if (refreshFn) refreshFn();
    });
    setInterval(function () {
      if (!document.hidden && autoFn) autoFn();
    }, 30000);
  }

  init();
})();
