// ===== MV3 Service Worker Compatibility Shims =====

// 1. browserAction -> action
if (typeof chrome !== 'undefined' && chrome.action && !chrome.browserAction) {
  chrome.browserAction = chrome.action;
}

// Silence "Could not establish connection" when popup is closed
(function() {
  var _orig = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = function() {
    try {
      var result = _orig.apply(this, arguments);
      if (result && result.catch) result.catch(function() {});
    } catch(e) {}
  };
})();

// 2. window shim (var so it becomes a true global in classic SW script)
var window = globalThis;

// 3. In-memory localStorage shim (SW has no localStorage)
var localStorage = (function() {
  var d = {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(d,k) ? d[k] : null; },
    setItem: function(k, v) { d[k] = String(v); },
    removeItem: function(k) { delete d[k]; },
    clear: function() { d = {}; },
    key: function(i) { return Object.keys(d)[i] || null; },
    get length() { return Object.keys(d).length; }
  };
}());

// 4. XMLHttpRequest shim using fetch (axios needs this)
if (typeof XMLHttpRequest === 'undefined') {
  globalThis.XMLHttpRequest = function() {
    this._method = 'GET'; this._url = ''; this._headers = {};
    this.readyState = 0; this.status = 0; this.statusText = '';
    this.responseText = ''; this.response = null; this.responseType = '';
    this.onreadystatechange = null; this.onload = null; this.onerror = null;
    this.timeout = 0; this.withCredentials = false;
  };
  XMLHttpRequest.prototype.open = function(m, u) { this._method=m; this._url=u; this.readyState=1; };
  XMLHttpRequest.prototype.setRequestHeader = function(k,v) { this._headers[k]=v; };
  XMLHttpRequest.prototype.getResponseHeader = function(k) {
    return this._rh ? (this._rh[k.toLowerCase()]||null) : null;
  };
  XMLHttpRequest.prototype.getAllResponseHeaders = function() {
    if (!this._rh) return '';
    return Object.keys(this._rh).map(function(k){return k+': '+this._rh[k];},this).join('\r\n');
  };
  XMLHttpRequest.prototype.abort = function() { if(this._ctrl) this._ctrl.abort(); };
  XMLHttpRequest.prototype.send = function(body) {
    var xhr = this;
    xhr._ctrl = new AbortController();
    var opts = { method: xhr._method, headers: xhr._headers, signal: xhr._ctrl.signal };
    if (body && xhr._method !== 'GET' && xhr._method !== 'HEAD') opts.body = body;
    fetch(xhr._url, opts).then(function(res) {
      xhr.status = res.status; xhr.statusText = res.statusText;
      xhr._rh = {};
      res.headers.forEach(function(v,k){ xhr._rh[k.toLowerCase()]=v; });
      return res.text();
    }).then(function(text) {
      xhr.responseText = text;
      xhr.response = xhr.responseType==='json' ? JSON.parse(text) : text;
      xhr.readyState = 4;
      if (xhr.onreadystatechange) xhr.onreadystatechange();
      if (xhr.onload) xhr.onload({target:xhr});
    }).catch(function(e){ if(xhr.onerror) xhr.onerror(e); });
  };
}
// 5. document shim (axios uses document.createElement('a') for URL parsing)
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: function(tag) {
      if (tag.toLowerCase() === 'a') {
        var _href = '', _url = null;
        return {
          setAttribute: function(k, v) { if (k==='href') { _href=v; try{_url=new URL(v);}catch(e){_url=null;} } },
          get href() { return _href; },
          set href(v) { _href = v; try { _url = new URL(v); } catch(e) { _url = null; } },
          get protocol() { return _url ? _url.protocol : ''; },
          get host()     { return _url ? _url.host : ''; },
          get hostname() { return _url ? _url.hostname : ''; },
          get port()     { return _url ? _url.port : ''; },
          get pathname() { return _url ? _url.pathname : ''; },
          get search()   { return _url ? _url.search : ''; },
          get hash()     { return _url ? _url.hash : ''; },
          get origin()   { return _url ? _url.origin : ''; },
        };
      }
      return {};
    },
    get cookie() { return ''; },
    set cookie(v) {},
  };
}

// 6. navigator shim
if (typeof navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'Chrome', product: '' };
}
// ===== End Shims =====
!function(n){var e={};function t(a){if(e[a])return e[a].exports;var r=e[a]={i:a,l:!1,exports:{}};return n[a].call(r.exports,r,r.exports,t),r.l=!0,r.exports}t.m=n,t.c=e,t.d=function(n,e,a){t.o(n,e)||Object.defineProperty(n,e,{enumerable:!0,get:a})},t.r=function(n){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(n,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(n,"__esModule",{value:!0})},t.t=function(n,e){if(1&e&&(n=t(n)),8&e)return n;if(4&e&&"object"==typeof n&&n&&n.__esModule)return n;var a=Object.create(null);if(t.r(a),Object.defineProperty(a,"default",{enumerable:!0,value:n}),2&e&&"string"!=typeof n)for(var r in n)t.d(a,r,function(e){return n[e]}.bind(null,r));return a},t.n=function(n){var e=n&&n.__esModule?function(){return n.default}:function(){return n};return t.d(e,"a",e),e},t.o=function(n,e){return Object.prototype.hasOwnProperty.call(n,e)},t.p="",t(t.s=441)}({12:function(module,__webpack_exports__,__webpack_require__){"use strict";
const util = {
  // 配置项数据兼容
  optionsCompatibili() {
    return new Promise(resolve => {
      chrome.storage.sync.get(["badgeModel", "stockColumnShow", "fundColumnShow", "isshowLink", "stock_notice"], res => {
        // ------------------兼容 2.5.2 兼容老板通知提醒-----start-------------------------
        const {
          stock_notice = {}
        } = res;
        // 判断是否有通知内容
        const notices = Object.keys(stock_notice);
        if (notices.length) {
          notices.forEach(code => {
            const {
              price_1,
              price_base_1,
              content_text_1,
              price_zdf_1,
              price_down_1,
              content_down_text_1,
              price_down_base_1,
              price_down_zdf_1
            } = stock_notice[code];
            const up = [];
            const down = [];
            if (price_1) {
              up.push({
                price: price_1,
                base: price_base_1,
                content: content_text_1,
                zdf: price_zdf_1
              });
            }
            if (price_down_1) {
              down.push({
                price: price_down_1,
                base: price_down_base_1,
                content: content_down_text_1,
                zdf: price_down_zdf_1
              });
            }
            if (price_1 || price_down_1) {
              chrome.storage.sync.get(["stock_notice"], values => {
                const stock_notice_ = values.stock_notice;
                stock_notice_[code] = {};
                if (price_1) {
                  stock_notice_[code].up_price = {
                    num: price_1,
                    message: content_text_1,
                    status: true
                  };
                }
                if (price_down_1) {
                  stock_notice_[code].down_price = {
                    num: price_down_1,
                    message: content_down_text_1,
                    status: true
                  };
                }
                chrome.storage.sync.set({
                  stock_notice: stock_notice_
                });
              });
            }
          });
        }

        // ------------------兼容 2.5.2-----end-------------------------
        // ------------------兼容 2.2.0-----start-------------------------
        const {
          stockColumnShow = {},
          fundColumnShow = {},
          isshowLink
        } = res;
        const {
          gp_sj,
          gp_ccj,
          gp_ccs,
          gp_ccje,
          gp_zdf,
          gp_dtsy,
          gp_zsyl,
          gp_zsy,
          gp_hsl,
          gp_cje,
          gp_zdfje
        } = stockColumnShow;
        const {
          jj_gz,
          jj_ccj,
          jj_ccs,
          jj_ccje,
          jj_zdf,
          jj_dtsy,
          jj_zsyl,
          jj_zsy
        } = fundColumnShow;
        chrome.storage.sync.set({
          // 股票列配置项
          stockColumnShow: {
            gp_sj: gp_sj === undefined ? true : gp_sj,
            gp_ccj: gp_ccj === undefined ? false : gp_ccj,
            gp_ccs: gp_ccs === undefined ? false : gp_ccs,
            gp_ccje: gp_ccje === undefined ? false : gp_ccje,
            gp_zdf: gp_zdf === undefined ? true : gp_zdf,
            gp_dtsy: gp_dtsy === undefined ? false : gp_dtsy,
            gp_zsyl: gp_zsyl === undefined ? false : gp_zsyl,
            gp_zsy: gp_zsy === undefined ? false : gp_zsy,
            gp_hsl: gp_hsl === undefined ? true : gp_hsl,
            gp_zdfje: gp_zdfje === undefined ? true : gp_zdfje
          },
          // 基金列配置项
          fundColumnShow: {
            jj_gz: jj_gz === undefined ? true : jj_gz,
            jj_ccj: jj_ccj === undefined ? false : jj_ccj,
            jj_ccs: jj_ccs === undefined ? false : jj_ccs,
            jj_ccje: jj_ccje === undefined ? false : jj_ccje,
            jj_zdf: jj_zdf === undefined ? true : jj_zdf,
            jj_dtsy: jj_dtsy === undefined ? false : jj_dtsy,
            jj_zsyl: jj_zsyl === undefined ? false : jj_zsyl,
            jj_zsy: jj_zsy === undefined ? false : jj_zsy
          },
          // 友情链接配置显示项
          isshowLink: isshowLink === undefined ? true : isshowLink
        }, () => {
          resolve();
        });
        // ------------------兼容 2.2.0-----end-------------------------
      });
    });
  },

  /**
   * 把chrome.sync.storage 的数据放到 localhsot中
   */
  optionsCompatibili2() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(null, function () {
        let res = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        if (localStorage.config || localStorage.fundGroup || localStorage.stockGroup) {
          resolve(false);
          return;
        }
        if (!res.stockItemList && !res.fundListM) {
          resolve(false);
          return;
        }
        const data = {
          stockGroup: [{
            data: res.stockItemList || [],
            name: '默认分组'
          }],
          fundGroup: [{
            data: res.fundListM || [],
            name: '默认分组'
          }],
          indexItemList: res.indexItemList || [],
          stock_notice: res.stock_notice,
          config: {
            fundColumnShow: res.fundColumnShow,
            stockColumnShow: res.stockColumnShow,
            badgeModel: res.badgeModel,
            device_id: res.device_id,
            fontSize: res.fontSize || "medium",
            isDark: res.isDark || false,
            isShowHeadIndex: res.isShowHeadIndex,
            is_show_fund: res.is_show_fund,
            popup_grayscale: res.popup_grayscale || 0,
            popup_opacity: res.popup_opacity || 100,
            replenishmentNotice: res.replenishmentNotice
          }
        };
        for (let item in data) {
          if (typeof data[item] === 'object') {
            localStorage.setItem(item, JSON.stringify(data[item]));
          } else {
            localStorage.setItem(item, data[item]);
          }
        }
        resolve(true);
      });
    });
  },
  guid() {
    const uid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : r & 0x3 | 0x8).toString(16);
    }).toUpperCase();
    if (undefined === "test") {
      return `TEST-${uid}`;
    }
    return uid;
  },
  // 获取浏览器类型
  getBrowser() {
    var u = navigator.userAgent;
    if (u.indexOf('Edge') > -1 || u.indexOf('Edg/') > -1) {
      return 2;
    } else if (u.indexOf('Chrome') > -1) {
      return 1;
    } else if (u.indexOf('Firefox') > -1 || u.indexOf('FxiOS') > -1) {
      return 3;
    } else {
      return 0;
    }
  },
  /**
   * 获取日期时间
   * @param {*} type 
   * @param {*} symbol 
   */
  getTime() {
    let type = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'day';
    let symbol = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "-";
    const now = new Date();
    const year = now.getFullYear(); //得到年份
    let month = now.getMonth() + 1; //得到月份
    let day = now.getDate(); //得到日期
    const hour = now.getHours(); //得到小时
    const minu = now.getMinutes(); //得到分钟
    const sec = now.getSeconds(); //得到秒
    if (day <= 9) {
      day = `0${day}`;
    }
    if (month <= 9) {
      month = `0${month}`;
    }
    if (type === 'day') {
      return `${year}${symbol}${month}${symbol}${day}`;
    }
    if (type === 'time') {
      return `${hour}${symbol}${minu}`;
    }
    return `${year}-${month}-${day} ${hour}-${minu}-${sec}`;
  },
  /**
   * 是否为交易时间
   */
  isDuringDate() {
    //时区转换为东8区
    const zoneOffset = 8;
    const offset8 = new Date().getTimezoneOffset() * 60 * 1000;
    const nowDate8 = new Date().getTime();
    const curDate = new Date(nowDate8 + offset8 + zoneOffset * 60 * 60 * 1000);
    const beginDateAM = new Date();
    const endDateAM = new Date();
    const beginDatePM = new Date();
    const endDatePM = new Date();
    beginDateAM.setHours(9, 29, 0);
    endDateAM.setHours(11, 31, 0);
    beginDatePM.setHours(13, 0, 0);
    endDatePM.setHours(15, 1, 0);
    if (curDate.getDay() === 6 || curDate.getDay() === 0) {
      return false;
    } else if (curDate >= beginDateAM && curDate <= endDateAM) {
      return true;
    } else if (curDate >= beginDatePM && curDate <= endDatePM) {
      return true;
    } else {
      return false;
    }
  },
  /**
   * 基金格式处理
   * @param {*} data 
   */
  fundFormat() {
    let data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    const res = {
      fundcode: data.FCODE,
      name: data.SHORTNAME,
      jzrq: data.PDATE,
      dwjz: isNaN(data.NAV) ? null : data.NAV,
      gsz: (data.GSZ == null || isNaN(data.GSZ)) ? null : (+data.NAV + +data.NAV * +data.GSZZL / 100).toFixed(4),
      gszzl: (data.GSZZL == null || isNaN(data.GSZZL)) ? 0 : data.GSZZL,
      gztime: data.GZTIME
    };
    if (data.PDATE != "--" && data.GZTIME && data.PDATE == data.GZTIME.substr(0, 10)) {
      res.gsz = data.NAV;
      res.gszzl = isNaN(data.NAVCHGRT) ? 0 : data.NAVCHGRT;
      res.isUpdate = true;
    }

    // QDII 或者是 封闭基金
    if (data.GZTIME === '--' && data.GSZ === '--') {
      res.gsz = data.NAV;
      res.gszzl = isNaN(data.NAVCHGRT) ? 0 : data.NAVCHGRT;
    }
    return res;
  },
  /**
   * 汇率计算
   */
  calcRate(type) {
    // const USDtoCNY = localStorage.getItem("USDtoCNY") || 6.4708;
    // const HKDtoCNY = localStorage.getItem("USDtoCNY") || 0.8346;
    const USDtoCNY = 6.4708;
    const HKDtoCNY = 0.8346;
    if (type === '美股') {
      // 美股
      return +USDtoCNY;
    }
    if (type === '港股') {
      // 港股
      return +HKDtoCNY;
    }
    return 1; // A股
  },

  /**
   * 货币千分位格式化
   * @param  {Number} number   [description]
   * @param  {Number} places   [description]
   * @param  {String} thousand [description]
   * @param  {String} decimal  [description]
   * @return {[type]}          [description]
   */
  formatMoney() {
    let number = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    let places = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 2;
    let thousand = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : ',';
    let decimal = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : '.';
    if (isNaN(number) || number === '') return '';
    const negative = number < 0 ? '-' : '';
    const i = parseInt(Math.abs(number).toFixed(places), 10).toString();
    const j = i.length > 3 ? i.length % 3 : 0;
    return negative + (j ? i.substr(0, j) + thousand : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, `$1${thousand}`) + (places ? decimal + (Math.abs(number) - i).toFixed(places).slice(2) : '');
  },
  /**
   * 查看大图
   */
  toFullChart(row) {
    chrome.tabs.create({
      url: `/detail/detail.html?code=${row.code}&market=${row.market}`
    });
  },
  /**
   * 全角转换为半角
   * @param {*} str 
   */
  toCDB(str) {
    let tmp = "";
    for (var i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) == 12288) {
        tmp += String.fromCharCode(str.charCodeAt(i) - 12256);
        continue;
      }
      if (str.charCodeAt(i) > 65280 && str.charCodeAt(i) < 65375) {
        tmp += String.fromCharCode(str.charCodeAt(i) - 65248);
      } else {
        tmp += String.fromCharCode(str.charCodeAt(i));
      }
    }
    return tmp;
  },
  /**
   * 默认配置
   */
  defaultConfig() {
    return {
      fundColumnShow: {
        jj_gz: true,
        jj_ccj: false,
        jj_ccs: false,
        jj_ccje: false,
        jj_zdf: true,
        jj_dtsy: false,
        jj_zsyl: false,
        jj_zsy: false
      },
      stockColumnShow: {
        gp_sj: true,
        gp_ccj: false,
        gp_ccs: false,
        gp_ccje: false,
        gp_zdf: true,
        gp_dtsy: false,
        gp_zsyl: false,
        gp_zsy: false,
        gp_hsl: true,
        gp_zdfje: true
      },
      badgeModel: "0",
      fontSize: "medium",
      isDark: false,
      isShowHeadIndex: true,
      popup_grayscale: 0,
      popup_opacity: 100,
      replenishmentNotice: false
    };
  },
  /**
   * 显示格式处理
   * @param {*} value 要处理的值
   * @param {*} num 保留几位小数 默认2位
   * @param {*} suffix 后缀 例如 %
   * @returns 
   */
  toFixed(value) {
    let num = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 2;
    let suffix = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : "";
    let filed = arguments.length > 3 ? arguments[3] : undefined;
    const value_ = +value;
    let result = '';
    try {
      if (!(isNaN(value_) || ["string", "number"].indexOf(typeof value) === -1 || value === "" || value_ === Infinity)) {
        result = `${value_.toFixed(num)}${suffix}`;
      }
    } catch (error) {
      result = "";
    }
    return result;
  }
};
/* harmony default export */ __webpack_exports__["a"] = (util);


},13:function(module,exports,__webpack_require__){"use strict";


var bind = __webpack_require__(84);

/*global toString:true*/

// utils is a library of generic helper functions non-specific to axios

var toString = Object.prototype.toString;

/**
 * Determine if a value is an Array
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Array, otherwise false
 */
function isArray(val) {
  return toString.call(val) === '[object Array]';
}

/**
 * Determine if a value is undefined
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if the value is undefined, otherwise false
 */
function isUndefined(val) {
  return typeof val === 'undefined';
}

/**
 * Determine if a value is a Buffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Buffer, otherwise false
 */
function isBuffer(val) {
  return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor)
    && typeof val.constructor.isBuffer === 'function' && val.constructor.isBuffer(val);
}

/**
 * Determine if a value is an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an ArrayBuffer, otherwise false
 */
function isArrayBuffer(val) {
  return toString.call(val) === '[object ArrayBuffer]';
}

/**
 * Determine if a value is a FormData
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an FormData, otherwise false
 */
function isFormData(val) {
  return (typeof FormData !== 'undefined') && (val instanceof FormData);
}

/**
 * Determine if a value is a view on an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
 */
function isArrayBufferView(val) {
  var result;
  if ((typeof ArrayBuffer !== 'undefined') && (ArrayBuffer.isView)) {
    result = ArrayBuffer.isView(val);
  } else {
    result = (val) && (val.buffer) && (val.buffer instanceof ArrayBuffer);
  }
  return result;
}

/**
 * Determine if a value is a String
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a String, otherwise false
 */
function isString(val) {
  return typeof val === 'string';
}

/**
 * Determine if a value is a Number
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Number, otherwise false
 */
function isNumber(val) {
  return typeof val === 'number';
}

/**
 * Determine if a value is an Object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Object, otherwise false
 */
function isObject(val) {
  return val !== null && typeof val === 'object';
}

/**
 * Determine if a value is a Date
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Date, otherwise false
 */
function isDate(val) {
  return toString.call(val) === '[object Date]';
}

/**
 * Determine if a value is a File
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a File, otherwise false
 */
function isFile(val) {
  return toString.call(val) === '[object File]';
}

/**
 * Determine if a value is a Blob
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Blob, otherwise false
 */
function isBlob(val) {
  return toString.call(val) === '[object Blob]';
}

/**
 * Determine if a value is a Function
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Function, otherwise false
 */
function isFunction(val) {
  return toString.call(val) === '[object Function]';
}

/**
 * Determine if a value is a Stream
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Stream, otherwise false
 */
function isStream(val) {
  return isObject(val) && isFunction(val.pipe);
}

/**
 * Determine if a value is a URLSearchParams object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a URLSearchParams object, otherwise false
 */
function isURLSearchParams(val) {
  return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
}

/**
 * Trim excess whitespace off the beginning and end of a string
 *
 * @param {String} str The String to trim
 * @returns {String} The String freed of excess whitespace
 */
function trim(str) {
  return str.replace(/^\s*/, '').replace(/\s*$/, '');
}

/**
 * Determine if we're running in a standard browser environment
 *
 * This allows axios to run in a web worker, and react-native.
 * Both environments support XMLHttpRequest, but not fully standard globals.
 *
 * web workers:
 *  typeof window -> undefined
 *  typeof document -> undefined
 *
 * react-native:
 *  navigator.product -> 'ReactNative'
 * nativescript
 *  navigator.product -> 'NativeScript' or 'NS'
 */
function isStandardBrowserEnv() {
  if (typeof navigator !== 'undefined' && (navigator.product === 'ReactNative' ||
                                           navigator.product === 'NativeScript' ||
                                           navigator.product === 'NS')) {
    return false;
  }
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

/**
 * Iterate over an Array or an Object invoking a function for each item.
 *
 * If `obj` is an Array callback will be called passing
 * the value, index, and complete array for each item.
 *
 * If 'obj' is an Object callback will be called passing
 * the value, key, and complete object for each property.
 *
 * @param {Object|Array} obj The object to iterate
 * @param {Function} fn The callback to invoke for each item
 */
function forEach(obj, fn) {
  // Don't bother if no value provided
  if (obj === null || typeof obj === 'undefined') {
    return;
  }

  // Force an array if not already something iterable
  if (typeof obj !== 'object') {
    /*eslint no-param-reassign:0*/
    obj = [obj];
  }

  if (isArray(obj)) {
    // Iterate over array values
    for (var i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  } else {
    // Iterate over object keys
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        fn.call(null, obj[key], key, obj);
      }
    }
  }
}

/**
 * Accepts varargs expecting each argument to be an object, then
 * immutably merges the properties of each object and returns result.
 *
 * When multiple objects contain the same key the later object in
 * the arguments list will take precedence.
 *
 * Example:
 *
 * ```js
 * var result = merge({foo: 123}, {foo: 456});
 * console.log(result.foo); // outputs 456
 * ```
 *
 * @param {Object} obj1 Object to merge
 * @returns {Object} Result of all merge properties
 */
function merge(/* obj1, obj2, obj3, ... */) {
  var result = {};
  function assignValue(val, key) {
    if (typeof result[key] === 'object' && typeof val === 'object') {
      result[key] = merge(result[key], val);
    } else {
      result[key] = val;
    }
  }

  for (var i = 0, l = arguments.length; i < l; i++) {
    forEach(arguments[i], assignValue);
  }
  return result;
}

/**
 * Function equal to merge with the difference being that no reference
 * to original objects is kept.
 *
 * @see merge
 * @param {Object} obj1 Object to merge
 * @returns {Object} Result of all merge properties
 */
function deepMerge(/* obj1, obj2, obj3, ... */) {
  var result = {};
  function assignValue(val, key) {
    if (typeof result[key] === 'object' && typeof val === 'object') {
      result[key] = deepMerge(result[key], val);
    } else if (typeof val === 'object') {
      result[key] = deepMerge({}, val);
    } else {
      result[key] = val;
    }
  }

  for (var i = 0, l = arguments.length; i < l; i++) {
    forEach(arguments[i], assignValue);
  }
  return result;
}

/**
 * Extends object a by mutably adding to it the properties of object b.
 *
 * @param {Object} a The object to be extended
 * @param {Object} b The object to copy properties from
 * @param {Object} thisArg The object to bind function to
 * @return {Object} The resulting value of object a
 */
function extend(a, b, thisArg) {
  forEach(b, function assignValue(val, key) {
    if (thisArg && typeof val === 'function') {
      a[key] = bind(val, thisArg);
    } else {
      a[key] = val;
    }
  });
  return a;
}

module.exports = {
  isArray: isArray,
  isArrayBuffer: isArrayBuffer,
  isBuffer: isBuffer,
  isFormData: isFormData,
  isArrayBufferView: isArrayBufferView,
  isString: isString,
  isNumber: isNumber,
  isObject: isObject,
  isUndefined: isUndefined,
  isDate: isDate,
  isFile: isFile,
  isBlob: isBlob,
  isFunction: isFunction,
  isStream: isStream,
  isURLSearchParams: isURLSearchParams,
  isStandardBrowserEnv: isStandardBrowserEnv,
  forEach: forEach,
  merge: merge,
  deepMerge: deepMerge,
  extend: extend,
  trim: trim
};



},146:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);
var bind = __webpack_require__(84);
var Axios = __webpack_require__(147);
var mergeConfig = __webpack_require__(90);
var defaults = __webpack_require__(87);

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 * @return {Axios} A new instance of Axios
 */
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  var instance = bind(Axios.prototype.request, context);

  // Copy axios.prototype to instance
  utils.extend(instance, Axios.prototype, context);

  // Copy context to instance
  utils.extend(instance, context);

  return instance;
}

// Create the default instance to be exported
var axios = createInstance(defaults);

// Expose Axios class to allow class inheritance
axios.Axios = Axios;

// Factory for creating new instances
axios.create = function create(instanceConfig) {
  return createInstance(mergeConfig(axios.defaults, instanceConfig));
};

// Expose Cancel & CancelToken
axios.Cancel = __webpack_require__(91);
axios.CancelToken = __webpack_require__(160);
axios.isCancel = __webpack_require__(86);

// Expose all/spread
axios.all = function all(promises) {
  return Promise.all(promises);
};
axios.spread = __webpack_require__(161);

module.exports = axios;

// Allow use of default import syntax in TypeScript
module.exports.default = axios;



},147:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);
var buildURL = __webpack_require__(85);
var InterceptorManager = __webpack_require__(148);
var dispatchRequest = __webpack_require__(149);
var mergeConfig = __webpack_require__(90);

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 */
function Axios(instanceConfig) {
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  };
}

/**
 * Dispatch a request
 *
 * @param {Object} config The config specific for this request (merged with this.defaults)
 */
Axios.prototype.request = function request(config) {
  /*eslint no-param-reassign:0*/
  // Allow for axios('example/url'[, config]) a la fetch API
  if (typeof config === 'string') {
    config = arguments[1] || {};
    config.url = arguments[0];
  } else {
    config = config || {};
  }

  config = mergeConfig(this.defaults, config);

  // Set config.method
  if (config.method) {
    config.method = config.method.toLowerCase();
  } else if (this.defaults.method) {
    config.method = this.defaults.method.toLowerCase();
  } else {
    config.method = 'get';
  }

  // Hook up interceptors middleware
  var chain = [dispatchRequest, undefined];
  var promise = Promise.resolve(config);

  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    chain.unshift(interceptor.fulfilled, interceptor.rejected);
  });

  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    chain.push(interceptor.fulfilled, interceptor.rejected);
  });

  while (chain.length) {
    promise = promise.then(chain.shift(), chain.shift());
  }

  return promise;
};

Axios.prototype.getUri = function getUri(config) {
  config = mergeConfig(this.defaults, config);
  return buildURL(config.url, config.params, config.paramsSerializer).replace(/^\?/, '');
};

// Provide aliases for supported request methods
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, config) {
    return this.request(utils.merge(config || {}, {
      method: method,
      url: url
    }));
  };
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, data, config) {
    return this.request(utils.merge(config || {}, {
      method: method,
      url: url,
      data: data
    }));
  };
});

module.exports = Axios;



},148:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);

function InterceptorManager() {
  this.handlers = [];
}

/**
 * Add a new interceptor to the stack
 *
 * @param {Function} fulfilled The function to handle `then` for a `Promise`
 * @param {Function} rejected The function to handle `reject` for a `Promise`
 *
 * @return {Number} An ID used to remove interceptor later
 */
InterceptorManager.prototype.use = function use(fulfilled, rejected) {
  this.handlers.push({
    fulfilled: fulfilled,
    rejected: rejected
  });
  return this.handlers.length - 1;
};

/**
 * Remove an interceptor from the stack
 *
 * @param {Number} id The ID that was returned by `use`
 */
InterceptorManager.prototype.eject = function eject(id) {
  if (this.handlers[id]) {
    this.handlers[id] = null;
  }
};

/**
 * Iterate over all the registered interceptors
 *
 * This method is particularly useful for skipping over any
 * interceptors that may have become `null` calling `eject`.
 *
 * @param {Function} fn The function to call for each interceptor
 */
InterceptorManager.prototype.forEach = function forEach(fn) {
  utils.forEach(this.handlers, function forEachHandler(h) {
    if (h !== null) {
      fn(h);
    }
  });
};

module.exports = InterceptorManager;



},149:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);
var transformData = __webpack_require__(150);
var isCancel = __webpack_require__(86);
var defaults = __webpack_require__(87);

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
}

/**
 * Dispatch a request to the server using the configured adapter.
 *
 * @param {object} config The config that is to be used for the request
 * @returns {Promise} The Promise to be fulfilled
 */
module.exports = function dispatchRequest(config) {
  throwIfCancellationRequested(config);

  // Ensure headers exist
  config.headers = config.headers || {};

  // Transform request data
  config.data = transformData(
    config.data,
    config.headers,
    config.transformRequest
  );

  // Flatten headers
  config.headers = utils.merge(
    config.headers.common || {},
    config.headers[config.method] || {},
    config.headers
  );

  utils.forEach(
    ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
    function cleanHeaderConfig(method) {
      delete config.headers[method];
    }
  );

  var adapter = config.adapter || defaults.adapter;

  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);

    // Transform response data
    response.data = transformData(
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData(
          reason.response.data,
          reason.response.headers,
          config.transformResponse
        );
      }
    }

    return Promise.reject(reason);
  });
};



},150:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);

/**
 * Transform the data for a request or a response
 *
 * @param {Object|String} data The data to be transformed
 * @param {Array} headers The headers for the request or response
 * @param {Array|Function} fns A single function or Array of functions
 * @returns {*} The resulting transformed data
 */
module.exports = function transformData(data, headers, fns) {
  /*eslint no-param-reassign:0*/
  utils.forEach(fns, function transform(fn) {
    data = fn(data, headers);
  });

  return data;
};



},151:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);

module.exports = function normalizeHeaderName(headers, normalizedName) {
  utils.forEach(headers, function processHeader(value, name) {
    if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
      headers[normalizedName] = value;
      delete headers[name];
    }
  });
};



},152:function(module,exports,__webpack_require__){"use strict";


var createError = __webpack_require__(89);

/**
 * Resolve or reject a Promise based on response status.
 *
 * @param {Function} resolve A function that resolves the promise.
 * @param {Function} reject A function that rejects the promise.
 * @param {object} response The response.
 */
module.exports = function settle(resolve, reject, response) {
  var validateStatus = response.config.validateStatus;
  if (!validateStatus || validateStatus(response.status)) {
    resolve(response);
  } else {
    reject(createError(
      'Request failed with status code ' + response.status,
      response.config,
      null,
      response.request,
      response
    ));
  }
};



},153:function(module,exports,__webpack_require__){"use strict";


/**
 * Update an Error with the specified config, error code, and response.
 *
 * @param {Error} error The error to update.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The error.
 */
module.exports = function enhanceError(error, config, code, request, response) {
  error.config = config;
  if (code) {
    error.code = code;
  }

  error.request = request;
  error.response = response;
  error.isAxiosError = true;

  error.toJSON = function() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: this.config,
      code: this.code
    };
  };
  return error;
};



},154:function(module,exports,__webpack_require__){"use strict";


var isAbsoluteURL = __webpack_require__(155);
var combineURLs = __webpack_require__(156);

/**
 * Creates a new URL by combining the baseURL with the requestedURL,
 * only when the requestedURL is not already an absolute URL.
 * If the requestURL is absolute, this function returns the requestedURL untouched.
 *
 * @param {string} baseURL The base URL
 * @param {string} requestedURL Absolute or relative URL to combine
 * @returns {string} The combined full path
 */
module.exports = function buildFullPath(baseURL, requestedURL) {
  if (baseURL && !isAbsoluteURL(requestedURL)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
};



},155:function(module,exports,__webpack_require__){"use strict";


/**
 * Determines whether the specified URL is absolute
 *
 * @param {string} url The URL to test
 * @returns {boolean} True if the specified URL is absolute, otherwise false
 */
module.exports = function isAbsoluteURL(url) {
  // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
  // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
  // by any combination of letters, digits, plus, period, or hyphen.
  return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url);
};



},156:function(module,exports,__webpack_require__){"use strict";


/**
 * Creates a new URL by combining the specified URLs
 *
 * @param {string} baseURL The base URL
 * @param {string} relativeURL The relative URL
 * @returns {string} The combined URL
 */
module.exports = function combineURLs(baseURL, relativeURL) {
  return relativeURL
    ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
    : baseURL;
};



},157:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);

// Headers whose duplicates are ignored by node
// c.f. https://nodejs.org/api/http.html#http_message_headers
var ignoreDuplicateOf = [
  'age', 'authorization', 'content-length', 'content-type', 'etag',
  'expires', 'from', 'host', 'if-modified-since', 'if-unmodified-since',
  'last-modified', 'location', 'max-forwards', 'proxy-authorization',
  'referer', 'retry-after', 'user-agent'
];

/**
 * Parse headers into an object
 *
 * ```
 * Date: Wed, 27 Aug 2014 08:58:49 GMT
 * Content-Type: application/json
 * Connection: keep-alive
 * Transfer-Encoding: chunked
 * ```
 *
 * @param {String} headers Headers needing to be parsed
 * @returns {Object} Headers parsed into an object
 */
module.exports = function parseHeaders(headers) {
  var parsed = {};
  var key;
  var val;
  var i;

  if (!headers) { return parsed; }

  utils.forEach(headers.split('\n'), function parser(line) {
    i = line.indexOf(':');
    key = utils.trim(line.substr(0, i)).toLowerCase();
    val = utils.trim(line.substr(i + 1));

    if (key) {
      if (parsed[key] && ignoreDuplicateOf.indexOf(key) >= 0) {
        return;
      }
      if (key === 'set-cookie') {
        parsed[key] = (parsed[key] ? parsed[key] : []).concat([val]);
      } else {
        parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
      }
    }
  });

  return parsed;
};



},158:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);

module.exports = (
  utils.isStandardBrowserEnv() ?

  // Standard browser envs have full support of the APIs needed to test
  // whether the request URL is of the same origin as current location.
    (function standardBrowserEnv() {
      var msie = /(msie|trident)/i.test(navigator.userAgent);
      var urlParsingNode = document.createElement('a');
      var originURL;

      /**
    * Parse a URL to discover it's components
    *
    * @param {String} url The URL to be parsed
    * @returns {Object}
    */
      function resolveURL(url) {
        var href = url;

        if (msie) {
        // IE needs attribute set twice to normalize properties
          urlParsingNode.setAttribute('href', href);
          href = urlParsingNode.href;
        }

        urlParsingNode.setAttribute('href', href);

        // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
        return {
          href: urlParsingNode.href,
          protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
          host: urlParsingNode.host,
          search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
          hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
          hostname: urlParsingNode.hostname,
          port: urlParsingNode.port,
          pathname: (urlParsingNode.pathname.charAt(0) === '/') ?
            urlParsingNode.pathname :
            '/' + urlParsingNode.pathname
        };
      }

      originURL = resolveURL(window.location.href);

      /**
    * Determine if a URL shares the same origin as the current location
    *
    * @param {String} requestURL The URL to test
    * @returns {boolean} True if URL shares the same origin, otherwise false
    */
      return function isURLSameOrigin(requestURL) {
        var parsed = (utils.isString(requestURL)) ? resolveURL(requestURL) : requestURL;
        return (parsed.protocol === originURL.protocol &&
            parsed.host === originURL.host);
      };
    })() :

  // Non standard browser envs (web workers, react-native) lack needed support.
    (function nonStandardBrowserEnv() {
      return function isURLSameOrigin() {
        return true;
      };
    })()
);



},159:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);

module.exports = (
  utils.isStandardBrowserEnv() ?

  // Standard browser envs support document.cookie
    (function standardBrowserEnv() {
      return {
        write: function write(name, value, expires, path, domain, secure) {
          var cookie = [];
          cookie.push(name + '=' + encodeURIComponent(value));

          if (utils.isNumber(expires)) {
            cookie.push('expires=' + new Date(expires).toGMTString());
          }

          if (utils.isString(path)) {
            cookie.push('path=' + path);
          }

          if (utils.isString(domain)) {
            cookie.push('domain=' + domain);
          }

          if (secure === true) {
            cookie.push('secure');
          }

          document.cookie = cookie.join('; ');
        },

        read: function read(name) {
          var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
          return (match ? decodeURIComponent(match[3]) : null);
        },

        remove: function remove(name) {
          this.write(name, '', Date.now() - 86400000);
        }
      };
    })() :

  // Non standard browser env (web workers, react-native) lack needed support.
    (function nonStandardBrowserEnv() {
      return {
        write: function write() {},
        read: function read() { return null; },
        remove: function remove() {}
      };
    })()
);



},160:function(module,exports,__webpack_require__){"use strict";


var Cancel = __webpack_require__(91);

/**
 * A `CancelToken` is an object that can be used to request cancellation of an operation.
 *
 * @class
 * @param {Function} executor The executor function.
 */
function CancelToken(executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('executor must be a function.');
  }

  var resolvePromise;
  this.promise = new Promise(function promiseExecutor(resolve) {
    resolvePromise = resolve;
  });

  var token = this;
  executor(function cancel(message) {
    if (token.reason) {
      // Cancellation has already been requested
      return;
    }

    token.reason = new Cancel(message);
    resolvePromise(token.reason);
  });
}

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
CancelToken.prototype.throwIfRequested = function throwIfRequested() {
  if (this.reason) {
    throw this.reason;
  }
};

/**
 * Returns an object that contains a new `CancelToken` and a function that, when called,
 * cancels the `CancelToken`.
 */
CancelToken.source = function source() {
  var cancel;
  var token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    token: token,
    cancel: cancel
  };
};

module.exports = CancelToken;



},161:function(module,exports,__webpack_require__){"use strict";


/**
 * Syntactic sugar for invoking a function and expanding an array for arguments.
 *
 * Common use case would be to use `Function.prototype.apply`.
 *
 *  ```js
 *  function f(x, y, z) {}
 *  var args = [1, 2, 3];
 *  f.apply(null, args);
 *  ```
 *
 * With `spread` this example can be re-written.
 *
 *  ```js
 *  spread(function(x, y, z) {})([1, 2, 3]);
 *  ```
 *
 * @param {Function} callback
 * @returns {Function}
 */
module.exports = function spread(callback) {
  return function wrap(arr) {
    return callback.apply(null, arr);
  };
};



},208:function(module,__webpack_exports__,__webpack_require__){"use strict";
/* harmony import */ var _fundYield__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(92);
/* harmony import */ var axios__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(29);
/* harmony import */ var axios__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(axios__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _util__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(12);

const EVENT_QUEUE = Symbol('EVENT#QUEUE');


class FundData {
  static init(argus) {
    return new FundData(argus);
  }
  constructor() {
    let argus = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    this.timer = null;
    this.timer1 = null;
    this.fundYield = _fundYield__WEBPACK_IMPORTED_MODULE_0__[/* default */ "a"].init();
    // 当前所处分组的索引
    // this.groupIndex = (() => {
    //   const groupDatas = this.getOwnGroupDatas();
    //   const fundCurGroupIndex = +window.localStorage.getItem('fundCurGroupIndex');
    //   // 判断分组索引指针是否大于分组长度
    //   if (fundCurGroupIndex > groupDatas.length) {
    //     window.localStorage.setItem('fundCurGroupIndex', 0);
    //   }
    //   return fundCurGroupIndex > groupDatas.length ? 0 : fundCurGroupIndex;
    // })();

    // 事件队列
    this[EVENT_QUEUE] = new Map([['pollUpdate', []], ['ownUpdate', []],
    // 自选数据变化
    ['ownPollUpdate', []],
    // 自选数据轮询数据变化
    ['ownPollUpdate_bg', []],
    // 自选数据轮询数据变化 - 用于监听后台脚本background.js数据变化
    ['onChangeGroup', []],
    // 自选分组发生变化
    ['add', []], ['del', []], ['find', []]]);
    this.fundPollData = {
      time: new Date().getTime(),
      data: []
    };
    const that = this;
    // 基金数据代理
    this.ProxyFundPollData = new Proxy(this.fundPollData, {
      set(target, prop, value) {
        target[prop] = value;
        target.time = new Date().getTime();
        const str = JSON.stringify(target);
        localStorage.setItem('fundPollData', str);
        // 自选基金
        that.updateOwnPollCacheData();

        // 实例在backgrouond中使用向popup通信使用chrome.runtime.sendMessage
        // chrome.runtime.sendMessage({ type: "fund.__fundPollData", data: target });

        that.publish('pollUpdate', target);
        return true;
      }
    });
  }
  get groupIndex() {
    const groupDatas = this.getOwnGroupDatas();
    const fundCurGroupIndex = +window.localStorage.getItem('fundCurGroupIndex');
    // 判断分组索引指针是否大于分组长度
    if (fundCurGroupIndex > groupDatas.length) {
      window.localStorage.setItem('fundCurGroupIndex', 0);
    }
    return fundCurGroupIndex > groupDatas.length ? 0 : fundCurGroupIndex;
  }
  set groupIndex(val) {
    window.localStorage.setItem('fundCurGroupIndex', val);
  }

  /**
   * 添加订阅事件
   * @returns 
   */
  on(eventName, callback) {
    if (eventName && callback) {
      const fns = this[EVENT_QUEUE].get(eventName) || [];
      fns.push(callback);
      this[EVENT_QUEUE].set(eventName, fns);
    }
  }

  /**
   * 发布订阅事件
   * @param {*} eventName 
   * @param {*} data 
   */
  publish(eventName, data) {
    const fns = this[EVENT_QUEUE].get(eventName) || [];
    fns.forEach(fn => fn(data));
  }

  /**
   * 清空订阅事件
   * @param {*} eventName 
   * @param {*} data 
   */
  clear(eventName, data) {
    this[EVENT_QUEUE].set('pollUpdate', []);
    this[EVENT_QUEUE].set('ownPollUpdate', []);
  }

  /**
   * 获取自选数据
   */
  getOwnDatas() {
    let groups = this.getOwnGroupDatas();
    const funudItemList_ = (groups[this.groupIndex] || {
      name: '默认分组',
      data: []
    }).data;
    return funudItemList_.filter(item => {
      return typeof item === 'object' && item;
    });
  }

  /**
   * 获取分组数据
   */
  getOwnGroupDatas() {
    let groups = JSON.parse(localStorage.getItem('fundGroup') || '[]');
    if (groups.length === 0) {
      groups = [{
        data: [],
        name: '默认分组'
      }];
      // 保存分组
      this.onEditGroup(groups);
    }
    return groups;
  }

  /**
   * 选择分组
   * @param {*} values 
   * @returns 
   */
  onCheckGroup(index) {
    this.groupIndex = index;
    this.fetchFundData();
  }

  /**
   * 编辑分组（新增 修改）
   * @param {*} values 
   * @returns 
   */
  onEditGroup(newGroup) {
    if (newGroup.length <= 15) {
      localStorage.setItem("fundGroup", JSON.stringify(newGroup));
      return 1;
    }
    return '不能超过15个分组';
  }

  /**
   * 设置自选数据
   */
  setOwnDatas(values) {
    const group = JSON.parse(localStorage.getItem('fundGroup') || '[]');
    if (!group[this.groupIndex]) {
      group[this.groupIndex] = {
        data: []
      };
    }
    group[this.groupIndex].data = values;
    localStorage.setItem('fundGroup', JSON.stringify(group));

    // 更新本地缓存的轮询基金数据
    this.updateOwnPollCacheData();
    return group[this.groupIndex].data;
  }

  /**
   * 获取自选行情数据
   * 从轮询数据中筛选自选的数据
   * @returns 
   */
  getOwnPollCacheData() {
    // 获取全部的轮询缓存数据
    const datas = this.getAllPollCacheData();
    // 从全部轮询缓存中获取 获取自选的数据
    const ownData = this.getOwnDatas();
    return this.onCodesFilterPollData(ownData, datas);
  }

  /**
   * 获取指数行情数据
   */
  getIndexPollCacheData() {
    const datas = this.getAllPollCacheData();
    const fundIndexs = JSON.parse(localStorage.getItem("indexItemList"));
    return this.onCodesFilterPollData(fundIndexs, datas);
  }

  /**
   * 根据本地缓存的轮询基金数据来更新
   * 更新持仓等信息时，不需要重新请求，直接用本地数据计算，等待下次从远程获取的数据到来时一起更新
   * @returns 
   */
  updateOwnPollCacheData() {
    const data = this.getOwnPollCacheData();
    this.publish('ownPollUpdate', data);
    this.publish('ownPollUpdate_bg', data);
    chrome.runtime.sendMessage({
      type: "fund.__fundPollData",
      data
    });
  }

  /**
   * 获取全部轮序的缓存数据（包含非当前显示的自选）
   */
  getAllPollCacheData() {
    return (JSON.parse(localStorage.getItem("fundPollData")) || {
      data: []
    }).data || [];
  }

  /**
   *  请求获取基金数据
   * @returns 
   */
  async fetchFundData() {
    try {
      // SW 重启后内存 shim 里 fundGroup 为空，先从 chrome.storage.local 恢复
      if (this.getOwnDatas().length === 0) {
        await new Promise(resolve => {
          chrome.storage.local.get('fundGroup_cache', res => {
            if (res.fundGroup_cache) {
              localStorage.setItem('fundGroup', res.fundGroup_cache);
            }
            resolve();
          });
        });
      }
      // 获取自选
      const fundItemList = this.getOwnDatas();
      const strFundlist = fundItemList.map(val => val.code).join(",");
      return this.getFundInfo(strFundlist).then(res => {
        if (res.data.Datas && res.data.Datas.length > 0) this.ProxyFundPollData.data = res.data.Datas;
      });
    } catch (error) {
      return new Promise((res, rej) => rej(error));
    }
  }

  /**
   * 获取基金数据
   * @param {*} funds 
   * @returns 
   */
  getFundInfo(strFundlist) {
    const deviceid = _util__WEBPACK_IMPORTED_MODULE_2__[/* default */ "a"].guid();
    // 协议出自  https://i.eastmoney.com/
    return new Promise((resolve, reject) => {
      if (strFundlist) {
        const url = "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=200&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=" +
        // this.device_id +
        deviceid + "&Fcodes=" + strFundlist;
        const codes = strFundlist.split(',');
        const estimatePromises = codes.map(code =>
          axios__WEBPACK_IMPORTED_MODULE_1___default.a.get(
            `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`
          ).then(r => {
            const m = r.data.match(/jsonpgz\((.+)\)/);
            return m ? JSON.parse(m[1]) : null;
          }).catch(() => null)
        );
        // 预处理
        axios__WEBPACK_IMPORTED_MODULE_1___default.a.get(url).then(res => {
          if (res.status === 200) {
            Promise.all(estimatePromises).then(estimates => {
              if (res.data && res.data.Datas) {
                res.data.Datas.forEach(item => {
                  const est = estimates.find(e => e && e.fundcode === item.FCODE);
                  if (est && est.gszzl != null) {
                    item.GSZ = est.gsz;
                    item.GSZZL = est.gszzl;
                    item.GZTIME = est.gztime;
                  }
                });
              }
              resolve(res);
            });
          }
        }).catch(err => {
          reject(err);
        });
      } else {
        resolve({
          data: {
            Datas: []
          }
        });
      }
    });
  }

  /**
   * 字段处理
   * @param {*} datas
   */
  onFiledMap(item, ownData) {
    item = this.fundFormat(item);
    item.num = ownData.num;
    item.cost = ownData.cost;
    item.total_yield = this.fundYield.totalYield(item);
    item.cyje = this.fundYield.calculateMoney(item);
    item.dtsy = this.fundYield.calcOneFundSy(item);
    item.syl = this.fundYield.totalYield(item);
    item.zsy = this.fundYield.totalYieldMoney(item);
    // item.name = item.SHORTNAME;

    return item;
  }

  /**
  * 基金格式处理
  * @param {*} data 
  */
  fundFormat() {
    let data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    const res = {
      code: data.FCODE,
      name: data.SHORTNAME,
      jzrq: data.PDATE,
      dwjz: isNaN(data.NAV) ? null : data.NAV,
      gsz: (data.GSZ == null || isNaN(data.GSZ)) ? null : (+data.NAV + +data.NAV * +data.GSZZL / 100).toFixed(4),
      gszzl: (data.GSZZL == null || isNaN(data.GSZZL)) ? 0 : data.GSZZL,
      gztime: data.GZTIME
    };
    if (data.PDATE != "--" && data.GZTIME && data.PDATE == data.GZTIME.substr(0, 10)) {
      res.gsz = data.NAV;
      res.gszzl = isNaN(data.NAVCHGRT) ? 0 : data.NAVCHGRT;
      res.isUpdate = true;
    }

    // QDII 或者是 封闭基金
    if (data.GZTIME === '--' && data.GSZ === '--') {
      res.gsz = data.NAV;
      res.gszzl = isNaN(data.NAVCHGRT) ? 0 : data.NAVCHGRT;
    }
    return res;
  }

  /**
   * 根据基金的code顺序来进行对轮询回来的基金数据进行筛选、排序、处理
   * @param {*} codes 根据codes进行排序
   * @param {*} datas 当前本地所有的缓存
   * @returns 
   */
  onCodesFilterPollData(ownData) {
    let datas = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
    // 先拿出code, 减少后面循环次数
    const codes = ownData.map(item => item.code);
    const ownDatas = this.getOwnDatas();
    datas.forEach(item => {
      const hasIndex = codes.indexOf(item.FCODE);
      if (hasIndex > -1) {
        ownData[hasIndex] = this.onFiledMap(item, ownData[hasIndex]);
        // 把基金名称填充进来
        ownDatas[hasIndex].name = item.SHORTNAME;
      }
    });
    this.updateGroupIndex(ownDatas);

    // 增加健壮性，当对应的code没有在数据中获取到时，则过滤掉以免页面报错
    ownData = ownData.filter(item => typeof item === 'object');
    return ownData;
  }

  /**
   * 开始定时获取本地的股票数据
   */
  startPoll() {
    let timeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 15 * 1000;
    if (this.timer1) {
      clearTimeout(this.timer1);
    }
    // 开启轮询
    const pollFund = () => {
      this.timer1 = setTimeout(() => {
        pollFund();
        const _fd = (JSON.parse(window.localStorage.getItem('fundPollData')) || {}).data;
        if (Array.isArray(_fd) && _fd.length > 0) this.ProxyFundPollData.data = _fd;
      }, 5000);
    };
    pollFund();
    this.fetchFundData();
  }

  /**
   * 开始轮询请求股票数据，然后把股票数据存放到本地
   */
  startPollRquest() {
    let timeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 15 * 1000;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    // 开启轮询
    const startPollRquest = () => {
      this.fetchFundData().finally(() => {
        this.timer = setTimeout(() => {
          startPollRquest();
          // 休盘后 轮询改为 60秒一次
        }, _util__WEBPACK_IMPORTED_MODULE_2__[/* default */ "a"].isDuringDate() ? timeout : 60 * 1000);
      });
    };
    startPollRquest();
    this.fetchFundData();
  }

  /**
   * 添加自选基金
   */
  add(value) {
    const data = this.getOwnDatas();
    if (data.length >= 50) {
      return '每个分组自选不能超过50支产品';
    }
    if (data.findIndex(item => item.code === value.code) === -1) {
      data.push(value);
      this.setOwnDatas(data);
      // 获取最新的数据
      this.fetchFundData();
      return 1;
    }
    return '该基金已添加！';
  }

  /**
   * 删除自选
   * @param {*} code
   * @param {*} callback 为了快速响应交互，删除操作后会在该回调函数返回最新数据 
   */
  del(code) {
    let callback = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : () => {};
    const data = this.getOwnDatas();
    const targetIndex = this.find(code).index;
    if (targetIndex > -1) {
      data.splice(targetIndex, 1);
      callback(data);
      this.setOwnDatas(data);
      return 1;
    }
    return -1;
  }

  /**
   * 修改某一支基金，比如 持仓价格 持仓数量
   */
  update(code, newData) {
    const data = this.getOwnDatas();
    const targetIndex = this.find(code).index;
    if (targetIndex > -1) {
      data[targetIndex] = {
        ...data[targetIndex],
        ...newData
      };
      this.setOwnDatas(data);
      return 1;
    }
    return -1;
  }

  /**
   * 根据索引修改对应的分组
   */
  updateGroupIndex(data) {
    let index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
    const groups = this.getOwnGroupDatas();
    groups[index === null ? this.groupIndex : index].data = data;
    localStorage.setItem('fundGroup', JSON.stringify(groups));
  }

  /**
   * 根据code查询基金
   * @param {*} code 
   * @returns 
   */
  find(code) {
    const data = this.getOwnDatas();
    const targetIndex = data.findIndex(item => item.code === code);
    return {
      data: data[targetIndex],
      index: targetIndex
    };
  }
}
/* harmony default export */ __webpack_exports__["a"] = (FundData);


},29:function(module,exports,__webpack_require__){
module.exports = __webpack_require__(146);


},32:function(module,__webpack_exports__,__webpack_require__){"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a", function() { return InitdIndexedDB; });
class IndexedDB {
  constructor(argus) {
    const {
      databaseName,
      dbVersion
    } = argus;
    if (!databaseName || !dbVersion) {
      console.error('databaseName 或 dbVersion 不能为空');
      return;
    }
    this.databaseName = databaseName;
    this.dbVersion = dbVersion;
    this.db = {};
  }
  initDb() {
    return new Promise((resolve, reject) => {
      let request = window.indexedDB.open(this.databaseName, this.dbVersion);
      request.onerror = event => {
        console.log('数据库打开报错');
        reject({
          event: 'onerror'
        });
      };
      request.onsuccess = event => {
        this.db = event.target.result;
        console.log('数据库打开成功');
        resolve({
          event: 'onsuccess'
        });
      };
      request.onupgradeneeded = event => {
        console.log('数据库打开成功-升级');
        this.db = event.target.result;
        resolve({
          event: 'onupgradeneeded'
        });
      };
    });
  }
  creatTable(tableName, keyPath) {
    let objectStore;
    if (!this.db.objectStoreNames.contains(tableName)) {
      // 如果没有指定了主键，则是用递增的整数
      const keyPathData = keyPath ? keyPath : {
        autoIncrement: true
      };
      objectStore = this.db.createObjectStore(tableName, keyPathData);
    }
    this.objectStore = objectStore;
    return objectStore;
  }

  /**
   * 创建表属性
   */
  createIndex(name, attribute) {
    let config = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {
      unique: false
    };
    this.objectStore.createIndex(name, attribute, config);
    return this.objectStore;
  }

  /**
   * 打开数据库
   * @returns 
   */
  openDB() {
    return new Promise((resolve, reject) => {
      let request = window.indexedDB.open(this.databaseName, this.dbVersion);
      request.onerror = event => {
        reject("IndexedDB数据库打开错误，" + event);
      };
      request.onsuccess = event => {
        resolve(event.target.result);
      };
    });
  }
  closeDb() {
    this.db.close();
  }

  /**
   * 删除表
   */
  deleteDb() {
    this.openDB().then(db => {
      db.deleteDatabase(this.databaseName);
    });
  }
  add(table, value) {
    try {
      return new Promise((resolve, reject) => {
        let p = this.openDB();
        p.then(db => {
          this.db = db;
          let request = this.db.transaction([table], 'readwrite').objectStore(table).add(value);
          request.onsuccess = () => {
            resolve({
              flag: true
            });
          };
          request.onerror = error => {
            reject({
              flag: false,
              type: 1,
              error: error.target.error.message
            });
          };
        }).catch(error => {
          return console.error(error);
        });
      });
    } catch (error) {
      return Promise.reject({
        flag: false,
        error
      });
    }
  }

  /**
   * 根据主键查询数据
   * @param {*} table 表名
   * @param {*} key 主键值
   * @returns 
   */
  get(table, key) {
    try {
      return new Promise((resolve, reject) => {
        this.openDB().then(db => {
          this.db = db;
          let transaction = this.db.transaction([table], 'readonly');
          let store = transaction.objectStore(table);
          let request = store.get(key);
          request.onsuccess = () => {
            resolve(request.result);
          };
          request.onerror = () => {
            reject({
              flag: false
            });
          };
        });
      });
    } catch (error) {
      return Promise.reject({
        flag: false
      });
    }
  }
  /**
   * 查询全部数据
   * @param {*} table 
   * @param {*} query 
   * @param {*} count 
   * @returns 
   */
  getAll(table, query, count) {
    try {
      return new Promise((resolve, reject) => {
        this.openDB().then(db => {
          this.db = db;
          let transaction = this.db.transaction([table], 'readonly');
          let store = transaction.objectStore(table);
          let request = store.getAll(query, count);
          request.onsuccess = () => {
            resolve(request.result);
          };
          request.onerror = err => {
            reject({
              flag: false
            });
          };
        });
      });
    } catch (error) {
      return Promise.reject({
        flag: false,
        error
      });
    }
  }

  /**
   * 根据索引查找数据
   * @param {*} table 表名
   * @param {*} index 索引字段
   * @param {*} value 索引字段对应的值
   * @param {*} pages 分页参数 [pageNum, pageSize]
   * @returns 
   */
  selectData(table, index, value, pages) {
    try {
      return new Promise(resolve => {
        let p = this.openDB();
        p.then(db => {
          this.db = db;
          let selectQuene = new Array(0);
          let IDBIndex = this.db.transaction([table], 'readwrite').objectStore(table).index(index);
          let request = IDBIndex.openCursor(IDBKeyRange.only(value));
          request.onsuccess = e => {
            let cursor = e.target.result;
            if (cursor) {
              selectQuene.push({
                ...request.result.value,
                primaryKey: request.result.primaryKey
              });
              cursor.continue();
            } else {
              if (pages) {
                const [pageNum, pageSize] = pages;
                resolve(selectQuene.splice(selectQuene.length - pageNum * pageSize, pageSize));
              } else {
                resolve(selectQuene);
              }
            }
          };
          request.onerror = () => {
            resolve({
              flag: false
            });
          };
        }).catch(error => {
          return console.error(error);
        });
      });
    } catch (error) {
      return Promise.resolve({
        flag: false
      });
    }
  }
  /**
   * 根据索引查找数据-废弃
   * @param {*} table 表名
   * @param {*} index 索引字段
   * @param {*} value 索引字段对应的值
   * @param {*} pages 分页参数 [pageNum, pageSize]
   * @returns 
   */
  selectData2(table, index, value, pages) {
    console.log('pages', pages);
    try {
      return new Promise(resolve => {
        let p = this.openDB();
        let advancing = true;
        let num = 0;
        p.then(data => {
          this.db = data;
          let selectQuene = new Array(0);
          let IDBIndex = this.db.transaction([table], 'readwrite').objectStore(table).index(index);

          //  console.log('IDBIndex.count()', );

          let request = IDBIndex.openCursor(IDBKeyRange.only(value));
          // const allCount = request.count().onsuccess = (res) => {
          //   console.log('allCount', res.target.result);
          // };

          request.onsuccess = e => {
            let cursor = e.target.result;
            if (cursor) {
              if (pages && advancing) {
                const [pageNum, pageSize] = pages;
                // 移动指针
                cursor.advance(allCount - pageNum * pageSize);
                advancing = false;
              } else {
                if (pages) {
                  console.log('selectQuene.length', selectQuene.length);
                  console.log('pages[1]', pages[1]);
                }
                if (pages && selectQuene.length >= pages[1]) {
                  console.log('满足分页');
                  resolve(selectQuene);
                  return;
                }
                selectQuene.push(request.result.value);
                cursor.continue();
              }
            } else {
              resolve(selectQuene);
            }
          };
          request.onerror = () => {
            resolve({
              flag: false
            });
          };
        }).catch(error => {
          return console.error(error);
        });
      });
    } catch (error) {
      return Promise.resolve({
        flag: false
      });
    }
  }

  /**
   * 范围查询
   * @param {*} table 
   * @param {*} index 
   * @param {*} valueX 
   * @param {*} valueY 
   * @returns 
   * https://wangdoc.com/javascript/bom/indexeddb.html#idbkeyrange-%E5%AF%B9%E8%B1%A1
   */
  selectDataBound(table, index, valueX, valueY) {
    try {
      return new Promise(resolve => {
        let p = this.openDB();
        p.then(db => {
          this.db = db;
          let selectQuene = new Array(0);
          let request = this.db.transaction([table], 'readwrite').objectStore(table).index(index).openCursor(IDBKeyRange.bound(valueX, valueY));
          request.onsuccess = e => {
            let cursor = e.target.result;
            if (cursor) {
              selectQuene.push(request.result.value);
              cursor.continue();
            } else {
              resolve(selectQuene);
            }
          };
          request.onerror = () => {
            resolve({
              flag: false
            });
          };
        }).catch(error => {
          return console.log(error);
        });
      });
    } catch (error) {
      return Promise.resolve({
        flag: false
      });
    }
  }

  /**
   * 新增修改
   * @param {*} table 
   * @param {*} value 
   * @returns 
   */
  put(table, value) {
    try {
      return new Promise(resolve => {
        let p = this.openDB();
        p.then(data => {
          this.db = data;
          let request = this.db.transaction([table], 'readwrite').objectStore(table).put(value);
          request.onsuccess = () => {
            resolve({
              flag: true
            });
          };
          request.onerror = () => {
            resolve({
              flag: false
            });
          };
        }).catch(error => {
          return console.error(error);
        });
      });
    } catch (error) {
      console.error(error);
      return Promise.resolve({
        result: false
      });
    }
  }
  delete(table, primaryKey) {
    try {
      return new Promise(resolve => {
        let p = this.openDB();
        p.then(data => {
          this.db = data;
          let request = this.db.transaction([table], 'readwrite').objectStore(table).delete(primaryKey);
          request.onsuccess = () => {
            resolve({
              flag: true
            });
          };
          request.onerror = () => {
            resolve({
              flag: false
            });
          };
        }).catch(error => {
          return console.log(error);
        });
      });
    } catch (error) {
      return Promise.resolve({
        result: false
      });
    }
  }
  countData(table, index, value) {
    try {
      let p = this.openDB();
      p.then(data => {
        this.db = data;
      }).catch(error => {
        return console.log(error);
      });
      let request = this.db.transaction([table], 'readonly').objectStore(table).count();
      return new Promise(resolve => {
        request.onsuccess = () => {
          resolve({
            flag: true,
            result: request.result
          });
        };
        request.onerror = () => {
          resolve({
            flag: false
          });
        };
      });
    } catch (error) {
      return Promise.resolve({
        result: false
      });
    }
  }
  countData2(table, index, value) {
    try {
      let p = this.openDB();
      p.then(data => {
        this.db = data;
      }).catch(error => {
        return console.log(error);
      });
      let nCount = 0;
      let request = this.db.transaction([table], 'readonly').objectStore(table).index(index).openCursor(IDBKeyRange.only(value));
      return new Promise(resolve => {
        request.onsuccess = e => {
          let cursor = e.target.result;
          if (cursor) {
            nCount++;
            cursor.continue();
          } else {
            resolve({
              flag: true,
              result: nCount
            });
          }
        };
        request.onerror = () => {
          resolve({
            flag: false
          });
        };
      });
    } catch (error) {
      return Promise.resolve({
        flag: false
      });
    }
  }

  /**
   * 清空表
   * @param {*} table 
   * @returns 
   */
  cleaerObjectstore(table) {
    try {
      return new Promise(resolve => {
        let p = this.openDB();
        p.then(data => {
          this.db = data;
          let request = this.db.transaction([table], 'readwrite').objectStore(table).clear();
          request.onsuccess = () => {
            resolve({
              flag: true
            });
          };
          request.onerror = () => {
            resolve({
              flag: false
            });
          };
        }).catch(error => {
          return console.log(error);
        });
      });
    } catch (error) {
      return Promise.resolve({
        result: false
      });
    }
  }
}
/* unused harmony default export */ var _unused_webpack_default_export = (IndexedDB);
const InitdIndexedDB = new IndexedDB({
  databaseName: 'stock',
  dbVersion: 4
});


},441:function(module,__webpack_exports__,__webpack_require__){"use strict";
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXTERNAL MODULE: ./popup/util.js
var util = __webpack_require__(12);

// EXTERNAL MODULE: ./popup/util/stockYield.js
var stockYield = __webpack_require__(75);

// EXTERNAL MODULE: ./popup/util/fundData.js
var fundData = __webpack_require__(208);

// CONCATENATED MODULE: ./background/createWindow.js
const creatWindow = () => {
  chrome.contextMenus.remove("openWindow", () => {
    void chrome.runtime.lastError;
    chrome.contextMenus.create({
      id: "openWindow",
      title: "以独立窗口模式打开",
      contexts: ["action"]
    });
  });
  chrome.contextMenus.onClicked.addListener(function(info) {
    if (info.menuItemId === "openWindow") {
      chrome.windows.create({
        url: chrome.runtime.getURL("popup/popup.html"),
        width: 700,
        height: 550,
        top: 200,
        type: "popup"
      }, function(e) {
        chrome.windows.update(e.id, { focused: true });
      });
    }
  });
};
/* harmony default export */ var createWindow = (creatWindow);
// EXTERNAL MODULE: ../node_modules/axios/index.js
var axios = __webpack_require__(29);
var axios_default = /*#__PURE__*/__webpack_require__.n(axios);

// CONCATENATED MODULE: ./background/getRate.js

/* harmony default export */ var background_getRate = (() => {
  const getRate = () => {
    let url = "https://api.it120.cc/gooking/forex/rate?fromCode=CNY&toCode=USD";
    axios_default.a.get(url).then(res => {
      localStorage.USDtoCNY = res.data.data.rate;
    });
    let url_ = "https://api.it120.cc/gooking/forex/rate?fromCode=CNY&toCode=HKD";
    axios_default.a.get(url_).then(res => {
      localStorage.HKDtoCNY = res.data.data.rate;
    });
  };
  window.timedTask.add({
    interval: 6 * 60,
    task: () => {
      getRate();
    }
  });
});
// CONCATENATED MODULE: ./background/alive.js



// 卸载检测
/* harmony default export */ var background_alive = (config => {
  const manifest = chrome.runtime.getManifest();

  /**
   * 卸载原因统计
   */
  function set_mzk_UninstallURL() {
    // disabled: no longer setting uninstall URL
  }
  ;
  const alive = function () {
    let parms = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    chrome.storage.sync.get(null, res => {
      if (res) {
        delete res.holiday;
        let {
          device_id
        } = res;
        // 判断本地有没有生成用户唯一id
        if (!device_id) {
          device_id = util["a" /* default */].guid();
          chrome.storage.sync.set({
            device_id
          });
        }
        config.device_id = device_id;
        if (true) {
          set_mzk_UninstallURL();
        }
        axios_default.a.post(`${config.host}/updata`, {
          device_id,
          device_content: JSON.stringify({
            ...res,
            ...parms
          }),
          device_browser_type: util["a" /* default */].getBrowser()
        }).catch(() => {});
      }
    });
  };

  // 安装更新检测
  chrome.runtime.onInstalled.addListener(e => {
    const {
      reason
    } = e;
    // 版本更新
    if (reason === 'update') {
      alive({
        version: e.previousVersion
      });
    } else {
      // 安装
      alive({
        version: manifest.version
      });
    }
  });

  // 每日存活数量检测
  alive({
    version: manifest.version
  });
  // 两个小时自动上传一次
  setInterval(() => {
    alive({
      version: manifest.version
    });
  }, 1000 * 60 * 60 * 2);
});
// CONCATENATED MODULE: ./background/uploadYield.js


/**
* 上传收益率 用作统计数据
*/
/* harmony default export */ var uploadYield = ((config, totalZsyl) => {
  const token = localStorage.getItem('token');
  if (!token) return;
  axios_default.a.post(`${config.host}/uploadYield`, {
    yieldRate: totalZsyl
  }, {
    headers: {
      token
    }
  }).catch(() => {});
});
// CONCATENATED MODULE: ./background/pollData.js

// 股票操作
class pollData_StockData {
  constructor() {
    this.stockPollData = {
      time: new Date().getTime(),
      data: []
    };

    // 股票数据代理
    this.ProxyStockPollData = new Proxy(this.stockPollData, {
      set(target, prop, value) {
        target[prop] = value;
        target.time = new Date().getTime();
        const str = JSON.stringify(target);
        localStorage.setItem('stockPollData', str);
        chrome.runtime.sendMessage({
          type: "__updatePollStock",
          data: target
        });
        return true;
      }
    });
  }

  /**
   * 获取自选数据
   */
  getOwnDatas() {
    const stockItemList = JSON.parse(localStorage.getItem('stockItemList') || '[]');
    return stockItemList;
  }

  /**
   * 设置自选数据
   */
  setOwnDatas(values) {
    localStorage.setItem('stockItemList', JSON.stringify(values));
    return values;
  }

  /**
   *  请求获取股票数据
   * @returns 
   */
  fetchStockData() {
    const stockItemList = this.getOwnDatas();
    const SCodes = stockItemList.map(item => `${item.market}.${item.code}`).join(',');
    const Surl = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f13,f19,f14,f139,f148,f2,f4,f1,f125,f18,f3,f152,f5,f30,f31,f32,f6,f8,f7,f10,f22,f9,f112,f100,f88,f153&secids=${SCodes}`;
    return new Promise((resolve, reject) => {
      axios_default.a.get(Surl).then(res => {
        if (res.data.data && res.data.data.diff && res.data.data.diff.length > 0) {
          resolve(res);
          this.ProxyStockPollData.data = res.data.data.diff;
        }
      });
    });
  }

  /**
   * 开始轮询
   */
  startPoll() {
    let timeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 15 * 1000;
    // 开启轮询
    const pollStock = () => {
      setTimeout(() => {
        this.fetchStockData().finally(() => {
          pollStock();
        });
      }, timeout);
    };
    pollStock();
    this.fetchStockData();
  }

  /**
   * 添加自选股票
   */
  add(value) {
    const data = this.getOwnDatas();
    data.push(value);
    this.setOwnDatas(data);
  }
}
class pollData_FundData {
  constructor() {
    this.fundPollData = {
      time: new Date().getTime(),
      data: []
    };

    // 股票数据代理
    this.proxyFundPollData = new Proxy(this.fundPollData, {
      set(target, prop, value) {
        target[prop] = value;
        target.time = new Date().getTime();
        localStorage.setItem('fundPollData', JSON.stringify(target));
        return true;
      }
    });
  }

  /**
  *  请求获取股票数据
  * @returns 
  */
  fetchFundData() {
    const fundListM = JSON.parse(localStorage.getItem('fundListM') || '[]');
    const device_id = localStorage.getItem('device_id');
    const FCodes = fundListM.map(item => item.code).join(',');
    const Furl = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=200&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=${device_id}&Fcodes=${FCodes}`;
    return new Promise((resolve, reject) => {
      axios_default.a.get(Furl).then(res => {
        if (res.data.Datas) {
          resolve(res);
          this.proxyFundPollData.data = res.data.Datas;
        }
      });
    });
  }

  /**
   * 开始轮询
   */
  startPoll() {
    let timeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 50 * 1000;
    // 开启轮询
    const poll = () => {
      setTimeout(() => {
        this.fetchFundData().finally(() => {
          poll();
        });
      }, timeout);
    };
    poll();
    this.fetchFundData();
  }
}
// EXTERNAL MODULE: ./popup/util/fundYield.js
var fundYield = __webpack_require__(92);

// CONCATENATED MODULE: ./background/badge.js



const FundYield = fundYield["a" /* default */].init();
const StockYield = stockYield["a" /* default */].StockYield.init();

/**
 * 角标设置
 */
/* harmony default export */ var badge = (config => {
  const manifest = chrome.runtime.getManifest();
  // 基金数据角标title数据
  let fundBrowserActionTitle = '';
  // 股票数据角标title数据
  let stockBrowserActionTitle = '';
  // 指数数据角标title数据
  let indexBrowserActionTitle = '';
  // 基金当日收益
  let fundProfitTitle = '';
  // 股票当日收益
  let stockProfitTitle = '';

  // 基金总持仓金额
  let fundListToatal = 0;
  // 基金当天收益金额
  let fundListProfitToatal = 0;

  // 股票总持仓金额
  let stockListToatal = 0;
  // 股票当天收益金额
  let stockListProfitToatal = 0;

  // 总收益率
  let totalZsyl = '0.00';
  // 总收益
  let totalZsy = 0;

  // 今日总收益金额
  let listProfitToatal = fundListProfitToatal + stockListProfitToatal;
  // 总持仓金额
  let listToatal = fundListToatal + stockListToatal;

  /**
   * 内容格式化
   * @param {string} content 显示 的内容
   * @param {number} type 输出格式 1-> % 2 -> 内容
   */
  function formartContent() {
    let content = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    let type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 2;
    let num = content;
    if (type === 2) {
      num = Math.round(num);
      // 判断是否为整数
      let absNum = Math.abs(num);
      if (absNum < 10) {
        num = num.toFixed(2);
      } else if (absNum < 100) {
        num = num.toFixed(1);
      } else if (absNum < 1000) {
        num = num.toFixed(0);
      } else if (absNum < 10000) {
        num = (num / 1000).toFixed(1) + 'k';
      } else if (absNum < 1000000) {
        num = (num / 1000).toFixed(0) + 'k';
      } else if (absNum < 10000000) {
        num = (num / 1000000).toFixed(1) + 'M';
      } else {
        num = (num / 1000000).toFixed(0) + 'M';
      }
    } else if (type === 1) {
      num = num.toFixed(2);
    }
    return `${num}`;
  }

  /**
   * 设置角标数据
   * @param {*} type 99 -> 只更新角标不刷新通知
   */
  const setBadge = function (badgeModel) {
    let type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '0';
    switch (badgeModel) {
      // 关闭角标
      case '0':
        chrome.browserAction.setBadgeText({
          text: ''
        });
        break;
      case '1':
        chrome.browserAction.setBadgeText({
          text: `${totalZsy}`
        });
        chrome.browserAction.setBadgeBackgroundColor({
          color: fundListProfitToatal + stockListProfitToatal >= 0 ? '#F56C6C' : '#67C23A'
        });
        break;
      case '2':
        chrome.browserAction.setBadgeText({
          text: `${totalZsyl}`
        });
        chrome.browserAction.setBadgeBackgroundColor({
          color: listProfitToatal / listToatal >= 0 ? '#F56C6C' : '#67C23A'
        });
        break;
      default:
        break;
    }
  };

  /**
   * 处理收益
   */
  function handleSy() {
    // 今日收益金额
    listProfitToatal = fundListProfitToatal + stockListProfitToatal;
    // 总金额
    listToatal = fundListToatal + stockListToatal;
    // 保存总收益
    totalZsy = formartContent(Math.abs(fundListProfitToatal + stockListProfitToatal), 2);
    // 保存总收益率
    totalZsyl = listToatal !== 0 ? formartContent(Math.abs(listProfitToatal / listToatal * 100), 1) : '0.00';
  }

  /**
   * 设置角标title
   * @param {*} type 
   */
  const onSetBrowserActionTitle = () => {
    let title = `${indexBrowserActionTitle}\n${stockBrowserActionTitle}\n${fundBrowserActionTitle}当日收益: \n`;
    if (stockListProfitToatal) {
      title += `股票：${stockListProfitToatal.toFixed(2)}`;
    }
    if (stockListProfitToatal && fundListProfitToatal) {
      title += '\n';
    }
    if (fundListProfitToatal) {
      title += `基金：${fundListProfitToatal.toFixed(2)}`;
    }
    chrome.browserAction.setTitle({
      title
    });
  };

  /**
   * 设置指数的角标内容
   * @param {*} data 
   */
  function setIndexBrowserActionTitle(data) {
    // 获取指数数据
    const indexData = window.stock.getIndexPollCacheData();
    indexBrowserActionTitle = '';
    indexData.forEach((item, index) => {
      const {
        f3,
        f14
      } = item;
      if (index <= 3) {
        if (index % 2 === 0) {
          indexBrowserActionTitle += `${f14}  ${f3}% `;
        } else {
          indexBrowserActionTitle += `${f14}  ${f3}%\n`;
        }
      }
    });
    onSetBrowserActionTitle();
  }

  /**
   * 处理更新后的股票数据
   */
  function onStockData(data_) {
    const data = data_ || window.stock.getOwnPollCacheData();
    const badgeModel = getBadgeModel();
    // 有持仓但无任何实时价格（如 popup 刚开启时的初始推送）：
    // 跳过重算，保留已有的股票收益数据，避免将角标归零
    const hasAnyHolding = data.some(item => item.num && +item.num > 0);
    const hasAnyPrice = data.some(item => item.price);
    if (hasAnyHolding && !hasAnyPrice) return;
    stockListToatal = 0;
    stockListProfitToatal = 0;

    // 设置title
    stockBrowserActionTitle = '';
    data.forEach(item => {
      if (badgeModel === '1' || badgeModel === '2') {
        if (item.num && item.price) {
          stockListToatal += StockYield.calculateMoney(item);
          let num_ = StockYield.calculateTotalProfit(item, 'all');
          stockListProfitToatal += +num_;
        }
      }
      if (item.initPrice && item.num) {
        const {
          f3,
          f14,
          f2
        } = item;
        stockBrowserActionTitle += `${f14} ${f2} (${f3}%)\n`;
      }
    });
    // 处理总收益
    handleSy();
    try {
      setBadge(badgeModel);
    } catch (error) {}
    try {
      onSetBrowserActionTitle();
    } catch (error) {}
  }

  /**
   * 处理更新后的基金数据
   */
  function onFundData(data_) {
    const data = data_ || window.fund.getOwnPollCacheData();
    const badgeModel = getBadgeModel();
    fundListToatal = 0;
    fundListProfitToatal = 0;
    // 设置title
    fundBrowserActionTitle = '';
    data.forEach(item => {
      // 计算收益，提供给角标显示使用
      if (badgeModel === '1' || badgeModel === '2') {
        fundListToatal += +FundYield.calculateMoney(item);
        fundListProfitToatal += +FundYield.calcOneFundSy(item);
      }
      if (item.cost && item.num) {
        fundBrowserActionTitle += `${item.name}  ${item.gszzl}%\n`;
      }
    });
    handleSy();
    setBadge(badgeModel);
    onSetBrowserActionTitle();
  }
  function getBadgeModel() {
    let badgeModel = '';
    try {
      const config = JSON.parse(localStorage.getItem('config') || '{}');
      badgeModel = config.badgeModel || '0';
    } catch (error) {
      badgeModel = '0';
    }
    return badgeModel;
  }

  // popup 推送过来的含持仓信息的完整数据缓存，用于背景轮询时补充 initPrice/num
  let _lastPopupStockData = null;
  // popup 推送过来的含持仓信息的基金完整数据缓存，用于背景轮询时补充 num/cost
  let _lastPopupFundData = null;

  // 监听股票变化 包括 指数
  window.stock.on("ownPollUpdate_bg", data => {
    // 设置指数的角标内容
    setIndexBrowserActionTitle();
    // 处理更新后的股票数据
    // background 自身的 stockGroup 无 initPrice/num，用 popup 推过来的缓存数据替代
    const hasHoldings = data.some(item => item.num && +item.num > 0);
    onStockData(hasHoldings ? data : (_lastPopupStockData || data));
  });

  // 监听基金变化
  window.fund.on("ownPollUpdate_bg", data => {
    // background 自身的 fundGroup 无 num/cost，用 popup 推过来的缓存数据替代
    const hasHoldings = data.some(item => item.num && +item.num > 0);
    onFundData(hasHoldings ? data : (_lastPopupFundData || data));
  });

  // 监听事件
  chrome.runtime.onMessage.addListener(request => {
    if (request.type === "refresh") {
      // 从 chrome.storage.sync 读取最新配置更新内存 shim，确保选项页保存的设置立即生效
      chrome.storage.sync.get(['badgeModel'], function(r) {
        if (r.badgeModel !== undefined) {
          try {
            const cfg = JSON.parse(localStorage.getItem('config') || '{}');
            cfg.badgeModel = r.badgeModel;
            localStorage.setItem('config', JSON.stringify(cfg));
          } catch(e) {}
        }
        const badgeModelToUse = (r.badgeModel !== undefined) ? r.badgeModel : getBadgeModel();
        // SW 重启后收益变量全为 0，直接 setBadge 会把角标清空。
        // 先尝试从 chrome.storage.local 恢复上次缓存的收益数据来重算角标。
        if (totalZsy === 0 && totalZsyl === '0.00' && badgeModelToUse !== '0') {
          chrome.storage.local.get(['stockPollData_bg_cache', 'fundPollData_bg_cache'], function(res) {
            var restored = false;
            if (res.stockPollData_bg_cache) {
              try {
                var cached = JSON.parse(res.stockPollData_bg_cache);
                if (Array.isArray(cached) && cached.some(function(item) { return item.price; })) {
                  _lastPopupStockData = cached;
                  onStockData(cached);
                  restored = true;
                }
              } catch(e) {}
            }
            if (res.fundPollData_bg_cache) {
              try {
                var cached = JSON.parse(res.fundPollData_bg_cache);
                if (Array.isArray(cached) && cached.length > 0) {
                  _lastPopupFundData = cached;
                  onFundData(cached);
                  restored = true;
                }
              } catch(e) {}
            }
            if (!restored) {
              // 没有缓存（首次安装），正常设置角标
              setBadge(badgeModelToUse);
            }
          });
          return;
        }
        setBadge(badgeModelToUse);
      });
    }
    // popup 轮询后把含持仓信息的完整数据推过来，直接用于计算角标收益
    if (request.type === "stock__ownPollUpdate" && request.data) {
      _lastPopupStockData = request.data;
      // popup 初次推送时可能只有持仓信息而无实时价格，此时跳过重算
      // 避免将后台已正确计算的股票收益归零，等有价格数据再更新角标
      const hasPriceData = request.data.some(item => item.price);
      if (hasPriceData) {
        onStockData(request.data);
      }
    }
    if (request.type === "fund.__fundPollData" && request.data) {
      _lastPopupFundData = request.data;
      onFundData(request.data);
    }
  });

  // SW 重启后立即从持久存储恢复角标，不需要等 popup 打开。
  // 1. 从 chrome.storage.sync 恢复 badgeModel（optionsCompatibili2 对新格式用户不恢复 config，导致默认 "0" 即关闭角标）
  // 2. 从 chrome.storage.local 恢复上次缓存的股票收益数据并重算角标
  chrome.storage.sync.get(['badgeModel'], syncRes => {
    if (syncRes.badgeModel !== undefined) {
      try {
        const cfg = JSON.parse(localStorage.getItem('config') || '{}');
        cfg.badgeModel = syncRes.badgeModel;
        localStorage.setItem('config', JSON.stringify(cfg));
      } catch(e) {}
    }
    chrome.storage.local.get(['stockPollData_bg_cache', 'stockGroup_cache', 'fundPollData_bg_cache', 'fundGroup_cache'], res => {
      // 恢复股票
      if (res.stockGroup_cache) {
        localStorage.setItem('stockGroup', res.stockGroup_cache);
      }
      if (res.stockPollData_bg_cache) {
        try {
          const cached = JSON.parse(res.stockPollData_bg_cache);
          if (Array.isArray(cached) && cached.some(item => item.price)) {
            _lastPopupStockData = cached;
            onStockData(cached);
          }
        } catch(e) {}
      }
      // 恢复基金
      if (res.fundGroup_cache) {
        localStorage.setItem('fundGroup', res.fundGroup_cache);
      }
      if (res.fundPollData_bg_cache) {
        try {
          const cached = JSON.parse(res.fundPollData_bg_cache);
          if (Array.isArray(cached) && cached.length > 0) {
            _lastPopupFundData = cached;
            onFundData(cached);
          }
        } catch(e) {}
      }
    });
  });

  // 上传收益率，排名
  window.timedTask.add({
    interval: 60,
    task: () => {
      uploadYield(config, totalZsyl);
    }
  });
});
// CONCATENATED MODULE: ./background/notice.js
/**
 * 创建通知
 * @param {*} param
 */
const creatyNotify = _ref => {
  let {
    id,
    title,
    message
  } = _ref;
  chrome.notifications.create(id, {
    type: "basic",
    // list
    title,
    message,
    // buttons: [{title:'停用当前股票该通知'}],
    iconUrl: "./icons/logo-128.png"
  });

  // chrome.notifications.onButtonClicked.addListener(function (id, index) {
  //   console.log(id, index);
  // });
};
// EXTERNAL MODULE: ./utils/Indexdb.js
var Indexdb = __webpack_require__(32);

// CONCATENATED MODULE: ./background/stockNotice.js





/**
 * 股票提醒通知模块
 */
/* harmony default export */ var stockNotice = (() => {
  /**
   * 发送通知
   * @param {*} params 
   */
  function onCreatyNotify(title, message, marketCode) {
    // 交易时间再通知
    if (util["a" /* default */].isDuringDate()) {
      creatyNotify({
        title,
        message,
        id: (new Date().getTime() / 1000 / 60).toFixed(0) + marketCode
      });
    }
  }

  /**
   * 找出通知
   * @param {*} params 
   */
  async function handleNoticeData(params) {
    const data = await window.stock.getNotice();
    const noticeMap = {};
    const noticeStockMarketCodes = [...new Set(data.marketCodes)];
    noticeStockMarketCodes.forEach(marketCode => {
      noticeMap[marketCode] = data.data.filter(item => item.marketCode === marketCode);
    });
    const array = Object.keys(noticeMap);
    for (let index = 0; index < array.length; index++) {
      const marketCode = array[index];
      const notifys = noticeMap[marketCode];
      // 为了减少误差求连续两次的平均值
      Indexdb["a" /* InitdIndexedDB */].selectData('stockInfo', 'marketCode', marketCode, [1, 2]).then(stockInfos => {
        let stockReduce = {
          price: 0,
          zdf: 0,
          zdf_price: 0
        };
        stockInfos.forEach(item => {
          stockReduce.price += item.price;
          stockReduce.zdf += item.zdf;
          stockReduce.zdf_price += item.zdf_price;
        });
        stockReduce = {
          price: stockReduce.price / stockInfos.length,
          zdf: stockReduce.zdf / stockInfos.length,
          zdf_price: stockReduce.zdf_price / stockInfos.length
        };
        const {
          price,
          zdf,
          zdf_price
        } = stockReduce;
        notifys.forEach(notify => {
          const {
            type,
            value,
            describe,
            name
          } = notify;
          let message = '';
          switch (type) {
            // 股价涨到多少钱
            case '1':
              if (price >= value) {
                message = describe;
              }
              break;
            case '2':
              // 股价跌到多少钱
              if (price <= value) {
                message = describe;
              }
              break;
            case '3':
              // 股价涨幅到
              if (zdf >= value) {
                message = describe;
              }
              break;
            case '4':
              // 股价跌幅到
              if (zdf <= -value) {
                message = describe;
              }
              break;
            case '5':
              break;
            case '6':
              break;
            default:
              break;
          }
          if (message) {
            onCreatyNotify(`${name} (${price.toFixed(2)}) (${zdf.toFixed(2)}%)`, message, marketCode);
          }
        });
      });
    }
  }

  // // 监听股票变化 包括 指数
  window.stock.on("pollUpdate", () => {
    setTimeout(async () => {
      await handleNoticeData();
    }, 10);
  });

  // 判断是否开启了14：40提醒
  function getConfig() {
    return JSON.parse(localStorage.getItem('config') || '{}');
  }

  // 如果14:40提醒开启，则放入定时任务中
  window.timedTask.add({
    cron: '14-40',
    task: () => {
      if (util["a" /* default */].isDuringDate() && getConfig().replenishmentNotice === true) {
        /* Cannot get final name for export "creatNotifiy" in "./background/notice.js" (known exports: creatyNotify, known reexports: ) */ undefined({
          id: `${util["a" /* default */].getTime('day')}-replenishmentNotice`,
          title: '时间提醒',
          message: '14:40'
        });
      }
    }
  });
});
// CONCATENATED MODULE: ./background/timedTask.js

class timedTask_timedTask {
  constructor() {
    this.events = [];
  }

  /**
   * 新增定时任务
   * { interval: 2, cron: '14:40', task: () => {} }
   */
  add() {
    let item = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    const {
      interval,
      cron,
      task
    } = item;
    if (!interval && !cron) {
      console.error('"interval" or "cron" cannot be empty');
      return;
    }
    if (!task) {
      console.error('task cannot be empty');
      return;
    }
    item.lastEndTime = parseInt(new Date().getTime() / 60000);
    this.events.push(item);
  }

  /**
   * 执行定时任务
   */
  run() {
    let time = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1000 * 60;
    setInterval(() => {
      const now = parseInt(new Date().getTime() / 60000);
      this.events.forEach((item, index) => {
        const {
          lastEndTime,
          interval,
          cron,
          task
        } = item;
        if (!task) return;
        try {
          // 判断执行间隔是否满足 任务设定的时间
          if (interval && now - lastEndTime >= interval) {
            setTimeout(() => {
              item.task();
              this.update(index, item);
            }, 0);
          } else if (cron && cron === util["a" /* default */].getTime('time')) {
            setTimeout(() => {
              item.task();
            }, 0);
          }
        } catch (error) {}
      });
    }, time);
  }

  /**
   * 修改定时任务
   */
  update(index, item) {
    // 修改上一次执行结束时间
    item.lastEndTime = parseInt(new Date().getTime() / 60000);
    this.events[index] = item;
  }
}
// CONCATENATED MODULE: ./background/webRequest.js
/* harmony default export */ var webRequest = (() => {
  // chrome.webRequest.onBeforeSendHeaders.addListener(
  //   function(details) {
  //     details.requestHeaders.push({ name: 'Referer', value: 'https://wap.eastmoney.com/' });
  //     details.requestHeaders.push({ name: 'Host', value: 'searchapi.eastmoney.com' });
  //     console.log(details.requestHeaders);
  //     return { requestHeaders: details.requestHeaders };
  //   },
  //   {urls: ["https://searchapi.eastmoney.com/*"]}, ["requestHeaders", "blocking", "extraHeaders"]);

  // MV3: 用 declarativeNetRequest 替代 blocking webRequest 修改请求头
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'User-Agent', operation: 'set', value: 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Mobile Safari/537.36' },
          { header: 'Referer', operation: 'set', value: 'https://m.1234567.com.cn/' }
        ]
      },
      condition: {
        urlFilter: '||fundmobapi.eastmoney.com/*',
        resourceTypes: ['xmlhttprequest']
      }
    }]
  });
});
// CONCATENATED MODULE: ./background/initDB.js


/**
 * 初始化数据库
 * @param {*} param
 */
/* harmony default export */ var initDB = (async function () {
  await Indexdb["a" /* InitdIndexedDB */].initDb();

  // 初始化通知表 用于存放通知内容
  const objectStoreNotify = Indexdb["a" /* InitdIndexedDB */].creatTable('notify', {
    keyPath: 'id'
  });
  if (objectStoreNotify) {
    objectStoreNotify.createIndex('name', 'name', {
      unique: false
    });
    objectStoreNotify.createIndex('marketCode', 'marketCode', {
      unique: false
    });
    objectStoreNotify.createIndex('creatTime', 'creatTime', {
      unique: false
    });
    objectStoreNotify.createIndex('lastUpdateTime', 'lastUpdateTime', {
      unique: false
    });
    objectStoreNotify.createIndex('lastExecutionTime', 'lastExecutionTime', {
      unique: false
    });
    objectStoreNotify.createIndex('describe', 'describe', {
      unique: false
    });
    objectStoreNotify.createIndex('value', 'value', {
      unique: false
    });
    objectStoreNotify.createIndex('type', 'type', {
      unique: false
    });
    objectStoreNotify.createIndex('status', 'status', {
      unique: false
    });
    objectStoreNotify.createIndex('marketCode_type_status', ['marketCode', 'type', 'status'], {
      unique: false
    });
    objectStoreNotify.createIndex('marketCode_type', ['marketCode', 'type'], {
      unique: false
    });
    objectStoreNotify.createIndex('type_status', ['type', 'status'], {
      unique: false
    });
  }

  // 初始化股票表格，用于存放股票轮询数据
  const objectStoreStockInfo = Indexdb["a" /* InitdIndexedDB */].creatTable('stockInfo', {
    autoIncrement: true
  });
  if (objectStoreStockInfo) {
    objectStoreStockInfo.createIndex('name', 'name', {
      unique: false
    });
    objectStoreStockInfo.createIndex('marketCode', 'marketCode', {
      unique: false
    });
    objectStoreStockInfo.createIndex('creatTime', 'creatTime', {
      unique: false
    });
    objectStoreStockInfo.createIndex('zdf', 'zdf', {
      unique: false
    });
    objectStoreStockInfo.createIndex('zdf_price', 'zdf_price', {
      unique: false
    });
    objectStoreStockInfo.createIndex('price', 'price', {
      unique: false
    });
  } else {
    Indexdb["a" /* InitdIndexedDB */].cleaerObjectstore('stockInfo');
  }
});
// CONCATENATED MODULE: ./background/index.js











// CONCATENATED MODULE: ./background.js





// 修改协议请求头
webRequest();

// 初始化数据库
initDB();
const background_config = {
  uninstall_url: '',
  device_id: '',
  host:  true ? 'https://topnamei.top/api' : undefined
};

// 启动定时任务
const timedTask_ = new timedTask_timedTask();
timedTask_.run();
window.timedTask = timedTask_;

// 一分钟清除一下日志，防止日志过多造成卡顿
window.timedTask.add({
  interval: 2,
  task: () => console.clear()
});

// 以独立窗口模式打开
createWindow();

// 获取汇率
background_getRate();

/**
 * 初始化项目
 */
function initConfig() {
  // 把chrome.sync.storage 的数据放到 localhsot中
  util["a" /* default */].optionsCompatibili2().then(res => {
    // 判断是否本地存储中是否有config，如果没有则说明用户从来没有配置过配置，则可以用默认的配置进行覆盖
    if (!localStorage.config || localStorage.config && Object.keys(JSON.parse(localStorage.config)).length === 0) {
      localStorage.setItem('config', JSON.stringify(util["a" /* default */].defaultConfig()));
    }

    // 股票开启轮询
    const stock = new stockYield["a" /* default */].StockData();
    window.stock = stock;
    stock.startPollRquest(15 * 1000);

    // 基金开启轮询
    const fund = new fundData["a" /* default */]();
    window.fund = fund;
    fund.startPollRquest(15 * 1000);
    chrome.runtime.onConnect.addListener(function (externalPort) {
      externalPort.onDisconnect.addListener(function () {
        console.log("关闭popup");
      });
      console.log("开启popup");
    });

    // 支持大图中的股票和指数行情
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (message.type === "stock_index") {
        sendResponse({
          indexStock: stock.getIndexPollCacheData(),
          stock: stock.getOwnPollCacheData()
        });
      }
    });

    // 设置角标
    badge(background_config);

    // 通知处理
    stockNotice();
  });
}
initConfig();
chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === "refresh_background") {
    initConfig();
  }
});

/**
 * 向页面中插入js脚本
 */
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.cmd === 'storage') {
    sendResponse(window.localStorage);
  }
});

// 卸载检测
background_alive(background_config);

// 监听localStorage变化

window.addEventListener("storage", function (e) {
  // console.log('key', e.key)
  // console.log('e.newValue', JSON.parse(e.newValue))
  // console.log('e.newValue', JSON.parse(e.oldValue))
});

// timedTask_.add({ 
//   cron: '19-59',
//   task: () => { console.log('cron === 17-59') }
//  });


},75:function(module,__webpack_exports__,__webpack_require__){"use strict";
/* harmony import */ var axios__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(29);
/* harmony import */ var axios__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(axios__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _popup_util__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(12);
/* harmony import */ var _utils_Indexdb__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(32);
// 票收益持仓等计算类



// import Indexdb from "@/utils/Indexdb";

const EVENT_QUEUE = Symbol('EVENT#QUEUE');
const defaultIndexItemList = [{
  market: '1',
  code: '000001',
  name: '上证指数'
}, {
  market: '1',
  code: '000300',
  name: '沪深300'
}, {
  market: '0',
  code: '399001',
  name: '深证指数'
}, {
  market: '0',
  code: '399006',
  name: '创业板指数'
}, {
  market: '1',
  code: '000933',
  name: '中证医药'
}, {
  market: '0',
  code: '399986',
  name: '中证银行'
}, {
  market: '0',
  code: '399997',
  name: '中证白酒'
}, {
  market: '1',
  code: '000820',
  name: '煤炭指数'
}, {
  market: '0',
  code: '399975',
  name: '证券公司'
}];
class StockYield {
  static init() {
    let argus = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return new StockYield(argus);
  }

  /**
   * 计算总收益
   * @param {*} stockItemList 
   */
  getAllGains(stockItemList) {
    // 今日总收益金额
    let todayAllGains = 0; // 今日总收益率

    let todayAllYield = 0; // 总收益

    let allGains = 0; // 持仓

    let allPosition = 0; // 总收益率

    let allYield = 0;
    stockItemList.forEach(val => {
      const todayAllGains_ = parseFloat(this.calculateTotalProfit(val, "all"));
      if (!isNaN(todayAllGains_)) {
        todayAllGains += todayAllGains_;
      }
      const allGains_ = parseFloat(this.calculateAllAmount(val, "all"));
      if (!isNaN(allGains_)) {
        allGains += allGains_;
      }
      const allPosition_ = parseFloat(this.calculateAmount(val, "all"));
      if (!isNaN(allPosition_)) {
        allPosition += allPosition_;
      }
    });
    todayAllGains = todayAllGains.toFixed(2);
    allGains = allGains.toFixed(2);
    if (+allPosition !== 0) {
      // 今日总收益率 = 今日收益金额 / （ 持仓金额 - 今日收益金额 ）
      todayAllYield = (todayAllGains / (allPosition - todayAllGains) * 100).toFixed(2); // 总收益率 = 总收益金额 / （ 持仓金额 - 总收益金额 ）

      allYield = (allGains / (allPosition - allGains) * 100).toFixed(2);
    }
    return {
      todayAllGains,
      allGains,
      allPosition: allPosition.toFixed(2),
      todayAllYield,
      allYield
    };
  }

  /**
   * 当天收益金额
   * @param {*} item
   * @param {*} type 类型 all 计算所有股票的总收益
   */
  calculateTotalProfit(item, type) {
    let {
      num,
      price,
      zdf,
      isTodybuy,
      initPrice
    } = item;
    num = +num;
    initPrice = +initPrice;
    if (isTodybuy === _popup_util__WEBPACK_IMPORTED_MODULE_1__[/* default */ "a"].getTime() && !isNaN(num) && !isNaN(initPrice) && num !== 0 && initPrice !== 0) {
      let much = (item.price - initPrice) * num;
      if (type === "all") {
        much = much * _popup_util__WEBPACK_IMPORTED_MODULE_1__[/* default */ "a"].calcRate(item.StockType);
      }
      much = much.toFixed(2);
      return much;
    } else {
      if (!isNaN(num) && num !== 0) {
        let much = item.zdf_price * num;
        if (type === "all") {
          much = much * _popup_util__WEBPACK_IMPORTED_MODULE_1__[/* default */ "a"].calcRate(item.StockType);
        }
        much = much.toFixed(2);
        return much;
      }
      if (type === "all") {
        return 0;
      }
      return "";
    }
  }

  /**
   * 计算当前股票持仓金额
   * @param {*} val 
   */
  calculateMoney() {
    let item = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    const {
      f2,
      f3,
      f4,
      f18
    } = item;
    // 判断是否停牌
    if (f2 === 0 && f3 === 0 && f4 === 0) {
      item.f2 = f18;
    }
    if (item.num) {
      return item.num * item.price;
    }
    return 0;
  }

  /**
   * 总收益 当前持仓金额 - 成本价持仓金额
   * @param {*} item 
   */
  calculateAllAmount(item, type) {
    let {
      num,
      price,
      initPrice
    } = item;
    initPrice = +initPrice;
    num = +num;
    if (typeof initPrice === "number" && typeof num === "number" && !isNaN(initPrice) && !isNaN(num) && num !== 0 && initPrice !== 0) {
      let much = num * (price - initPrice);
      if (type === "all") {
        much = much * _popup_util__WEBPACK_IMPORTED_MODULE_1__[/* default */ "a"].calcRate(item.StockType);
      }
      return much.toFixed(2);
    }
    return "";
  }

  /**
   * 持仓金额
   * @param {*} item 
   */
  calculateAmount(item, type) {
    let {
      num,
      price = 0
    } = item;
    num = +num;
    if (typeof num === "number" && !isNaN(num) && num !== 0) {
      let much = num * price;
      if (type === "all") {
        much = much * _popup_util__WEBPACK_IMPORTED_MODULE_1__[/* default */ "a"].calcRate(item.StockType);
      }
      return much.toFixed(2);
    }
    return "";
  }

  /**
   * 个股 总收益率 （当前持仓金额 - 成本价持仓金额） /  成本价持仓金额
   * @param {*} item 
   */
  calculateAllzdf(item) {
    let {
      price,
      initPrice
    } = item;
    initPrice = +initPrice;
    if (typeof initPrice === "number" && !isNaN(initPrice) && initPrice > 0) {
      return ((price - initPrice) / initPrice * 100).toFixed(2);
    }
    return "";
  }
}
class StockData {
  static init(argus) {
    return new StockData(argus);
  }
  constructor() {
    let argus = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    this.timer = null;
    this.timer1 = null;
    this.stockYield = StockYield.init();

    // 当前所处分组的索引
    // this.groupIndex = (() => {
    //   const groupDatas = this.getOwnGroupDatas();
    //   const stockCurGroupIndex = +window.localStorage.getItem('stockCurGroupIndex');
    //   // 判断分组索引指针是否大于分组长度
    //   if (stockCurGroupIndex > groupDatas.length) {
    //     window.localStorage.setItem('stockCurGroupIndex', 0);
    //   }
    //   return stockCurGroupIndex > groupDatas.length ? 0 : stockCurGroupIndex;
    // })();

    // 事件队列
    this[EVENT_QUEUE] = new Map([['pollUpdate', []], ['ownUpdate', []],
    // 自选数据变化
    ['ownPollUpdate', []],
    // 自选数据轮询数据变化
    ['ownPollUpdate_bg', []],
    // 自选数据轮询数据变化 - 用于监听后台脚本background.js数据变化
    ['onChangeGroup', []],
    // 自选分组发生变化
    ['add', []], ['del', []], ['find', []]]);
    this.stockPollData = {
      time: new Date().getTime(),
      data: []
    };
    const that = this;
    // 股票数据代理
    this.ProxyStockPollData = new Proxy(this.stockPollData, {
      set(target, prop, value) {
        target[prop] = value;
        target.time = new Date().getTime();
        const str = JSON.stringify(target);
        localStorage.setItem('stockPollData', str);

        // 自选股票
        that.updateOwnPollCacheData();

        // 实例在backgrouond中使用向popup通信使用chrome.runtime.sendMessage
        chrome.runtime.sendMessage({
          type: "__stockPollData",
          data: target
        });
        that.publish('pollUpdate', target);

        // 存储自选股票
        setTimeout(() => that.onSaveToDB(target.data), 1);
        return true;
      }
    });
  }
  get groupIndex() {
    const groupDatas = this.getOwnGroupDatas();
    const stockCurGroupIndex = +window.localStorage.getItem('stockCurGroupIndex');
    // 判断分组索引指针是否大于分组长度
    if (stockCurGroupIndex > groupDatas.length) {
      window.localStorage.setItem('stockCurGroupIndex', 0);
    }
    return stockCurGroupIndex > groupDatas.length ? 0 : stockCurGroupIndex;
  }
  set groupIndex(val) {
    window.localStorage.setItem('stockCurGroupIndex', val);
  }

  /**
   * 添加订阅事件
   * @returns 
   */
  on(eventName, callback) {
    if (eventName && callback) {
      const fns = this[EVENT_QUEUE].get(eventName) || [];
      fns.push(callback);
      this[EVENT_QUEUE].set(eventName, fns);
    }
  }

  /**
   * 把股票数据存到本地数据库中
   * @param {*} stockData 
   */
  onSaveToDB(stockData) {
    // 获取全部启用的通知
    stockData.forEach(item => {
      const creatTime = new Date().getTime();
      // 判断是否为停盘股票，如果是停盘则把昨收盘价展示出来
      const {
        f2,
        f3,
        f4,
        f13,
        f18,
        f14,
        f12
      } = item;
      if (f2 === 0 && f3 === 0 && f4 === 0) {
        item.f2 = f18;
      }
      const marketCode = `${f13}.${f12}`;

      // 防止数据过多每只股票留30支记录
      _utils_Indexdb__WEBPACK_IMPORTED_MODULE_2__[/* InitdIndexedDB */ "a"].selectData('stockInfo', 'marketCode', marketCode).then(res => {
        if (res.length > 30) {
          const delData = res.splice(0, res.length - 30);
          const delDataKeys = delData.map(item => item.primaryKey);
          delDataKeys.forEach(delDataKey => {
            _utils_Indexdb__WEBPACK_IMPORTED_MODULE_2__[/* InitdIndexedDB */ "a"].delete('stockInfo', delDataKey);
          });
        }
      });
      _utils_Indexdb__WEBPACK_IMPORTED_MODULE_2__[/* InitdIndexedDB */ "a"].add('stockInfo', {
        // id: util.guid(),
        creatTime,
        name: f14,
        marketCode,
        zdf: f3,
        zdf_price: f4,
        price: f2,
        originalData: item
      }, 'random');
    });
  }

  /**
   * 发布订阅事件
   * @param {*} eventName 
   * @param {*} data 
   */
  publish(eventName, data) {
    const fns = this[EVENT_QUEUE].get(eventName) || [];
    fns.forEach(fn => {
      try {
        fn(data);
      } catch (error) {
        // console.log(error);
      }
    });
  }

  /**
   * 清空订阅事件
   * @param {*} eventName 
   * @param {*} data 
   */
  clear(eventName, data) {
    // this[EVENT_QUEUE].set('pollUpdate', []);
    // this[EVENT_QUEUE].set('ownPollUpdate', []);
  }

  /**
   * 获取当前分组自选数据
   */
  getOwnDatas() {
    let stockItemList = JSON.parse(localStorage.getItem('stockGroup') || '[]');
    return (stockItemList[this.groupIndex] || {
      name: '默认分组',
      data: []
    }).data;
  }

  /**
   * 获取分组数据
   */
  getOwnGroupDatas() {
    let stockGroup = JSON.parse(localStorage.getItem('stockGroup') || '[]');
    if (stockGroup.length === 0) {
      stockGroup = [{
        data: [],
        name: '默认分组'
      }];
      this.onEditGroup(stockGroup);
    }
    return stockGroup;
  }

  /**
   * 选择分组
   * @param {*} values 
   * @returns 
   */
  onCheckGroup(index) {
    this.groupIndex = index;
    this.fetchStockData();
  }

  /**
   * 编辑分组（新增 修改）
   * @param {*} values 
   * @returns 
   */
  onEditGroup(newGroup) {
    if (newGroup.length <= 15) {
      localStorage.setItem("stockGroup", JSON.stringify(newGroup));
      return 1;
    }
    return '不能超过15个分组';
  }

  /**
   * 设置自选数据
   */
  setOwnDatas(values) {
    const group = JSON.parse(localStorage.getItem('stockGroup') || '[]');
    if (!group[this.groupIndex]) {
      group[this.groupIndex] = {
        data: []
      };
    }
    group[this.groupIndex].data = values;
    localStorage.setItem('stockGroup', JSON.stringify(group));

    // 更新本地缓存的轮询股票数据
    this.updateOwnPollCacheData();
    return group[this.groupIndex].data;
  }

  /**
   * 获取自选行情数据
   * 从轮询数据中筛选自选的数据
   * @returns 
   */
  getOwnPollCacheData() {
    // 获取全部的轮询缓存数据
    const datas = this.getAllPollCacheData();
    // 从全部轮询缓存中获取 获取自选的数据
    const ownData = this.getOwnDatas();
    return this.onCodesFilterPollData(ownData, datas);
  }

  /**
   * 获取指数行情数据
   */
  getIndexPollCacheData() {
    const datas = this.getAllPollCacheData();
    const stockIndexs = this.getIndexItemList();
    return this.onCodesFilterPollData(stockIndexs, datas);
  }

  /**
   * 获取指数列表
   */
  getIndexItemList() {
    let indexItemList = localStorage.getItem("indexItemList");
    try {
      const indexItemList_ = JSON.parse(indexItemList);
      if (!Array.isArray(indexItemList_)) {
        localStorage.setItem("indexItemList", JSON.stringify(defaultIndexItemList));
        return defaultIndexItemList;
      }
      if (indexItemList_.length < 7) {
        return defaultIndexItemList;
      }
      return JSON.parse(indexItemList);
    } catch (error) {
      localStorage.setItem("indexItemList", JSON.stringify(defaultIndexItemList));
      return defaultIndexItemList;
    }
  }

  /**
   * 请求自选指数数据
   */
  fetchIndexItemList() {
    const stockIndex = this.getIndexItemList();
    const SCodes = [...stockItemList, ...stockIndex].map(item => `${item.market}.${item.code}`);
    return this.getStockInfo(SCodes);
  }

  /**
   * 根据本地缓存的轮询股票数据来更新
   * 更新持仓等信息时，不需要重新请求，直接用本地数据计算，等待下次从远程获取的数据到来时一起更新
   * @returns 
   */
  updateOwnPollCacheData() {
    const data = this.getOwnPollCacheData();
    this.publish('ownPollUpdate', data);
    this.publish('ownPollUpdate_bg', data);
    // 实例在backgrouond中使用向popup通信使用chrome.runtime.sendMessage
    chrome.runtime.sendMessage({
      type: "stock__ownPollUpdate",
      data
    });
  }

  /**
   * 获取全部轮序的缓存数据（包含非当前显示的自选）
   */
  getAllPollCacheData() {
    return (JSON.parse(localStorage.getItem("stockPollData")) || {
      data: []
    }).data;
  }

  /**
   * 获取需要提醒的股票
   * @returns 
   */
  async getNotice() {
    try {
      const data = await _utils_Indexdb__WEBPACK_IMPORTED_MODULE_2__[/* InitdIndexedDB */ "a"].selectData('notify', 'status', 1);
      return {
        marketCodes: data.map(item => item.marketCode),
        data
      };
    } catch (error) {
      return {
        marketCodes: [],
        data: []
      };
    }
  }

  /**
   *  请求获取股票数据
   * @returns 
   */
  async fetchStockData() {
    try {
      // SW 重启后内存 shim 里 stockGroup 为空，先尝试从 chrome.storage.local 恢复
      if (this.getOwnDatas().length === 0) {
        await new Promise(resolve => {
          chrome.storage.local.get('stockGroup_cache', res => {
            if (res.stockGroup_cache) {
              localStorage.setItem('stockGroup', res.stockGroup_cache);
            }
            resolve();
          });
        });
      }
      // 获取自选
      const stockItemList = this.getOwnDatas();
      // 获取指数
      const stockIndex = this.getIndexItemList();
      // 需要通知的股票
      const stockNotice = (await this.getNotice()).marketCodes;
      const SCodes = [...stockItemList, ...stockIndex].map(item => `${item.market}.${item.code}`);
      const result = this.getStockInfo([...new Set([...SCodes, ...stockNotice])].join(',')).then(res => {
        if (res.data.data && res.data.data.diff && res.data.data.diff.length > 0) {
          // 自选列表为空时跳过写入：stockGroup_cache 也不存在（如全新安装），
          // 此时 diff 只包含指数数据，写入会触发 updateOwnPollCacheData 推送空的自选数据导致角标归零
          if (stockItemList.length > 0) {
            this.ProxyStockPollData.data = res.data.data.diff;
          }
        }
      });
      return result;
    } catch (error) {
      return new Promise((res, rej) => rej(error));
    }
  }

  /**
   * 获取股票数据
   * @param {*} stocks 
   * @returns 
   */
  getStockInfo(stocks) {
    // 协议出自  https://i.eastmoney.com/
    return new Promise((resolve, reject) => {
      if (stocks) {
        const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f13,f19,f14,f139,f148,f2,f4,f1,f125,f18,f3,f152,f5,f30,f31,f32,f6,f8,f7,f10,f22,f9,f112,f100,f88,f153&secids=${stocks}`;
        // 预处理
        axios__WEBPACK_IMPORTED_MODULE_0___default.a.get(url).then(res => {
          if (res.status === 200) {
            resolve(res);
          }
        }).catch(err => {
          reject(err);
        });
      } else {
        resolve({
          data: {
            data: {
              diff: []
            }
          }
        });
      }
    });
  }

  /**
   * 字段处理
   * @param {*} datas 
   */
  onFiledMap(item, ownData) {
    // 判断是否为停盘股票，如果是停盘则把昨收盘价展示出来
    const {
      f2,
      f3,
      f4,
      f13,
      f18,
      f8,
      f14,
      f12
    } = item;
    if (f2 === 0 && f3 === 0 && f4 === 0) {
      item.f2 = f18;
    }
    const {
      StockType,
      initPrice,
      num,
      isTodybuy
    } = ownData;
    item.price = f2;
    item.zdf = f3;
    item.zdf_price = f4;
    item.hsl = f8;
    item.name = f14;
    item.code = f12;
    item.market = f13;
    item.StockType = StockType;
    item.initPrice = initPrice;
    item.num = num;
    item.isTodybuy = isTodybuy;
    item.zsyl = this.stockYield.calculateAllzdf(item);
    item.zsy = this.stockYield.calculateAllAmount(item);
    item.dtsy = this.stockYield.calculateTotalProfit(item);
    item.ccje = this.stockYield.calculateAmount(item);
    return item;
  }

  /**
   * 根据股票的code顺序来进行对轮询回来的股票数据进行筛选、排序、处理
   * @param {*} codes 根据codes进行排序
   * @param {*} datas 当前本地所有的缓存
   * @returns 
   */
  onCodesFilterPollData(ownData) {
    let datas = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
    // 先拿出code, 减少后面循环次数
    const codes = ownData.map(item => `${item.market}.${item.code}`);
    datas.forEach(item => {
      const hasIndex = codes.indexOf(`${item.f13}.${item.f12}`);
      if (hasIndex > -1) {
        ownData[hasIndex] = this.onFiledMap(item, ownData[hasIndex]);
      }
    });
    // 增加健壮性，当对应的code没有在数据中获取到时，则过滤掉以免页面报错
    ownData = ownData.filter(item => typeof item === 'object');
    return ownData;
  }

  /**
   * 开始轮询
   */
  startPoll() {
    let timeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 15 * 1000;
    if (this.timer1) {
      clearTimeout(this.timer1);
    }
    // 开启轮询
    const pollStock = () => {
      this.timer1 = setTimeout(() => {
        pollStock();
        const _sd = (JSON.parse(window.localStorage.getItem('stockPollData')) || {}).data;
        if (Array.isArray(_sd) && _sd.length > 0) this.ProxyStockPollData.data = _sd;
      }, 5 * 1000);
    };
    pollStock();
    this.fetchStockData();
  }

  /**
   * 开始轮询请求股票数据，然后把股票数据存放到本地
   */
  startPollRquest() {
    let timeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 15 * 1000;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    // 开启轮询
    const pollStock = () => {
      const stockResult = this.fetchStockData();
      stockResult.finally(() => {
        this.timer = setTimeout(() => {
          pollStock();
          // 休盘后 轮询改为 60秒一次
        }, _popup_util__WEBPACK_IMPORTED_MODULE_1__[/* default */ "a"].isDuringDate() ? timeout : 60 * 1000);
      });
    };
    pollStock();
    this.fetchStockData();
  }

  /**
   * 添加自选股票
   */
  add(value) {
    const data = this.getOwnDatas();
    if (data.length >= 50) {
      return '每个分组自选不能超过50支产品';
    }
    if (data.findIndex(item => item.code === value.code) === -1) {
      data.push(value);
      this.setOwnDatas(data);
      // 获取最新的数据
      this.fetchStockData();
      return 1;
    }
    return '该股票已添加！';
  }

  /**
   * 删除自选
   * @param {*} code 
   * @param {*} callback 为了快速响应交互，删除操作后会在该回调函数返回最新数据 
   */
  del(code) {
    let callback = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : () => {};
    const data = this.getOwnDatas();
    const targetIndex = this.find(code).index;
    if (targetIndex > -1) {
      data.splice(targetIndex, 1);
      callback(data);
      this.setOwnDatas(data);
      return 1;
    }
    return -1;
  }

  /**
   * 修改某一支股票，比如 持仓价格 持仓数量
   */
  update(code, newData) {
    const data = this.getOwnDatas();
    const targetIndex = this.find(code).index;
    if (targetIndex > -1) {
      data[targetIndex] = {
        ...data[targetIndex],
        ...newData
      };
      return this.setOwnDatas(data);
    }
    return 0;
  }

  /**
   * 根据code查询股票
   * @param {*} code 
   * @returns 
   */
  find(code) {
    const data = this.getOwnDatas();
    const targetIndex = data.findIndex(item => item.code === code);
    return {
      data: data[targetIndex],
      index: targetIndex
    };
  }
}
/* harmony default export */ __webpack_exports__["a"] = ({
  StockYield,
  StockData
});


},84:function(module,exports,__webpack_require__){"use strict";


module.exports = function bind(fn, thisArg) {
  return function wrap() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return fn.apply(thisArg, args);
  };
};



},85:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);

function encode(val) {
  return encodeURIComponent(val).
    replace(/%40/gi, '@').
    replace(/%3A/gi, ':').
    replace(/%24/g, '$').
    replace(/%2C/gi, ',').
    replace(/%20/g, '+').
    replace(/%5B/gi, '[').
    replace(/%5D/gi, ']');
}

/**
 * Build a URL by appending params to the end
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @returns {string} The formatted url
 */
module.exports = function buildURL(url, params, paramsSerializer) {
  /*eslint no-param-reassign:0*/
  if (!params) {
    return url;
  }

  var serializedParams;
  if (paramsSerializer) {
    serializedParams = paramsSerializer(params);
  } else if (utils.isURLSearchParams(params)) {
    serializedParams = params.toString();
  } else {
    var parts = [];

    utils.forEach(params, function serialize(val, key) {
      if (val === null || typeof val === 'undefined') {
        return;
      }

      if (utils.isArray(val)) {
        key = key + '[]';
      } else {
        val = [val];
      }

      utils.forEach(val, function parseValue(v) {
        if (utils.isDate(v)) {
          v = v.toISOString();
        } else if (utils.isObject(v)) {
          v = JSON.stringify(v);
        }
        parts.push(encode(key) + '=' + encode(v));
      });
    });

    serializedParams = parts.join('&');
  }

  if (serializedParams) {
    var hashmarkIndex = url.indexOf('#');
    if (hashmarkIndex !== -1) {
      url = url.slice(0, hashmarkIndex);
    }

    url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
  }

  return url;
};



},86:function(module,exports,__webpack_require__){"use strict";


module.exports = function isCancel(value) {
  return !!(value && value.__CANCEL__);
};



},87:function(module,exports,__webpack_require__){"use strict";
/* WEBPACK VAR INJECTION */(function(process) {

var utils = __webpack_require__(13);
var normalizeHeaderName = __webpack_require__(151);

var DEFAULT_CONTENT_TYPE = {
  'Content-Type': 'application/x-www-form-urlencoded'
};

function setContentTypeIfUnset(headers, value) {
  if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
    headers['Content-Type'] = value;
  }
}

function getDefaultAdapter() {
  var adapter;
  if (typeof XMLHttpRequest !== 'undefined') {
    // For browsers use XHR adapter
    adapter = __webpack_require__(88);
  } else if (typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]') {
    // For node use HTTP adapter
    adapter = __webpack_require__(88);
  }
  return adapter;
}

var defaults = {
  adapter: getDefaultAdapter(),

  transformRequest: [function transformRequest(data, headers) {
    normalizeHeaderName(headers, 'Accept');
    normalizeHeaderName(headers, 'Content-Type');
    if (utils.isFormData(data) ||
      utils.isArrayBuffer(data) ||
      utils.isBuffer(data) ||
      utils.isStream(data) ||
      utils.isFile(data) ||
      utils.isBlob(data)
    ) {
      return data;
    }
    if (utils.isArrayBufferView(data)) {
      return data.buffer;
    }
    if (utils.isURLSearchParams(data)) {
      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
      return data.toString();
    }
    if (utils.isObject(data)) {
      setContentTypeIfUnset(headers, 'application/json;charset=utf-8');
      return JSON.stringify(data);
    }
    return data;
  }],

  transformResponse: [function transformResponse(data) {
    /*eslint no-param-reassign:0*/
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) { /* Ignore */ }
    }
    return data;
  }],

  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,

  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',

  maxContentLength: -1,

  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  }
};

defaults.headers = {
  common: {
    'Accept': 'application/json, text/plain, */*'
  }
};

utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
  defaults.headers[method] = {};
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
});

module.exports = defaults;

/* WEBPACK VAR INJECTION */}.call(this, __webpack_require__(97)))


},88:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);
var settle = __webpack_require__(152);
var buildURL = __webpack_require__(85);
var buildFullPath = __webpack_require__(154);
var parseHeaders = __webpack_require__(157);
var isURLSameOrigin = __webpack_require__(158);
var createError = __webpack_require__(89);

module.exports = function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    var requestData = config.data;
    var requestHeaders = config.headers;

    if (utils.isFormData(requestData)) {
      delete requestHeaders['Content-Type']; // Let the browser set it
    }

    var request = new XMLHttpRequest();

    // HTTP basic authentication
    if (config.auth) {
      var username = config.auth.username || '';
      var password = config.auth.password || '';
      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
    }

    var fullPath = buildFullPath(config.baseURL, config.url);
    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

    // Set the request timeout in MS
    request.timeout = config.timeout;

    // Listen for ready state
    request.onreadystatechange = function handleLoad() {
      if (!request || request.readyState !== 4) {
        return;
      }

      // The request errored out and we didn't get a response, this will be
      // handled by onerror instead
      // With one exception: request that using file: protocol, most browsers
      // will return status as 0 even though it's a successful request
      if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
        return;
      }

      // Prepare the response
      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
      var responseData = !config.responseType || config.responseType === 'text' ? request.responseText : request.response;
      var response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config: config,
        request: request
      };

      settle(resolve, reject, response);

      // Clean up request
      request = null;
    };

    // Handle browser request cancellation (as opposed to a manual cancellation)
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }

      reject(createError('Request aborted', config, 'ECONNABORTED', request));

      // Clean up request
      request = null;
    };

    // Handle low level network errors
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(createError('Network Error', config, null, request));

      // Clean up request
      request = null;
    };

    // Handle timeout
    request.ontimeout = function handleTimeout() {
      var timeoutErrorMessage = 'timeout of ' + config.timeout + 'ms exceeded';
      if (config.timeoutErrorMessage) {
        timeoutErrorMessage = config.timeoutErrorMessage;
      }
      reject(createError(timeoutErrorMessage, config, 'ECONNABORTED',
        request));

      // Clean up request
      request = null;
    };

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (utils.isStandardBrowserEnv()) {
      var cookies = __webpack_require__(159);

      // Add xsrf header
      var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ?
        cookies.read(config.xsrfCookieName) :
        undefined;

      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue;
      }
    }

    // Add headers to the request
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          // Remove Content-Type if data is undefined
          delete requestHeaders[key];
        } else {
          // Otherwise add header to the request
          request.setRequestHeader(key, val);
        }
      });
    }

    // Add withCredentials to request if needed
    if (!utils.isUndefined(config.withCredentials)) {
      request.withCredentials = !!config.withCredentials;
    }

    // Add responseType to request if needed
    if (config.responseType) {
      try {
        request.responseType = config.responseType;
      } catch (e) {
        // Expected DOMException thrown by browsers not compatible XMLHttpRequest Level 2.
        // But, this can be suppressed for 'json' type as it can be parsed by default 'transformResponse' function.
        if (config.responseType !== 'json') {
          throw e;
        }
      }
    }

    // Handle progress if needed
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', config.onDownloadProgress);
    }

    // Not all browsers support upload events
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', config.onUploadProgress);
    }

    if (config.cancelToken) {
      // Handle cancellation
      config.cancelToken.promise.then(function onCanceled(cancel) {
        if (!request) {
          return;
        }

        request.abort();
        reject(cancel);
        // Clean up request
        request = null;
      });
    }

    if (requestData === undefined) {
      requestData = null;
    }

    // Send the request
    request.send(requestData);
  });
};



},89:function(module,exports,__webpack_require__){"use strict";


var enhanceError = __webpack_require__(153);

/**
 * Create an Error with the specified message, config, error code, request and response.
 *
 * @param {string} message The error message.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The created error.
 */
module.exports = function createError(message, config, code, request, response) {
  var error = new Error(message);
  return enhanceError(error, config, code, request, response);
};



},90:function(module,exports,__webpack_require__){"use strict";


var utils = __webpack_require__(13);

/**
 * Config-specific merge-function which creates a new config-object
 * by merging two configuration objects together.
 *
 * @param {Object} config1
 * @param {Object} config2
 * @returns {Object} New object resulting from merging config2 to config1
 */
module.exports = function mergeConfig(config1, config2) {
  // eslint-disable-next-line no-param-reassign
  config2 = config2 || {};
  var config = {};

  var valueFromConfig2Keys = ['url', 'method', 'params', 'data'];
  var mergeDeepPropertiesKeys = ['headers', 'auth', 'proxy'];
  var defaultToConfig2Keys = [
    'baseURL', 'url', 'transformRequest', 'transformResponse', 'paramsSerializer',
    'timeout', 'withCredentials', 'adapter', 'responseType', 'xsrfCookieName',
    'xsrfHeaderName', 'onUploadProgress', 'onDownloadProgress',
    'maxContentLength', 'validateStatus', 'maxRedirects', 'httpAgent',
    'httpsAgent', 'cancelToken', 'socketPath'
  ];

  utils.forEach(valueFromConfig2Keys, function valueFromConfig2(prop) {
    if (typeof config2[prop] !== 'undefined') {
      config[prop] = config2[prop];
    }
  });

  utils.forEach(mergeDeepPropertiesKeys, function mergeDeepProperties(prop) {
    if (utils.isObject(config2[prop])) {
      config[prop] = utils.deepMerge(config1[prop], config2[prop]);
    } else if (typeof config2[prop] !== 'undefined') {
      config[prop] = config2[prop];
    } else if (utils.isObject(config1[prop])) {
      config[prop] = utils.deepMerge(config1[prop]);
    } else if (typeof config1[prop] !== 'undefined') {
      config[prop] = config1[prop];
    }
  });

  utils.forEach(defaultToConfig2Keys, function defaultToConfig2(prop) {
    if (typeof config2[prop] !== 'undefined') {
      config[prop] = config2[prop];
    } else if (typeof config1[prop] !== 'undefined') {
      config[prop] = config1[prop];
    }
  });

  var axiosKeys = valueFromConfig2Keys
    .concat(mergeDeepPropertiesKeys)
    .concat(defaultToConfig2Keys);

  var otherKeys = Object
    .keys(config2)
    .filter(function filterAxiosKeys(key) {
      return axiosKeys.indexOf(key) === -1;
    });

  utils.forEach(otherKeys, function otherKeysDefaultToConfig2(prop) {
    if (typeof config2[prop] !== 'undefined') {
      config[prop] = config2[prop];
    } else if (typeof config1[prop] !== 'undefined') {
      config[prop] = config1[prop];
    }
  });

  return config;
};



},91:function(module,exports,__webpack_require__){"use strict";


/**
 * A `Cancel` is an object that is thrown when an operation is canceled.
 *
 * @class
 * @param {string=} message The message.
 */
function Cancel(message) {
  this.message = message;
}

Cancel.prototype.toString = function toString() {
  return 'Cancel' + (this.message ? ': ' + this.message : '');
};

Cancel.prototype.__CANCEL__ = true;

module.exports = Cancel;



},92:function(module,__webpack_exports__,__webpack_require__){"use strict";
// 票收益持仓等计算类

class Fund {
  static init() {
    let argus = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return new Fund(argus);
  }

  /**
   * 计算总收益
   * @param {*} dataList 
   */
  getAllGains(dataList) {
    // 今日总收益金额
    let todayAllGains = 0; // 总收益
    let allGains = 0; // 持仓
    let allPosition = 0;
    let todayAllYield = 0;
    let allYield = 0;
    dataList.forEach(val => {
      const todayAllGains_ = parseFloat(this.calcOneFundSy(val, "all"));
      if (!isNaN(todayAllGains_)) {
        todayAllGains += todayAllGains_;
      }
      const allGains_ = parseFloat(this.totalYieldMoney(val, "all"));
      if (!isNaN(allGains_)) {
        allGains += allGains_;
      }
      const allPosition_ = parseFloat(this.calculateMoney(val, "all"));
      if (!isNaN(todayAllGains_)) {
        allPosition += allPosition_;
      }
    });
    todayAllGains = todayAllGains.toFixed(2);
    allGains = allGains.toFixed(2);
    if (allPosition !== 0) {
      // 今日总收益率 = 今日收益金额 / （ 持仓金额 - 今日收益金额 ）
      todayAllYield = (todayAllGains / (allPosition - todayAllGains) * 100).toFixed(2);
      // 总收益率 = 总收益金额 / （ 持仓金额 - 总收益金额 ）
      allYield = (allGains / (allPosition - allGains) * 100).toFixed(2);
    }
    return {
      todayAllGains,
      allGains,
      allPosition: allPosition.toFixed(2),
      todayAllYield,
      allYield
    };
  }

  /**
  * 计算单个基金当日收益金额
  * @param {*} data 
  */
  calcOneFundSy() {
    let data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    let sum = 0;
    const num = data.num;
    if (!num) {
      return "";
    }
    if (data.isUpdate) {
      sum = ((data.dwjz - data.dwjz / (1 + data.gszzl * 0.01)) * num).toFixed(2);
    } else {
      if (data.gsz) {
        sum = ((data.gsz - data.dwjz) * num).toFixed(2);
      }
    }
    return +sum;
  }

  // /**
  //  * 计算单个基金当日收益金额
  //  * @param {*} data 
  //  */
  // totalYieldMoney(el) {
  //   let { num, total_yield, cost } = el;
  //   num = +num;
  //   cost = +cost;
  //   if (typeof num === "number" && typeof cost === "number") {
  //     return el.total_yield;
  //   }
  //   return "";
  // }

  /**
   * 计算当前基金持仓金额
   * @param {*} val 
   */
  calculateMoney() {
    let item = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    if (item.num) {
      let sum = (item.gsz * item.num).toFixed(2);
      return sum;
    }
    return "";
  }

  /**
   * 计算总收益金额
   * @param {*} item 
   */
  totalYieldMoney() {
    let item = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    const {
      num,
      cost,
      gsz
    } = item;
    if (num && gsz && num !== 0 && cost !== 0 && typeof +num === "number" && typeof +cost === "number") {
      const result = (num * (gsz - cost)).toFixed(2);
      if (!isNaN(result)) {
        return result;
      }
      return "";
    }
    return "";
  }

  /**
   * 计算单支基金总收益率
   * @param {*} item 
   */
  totalYield() {
    let item = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    const {
      cost,
      gsz
    } = item;
    if (!cost || !gsz) {
      return;
    }

    // 总收益率
    const total_yield = +((gsz - cost) / Math.abs(cost) * 100).toFixed(2);
    // 当没有输入持仓价格时会显示NaN
    if (!isNaN(total_yield)) {
      return total_yield;
    }
    return "";
  }
}
/* harmony default export */ __webpack_exports__["a"] = (Fund);


},97:function(module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };



}});