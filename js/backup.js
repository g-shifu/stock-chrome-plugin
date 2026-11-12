/**
 * 自选数据备份
 *
 * - 设置页「数据管理 > 数据文件备份」里提供：选择自动备份目录、开启每个交易日备份、立即备份
 * - 每个交易日第一次打开扩展页面（popup / 设置页）时，把当天快照写入选定目录
 * - 备份文件沿用设置页「导出备份」的 JSON 格式，可直接用现有「导入备份」恢复
 * - 后台通过定时任务提醒长期未备份（见 background.js）
 *
 * 背景：Chrome MV3 的 service worker 没有 File System Access API，
 * 无法在后台直接写用户目录，所以自动备份只能在扩展页面打开时补写。
 */
(function () {
  'use strict';

  const FILE_PREFIX = '股票基金助手备份-';
  const SETTINGS_KEY = 'stockBackupSettings';
  const HANDLE_DB = 'stockBackupDb';
  const HANDLE_STORE = 'handles';
  const HANDLE_KEY = 'directory';
  const KEEP_FILES = 10;
  const REMIND_DAYS = 7;

  // 与设置页「导出备份」保持一致的字段
  const BACKUP_FIELDS = [
    'stockGroup', 'fundGroup', 'indexItemList',
    'fundCurGroupIndex', 'stockCurGroupIndex',
    'config', 'data_center_last_updata'
  ];

  const pagePath = location.pathname;
  const isOptionsPage = /\/options\/options\.html$/.test(pagePath);
  const isPopupPage = /\/popup\/popup\.html$/.test(pagePath);

  // ---------- 小工具 ----------

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function dateStr(d) {
    const date = d || new Date();
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function timeStr(d) {
    const date = d || new Date();
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function isTradingDay(d) {
    const day = (d || new Date()).getDay();
    return day >= 1 && day <= 5;
  }

  function daysSince(iso) {
    if (!iso) return Infinity;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return Infinity;
    return Math.floor((Date.now() - t) / 86400000);
  }

  // ---------- 设置 ----------

  function getSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(SETTINGS_KEY, res => {
        resolve(Object.assign({ autoBackup: true }, res && res[SETTINGS_KEY] || {}));
      });
    });
  }

  function setSettings(patch) {
    return getSettings().then(current => new Promise(resolve => {
      const next = Object.assign({}, current, patch);
      chrome.storage.local.set({ [SETTINGS_KEY]: next }, () => resolve(next));
    }));
  }

  // ---------- 目录句柄（存在 IndexedDB 里） ----------

  function openHandleDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function handleStore(mode, fn) {
    return openHandleDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, mode);
      const store = tx.objectStore(HANDLE_STORE);
      const req = fn(store);
      tx.oncomplete = () => { db.close(); resolve(req && req.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    }));
  }

  function loadHandle() {
    return handleStore('readonly', store => store.get(HANDLE_KEY)).catch(() => null);
  }

  function saveHandle(handle) {
    return handleStore('readwrite', store => store.put(handle, HANDLE_KEY));
  }

  async function hasPermission(handle, request) {
    if (!handle) return false;
    try {
      const opts = { mode: 'readwrite' };
      if (await handle.queryPermission(opts) === 'granted') return true;
      if (request && await handle.requestPermission(opts) === 'granted') return true;
    } catch (e) {
      console.warn('[backup] 检查目录权限失败', e);
    }
    return false;
  }

  // ---------- 数据收集（与设置页导出格式一致） ----------

  function dbExists(name) {
    if (!indexedDB.databases) return Promise.resolve(true);
    return indexedDB.databases().then(dbs => dbs.some(db => db.name === name)).catch(() => true);
  }

  function readNotify() {
    return dbExists('stock').then(exists => {
      if (!exists) return [];
      return new Promise(resolve => {
        let req;
        try {
          req = indexedDB.open('stock');
        } catch (e) {
          return resolve([]);
        }
        req.onupgradeneeded = () => {};
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('notify')) {
            db.close();
            return resolve([]);
          }
          const tx = db.transaction('notify', 'readonly');
          const all = tx.objectStore('notify').getAll();
          all.onsuccess = () => { db.close(); resolve(all.result || []); };
          all.onerror = () => { db.close(); resolve([]); };
        };
      });
    });
  }

  function collectData() {
    const data = { version: chrome.runtime.getManifest().version };
    BACKUP_FIELDS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw === null) return;
      let value = raw;
      try {
        value = JSON.parse(raw);
      } catch (e) {
        // 非 JSON 字段（如 data_center_last_updata）原样保存
      }
      if (value) data[key] = value;
    });
    return readNotify().then(notify => {
      if (notify.length) data.notify = notify;
      // 兼容旧版字段，和设置页导出逻辑保持一致
      if (Array.isArray(data.stockGroup) && data.stockGroup.length) {
        data.stockItemList = data.stockGroup[0].data || [];
      }
      if (Array.isArray(data.fundGroup) && data.fundGroup.length) {
        data.fundListM = data.fundGroup[0].data || [];
      }
      return data;
    });
  }

  // ---------- 写文件 ----------

  function writeFile(dir, name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    return dir.getFileHandle(name, { create: true })
      .then(fileHandle => fileHandle.createWritable())
      .then(writer => writer.write(blob).then(() => writer.close()));
  }

  function pruneFiles(dir) {
    if (!dir || typeof dir.entries !== 'function') return Promise.resolve();
    const names = [];
    const iterator = dir.entries();
    const step = () => iterator.next().then(result => {
      if (result.done) return names;
      const entry = result.value;
      const name = entry[0];
      const handle = entry[1];
      if (handle.kind === 'file' && name.indexOf(FILE_PREFIX) === 0 && /\.json$/.test(name)) names.push(name);
      return step();
    });
    return step().then(list => {
      list.sort();
      const remove = list.slice(0, Math.max(0, list.length - KEEP_FILES));
      return remove.reduce((p, name) => p.then(() => dir.removeEntry(name).catch(() => {})), Promise.resolve());
    }).catch(() => {});
  }

  function backupToDirectory(dir, options) {
    const opts = options || {};
    return Promise.resolve().then(async () => {
      if (!dir) return { ok: false, reason: 'no-directory' };
      if (!await hasPermission(dir, !!opts.requestPermission)) return { ok: false, reason: 'permission' };
      const data = await collectData();
      const text = JSON.stringify(data, null, 2);
      const date = dateStr();
      const name = FILE_PREFIX + date + '.json';
      await writeFile(dir, name, text);
      await pruneFiles(dir);
      await setSettings({
        lastBackupAt: new Date().toISOString(),
        lastBackupDate: date,
        lastBackupName: name,
        lastBackupError: ''
      });
      return { ok: true, name, size: text.length, dirName: dir.name };
    }).catch(err => {
      console.warn('[backup] 备份失败', err);
      return { ok: false, reason: 'error', error: String(err && err.message || err) };
    });
  }

  function backupNow(options) {
    const opts = options || {};
    return Promise.resolve(opts.dir || loadHandle()).then(dir => backupToDirectory(dir, opts));
  }

  function maybeAutoBackup() {
    return getSettings().then(settings => {
      if (settings.autoBackup === false) return { skipped: 'disabled' };
      if (!isTradingDay()) return { skipped: 'not-trading-day' };
      if (settings.lastBackupDate === dateStr()) return { skipped: 'done-today' };
      return loadHandle().then(dir => {
        if (!dir) return { skipped: 'no-directory' };
        return hasPermission(dir, false).then(granted => {
          if (!granted) return { skipped: 'permission' };
          return backupToDirectory(dir, {});
        });
      });
    }).catch(err => {
      console.warn('[backup] 自动备份失败', err);
      return { skipped: 'error', error: String(err) };
    });
  }

  // ---------- 设置页：并入「数据文件备份」 ----------

  function injectBackupStyle() {
    if (document.getElementById('sfb-style')) return;
    const style = document.createElement('style');
    style.id = 'sfb-style';
    style.textContent = [
      '.sfb-block{margin-top:12px;padding-top:12px;border-top:1px dashed #ebeef5;transition:background-color .3s}',
      '.sfb-block.sfb-flash{background:#ecf5ff}',
      '.sfb-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px}',
      '.sfb-label{color:#909399;font-size:12px}',
      '.sfb-dir{color:#606266;font-size:13px;word-break:break-all}',
      '.sfb-auto{display:flex;align-items:center;gap:6px;color:#606266;font-size:13px;cursor:pointer}',
      '.sfb-btn{padding:4px 10px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;color:#606266;font-size:12px;cursor:pointer}',
      '.sfb-btn:hover{border-color:#409eff;color:#409eff}',
      '.sfb-primary{background:#409eff;border-color:#409eff;color:#fff}',
      '.sfb-primary:hover{background:#66b1ff;border-color:#66b1ff;color:#fff}',
      '.sfb-status{color:#909399;font-size:12px}',
      '.sfb-status.sfb-ok{color:#67c23a}',
      '.sfb-status.sfb-err{color:#f56c6c}',
      '.sfb-tip{margin-top:6px;color:#909399;font-size:12px;line-height:1.6}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildInlineBlock() {
    const block = document.createElement('div');
    block.className = 'sfb-block';
    block.id = 'sfb-block';
    block.innerHTML =
      '<div class="sfb-row">' +
        '<span class="sfb-label">自动备份目录</span>' +
        '<span class="sfb-dir" id="sfb-dir">未选择</span>' +
        '<button type="button" class="sfb-btn sfb-choose" id="sfb-choose">选择目录</button>' +
      '</div>' +
      '<div class="sfb-row">' +
        '<label class="sfb-auto"><input type="checkbox" id="sfb-auto-input"> 每个交易日自动备份</label>' +
        '<button type="button" class="sfb-btn sfb-primary" id="sfb-backup">立即备份</button>' +
        '<span class="sfb-status" id="sfb-status"></span>' +
      '</div>' +
      '<div class="sfb-tip">自动备份会在每个交易日第一次打开扩展（弹窗或本页）时写入所选目录；备份文件与上方「导出备份」格式一致，可直接用「导入备份」恢复。</div>';
    return block;
  }

  function injectInlineBlock() {
    if (document.getElementById('sfb-block')) return true;
    const titles = document.querySelectorAll('h3.congig-title');
    let target = null;
    for (let i = 0; i < titles.length; i++) {
      if (titles[i].textContent.trim() === '数据文件备份') {
        target = titles[i];
        break;
      }
    }
    if (!target) return false;
    injectBackupStyle();
    const config = target.parentNode || target.parentElement;
    const block = buildInlineBlock();
    config.appendChild(block);
    // .config 是 nowrap 的横向 flex，备份块需要独占一整行
    config.style.flexWrap = 'wrap';
    block.style.flex = '1 0 100%';
    block.style.width = '100%';
    block.style.boxSizing = 'border-box';
    const item = target.nextElementSibling;
    if (item) {
      const configRect = config.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      block.style.paddingLeft = Math.max(0, itemRect.left - configRect.left) + 'px';
    }
    bindInlineBlock(block);
    focusIfRequested();
    return true;
  }

  function bindInlineBlock(block) {
    const dirEl = block.querySelector('#sfb-dir');
    const autoInput = block.querySelector('#sfb-auto-input');
    const statusEl = block.querySelector('#sfb-status');

    function setStatus(text, type) {
      statusEl.textContent = text || '';
      statusEl.className = 'sfb-status' + (type ? ' sfb-' + type : '');
    }

    function refresh() {
      Promise.all([getSettings(), loadHandle()]).then(([settings, dir]) => {
        autoInput.checked = settings.autoBackup !== false;
        if (!dir) {
          dirEl.textContent = '未选择';
        } else {
          hasPermission(dir, false).then(granted => {
            dirEl.textContent = granted ? dir.name : dir.name + '（授权已失效，请重新选择目录）';
          });
        }
        if (settings.lastBackupAt) {
          setStatus('上次备份：' + timeStr(new Date(settings.lastBackupAt)), 'ok');
        } else {
          setStatus('尚未备份');
        }
      });
    }

    autoInput.addEventListener('change', () => {
      setSettings({ autoBackup: autoInput.checked });
    });

    block.querySelector('#sfb-choose').addEventListener('click', () => {
      if (!window.showDirectoryPicker) {
        setStatus('当前浏览器不支持选择目录', 'err');
        return;
      }
      window.showDirectoryPicker({ id: 'stockBackup', mode: 'readwrite' }).then(dir => {
        return saveHandle(dir).then(() => hasPermission(dir, true)).then(granted => {
          if (!granted) {
            setStatus('目录未授权，无法写入', 'err');
            return;
          }
          setStatus('正在写入今天的备份…');
          return backupToDirectory(dir, {}).then(result => {
            if (result.ok) {
              setStatus('已选择「' + dir.name + '」，今天的备份已写入', 'ok');
            } else {
              setStatus('目录已选择，但备份失败：' + (result.error || result.reason), 'err');
            }
            refresh();
          });
        });
      }).catch(err => {
        if (err && err.name === 'AbortError') return;
        setStatus('选择目录失败：' + (err && err.message || err), 'err');
      });
    });

    block.querySelector('#sfb-backup').addEventListener('click', () => {
      setStatus('正在备份…');
      backupNow({ requestPermission: true }).then(result => {
        if (result.ok) {
          setStatus('已备份：' + result.name, 'ok');
        } else if (result.reason === 'no-directory') {
          setStatus('请先选择备份目录', 'err');
        } else if (result.reason === 'permission') {
          setStatus('目录未授权，请重新选择目录', 'err');
        } else {
          setStatus('备份失败：' + (result.error || result.reason), 'err');
        }
        refresh();
      });
    });

    refresh();
  }

  function focusBackupBlock() {
    const block = document.getElementById('sfb-block');
    if (!block) return;
    block.scrollIntoView({ behavior: 'smooth', block: 'center' });
    block.classList.add('sfb-flash');
    setTimeout(() => block.classList.remove('sfb-flash'), 1600);
  }

  function focusIfRequested() {
    chrome.storage.local.get('backupPanelRequest', res => {
      if (res && res.backupPanelRequest) {
        chrome.storage.local.remove('backupPanelRequest');
        focusBackupBlock();
      }
    });
  }

  function waitForInlineBlock() {
    if (injectInlineBlock()) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (injectInlineBlock() || ++tries > 40) clearInterval(timer);
    }, 250);
  }

  // ---------- popup 里的过期提醒 ----------

  function countItems(value) {
    if (!Array.isArray(value)) return 0;
    return value.reduce((total, group) => {
      return total + (group && Array.isArray(group.data) ? group.data.length : 0);
    }, 0);
  }

  function hasWatchData() {
    try {
      return countItems(JSON.parse(localStorage.getItem('stockGroup') || '[]')) +
        countItems(JSON.parse(localStorage.getItem('fundGroup') || '[]')) > 0;
    } catch (e) {
      return false;
    }
  }

  function showBackupToast(days) {
    if (document.getElementById('sfb-toast')) return;
    const style = document.createElement('style');
    style.id = 'sfb-toast-style';
    style.textContent = '.sfb-remind{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483000;' +
      'max-width:92vw;padding:8px 14px;border-radius:4px;background:rgba(48,49,51,.92);color:#fff;font-size:12px;' +
      'line-height:1.5;cursor:pointer;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.25)}';
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = 'sfb-toast';
    el.className = 'sfb-remind';
    el.textContent = days === Infinity
      ? '还没有备份过自选数据，点击立即备份'
      : '已 ' + days + ' 天未备份自选数据，点击立即备份';
    el.addEventListener('click', () => {
      el.remove();
      chrome.storage.local.set({ backupPanelRequest: Date.now() }, () => {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
      });
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  function maybeShowBackupToast() {
    if (!hasWatchData()) return;
    getSettings().then(settings => {
      const days = daysSince(settings.lastBackupAt);
      if (days < REMIND_DAYS) return;
      if (settings.lastBackupToastDate === dateStr()) return;
      setSettings({ lastBackupToastDate: dateStr() });
      showBackupToast(days);
    }).catch(() => {});
  }

  // ---------- 启动 ----------

  if (isOptionsPage) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', waitForInlineBlock);
    } else {
      waitForInlineBlock();
    }
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.backupPanelRequest && changes.backupPanelRequest.newValue) {
          chrome.storage.local.remove('backupPanelRequest');
          focusBackupBlock();
        }
      });
    }
    maybeAutoBackup();
  } else if (isPopupPage) {
    maybeAutoBackup();
    maybeShowBackupToast();
  }

  window.StockBackup = {
    getSettings: getSettings,
    setSettings: setSettings,
    loadHandle: loadHandle,
    backupNow: backupNow,
    maybeAutoBackup: maybeAutoBackup,
    daysSince: daysSince,
    REMIND_DAYS: REMIND_DAYS
  };
})();
