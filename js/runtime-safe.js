// SW 冷启动时 sendMessage/connect 会报 "Receiving end does not exist"，
// 在所有业务 JS 之前全局包装来静默该错误
(function(){
  // 包装 sendMessage：确保总有 callback 消费 lastError，同时捕获 Promise 拒绝
  var _s = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = function() {
    var args = [].slice.call(arguments);
    if (typeof args[args.length - 1] !== 'function') {
      args.push(function() { void chrome.runtime.lastError; });
    }
    try {
      var result = _s.apply(chrome.runtime, args);
      if (result && typeof result.catch === 'function') result.catch(function(){});
      return result;
    } catch(e) {}
  };

  // 包装 connect：捕获同步异常 + 在成功的 port 上拦截 disconnect 消费 lastError
  var _c = chrome.runtime.connect.bind(chrome.runtime);
  chrome.runtime.connect = function() {
    try {
      var port = _c.apply(chrome.runtime, arguments);
      // 注入一个最先触发的 onDisconnect 监听来消费 lastError
      try {
        port.onDisconnect.addListener(function() { void chrome.runtime.lastError; });
      } catch(e2) {}
      return port;
    } catch(e) {
      return {
        onDisconnect: { addListener: function(){} },
        onMessage: { addListener: function(){} },
        postMessage: function(){},
        disconnect: function(){}
      };
    }
  };
})();
