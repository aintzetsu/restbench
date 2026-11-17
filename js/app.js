/* ==========================================================================
   RestBench — Request Builder, Response Highlighter & Snippet Generator
   ========================================================================== */

(function (global) {
  "use strict";

  const STORAGE_THEME = "restbench_theme";
  const Mock = global.RestBenchMock;

  function safeGet(key, fallback) {
    try {
      const v = global.localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function safeSet(key, val) {
    try {
      global.localStorage.setItem(key, JSON.stringify(val));
    } catch (_err) {
      // Ignore storage error
    }
  }

  const state = {
    theme: safeGet(STORAGE_THEME, "dark"),
    activePresetId: Mock.PRESETS[0].id,
    method: Mock.PRESETS[0].method,
    url: Mock.PRESETS[0].url,
    headers: Mock.PRESETS[0].headers.map(function (h) { return Object.assign({}, h); }),
    body: Mock.PRESETS[0].body,
    reqTab: "body", // "body" | "headers"
    resTab: "pretty", // "pretty" | "headers" | "snippets"
    snippetLang: "curl", // "curl" | "fetch" | "python"
    lastResponse: null,
    history: []
  };

  const dom = {};

  function cacheDom() {
    dom.themeToggle = document.getElementById("theme-toggle");
    dom.presetList = document.getElementById("preset-list");
    dom.historyList = document.getElementById("history-list");

    dom.methodSelect = document.getElementById("method-select");
    dom.urlInput = document.getElementById("url-input");
    dom.sendBtn = document.getElementById("send-btn");

    dom.reqTabs = document.querySelectorAll("[data-req-tab]");
    dom.bodyPane = document.getElementById("req-body-pane");
    dom.headersPane = document.getElementById("req-headers-pane");
    dom.bodyEditor = document.getElementById("body-editor");
    dom.prettifyBtn = document.getElementById("prettify-btn");
    dom.jsonStatus = document.getElementById("json-status");
    dom.kvTable = document.getElementById("kv-table");
    dom.addHeaderBtn = document.getElementById("add-header-btn");

    dom.resTabs = document.querySelectorAll("[data-res-tab]");
    dom.resStatus = document.getElementById("res-status");
    dom.resTime = document.getElementById("res-time");
    dom.resSize = document.getElementById("res-size");
    dom.resOutput = document.getElementById("res-output");
    dom.snippetBar = document.getElementById("snippet-bar");
    dom.snippetBtns = document.querySelectorAll("[data-snippet]");
    dom.copyResBtn = document.getElementById("copy-res-btn");
  }

  function applyTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
    safeSet(STORAGE_THEME, state.theme);
    if (dom.themeToggle) {
      dom.themeToggle.textContent = state.theme === "dark" ? "Light Mode" : "Dark Mode";
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function highlightJson(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function (match) {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) return '<span class="j-k">' + match + "</span>";
          return '<span class="j-s">' + match + "</span>";
        }
        if (/true|false|null/.test(match)) return '<span class="j-b">' + match + "</span>";
        return '<span class="j-n">' + match + "</span>";
      }
    );
  }

  function renderPresets() {
    dom.presetList.innerHTML = "";
    Mock.PRESETS.forEach(function (preset) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset-btn" + (preset.id === state.activePresetId ? " is-active" : "");

      const m = document.createElement("span");
      m.className = "method-pill m-" + preset.method.toLowerCase();
      m.textContent = preset.method;

      const label = document.createElement("span");
      label.textContent = preset.name;
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.style.whiteSpace = "nowrap";

      btn.appendChild(m);
      btn.appendChild(label);
      btn.addEventListener("click", function () {
        loadRequest(preset);
        runRequest();
      });
      dom.presetList.appendChild(btn);
    });
  }

  function renderHistory() {
    dom.historyList.innerHTML = "";
    if (state.history.length === 0) {
      const p = document.createElement("span");
      p.style.fontSize = "0.78rem";
      p.style.color = "var(--ink-muted)";
      p.textContent = "Run a request to log history.";
      dom.historyList.appendChild(p);
      return;
    }

    state.history.slice(0, 6).forEach(function (entry) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset-btn";

      const m = document.createElement("span");
      m.className = "method-pill m-" + entry.method.toLowerCase();
      m.textContent = entry.method;

      const txt = document.createElement("span");
      txt.className = "mono";
      txt.style.fontSize = "0.74rem";
      txt.style.overflow = "hidden";
      txt.style.textOverflow = "ellipsis";
      txt.style.whiteSpace = "nowrap";
      txt.textContent = entry.status + " · " + entry.url.replace(/^mock:\/\/[^/]+|^https?:\/\/[^/]+/, "");

      btn.appendChild(m);
      btn.appendChild(txt);
      btn.addEventListener("click", function () {
        loadRequest(entry);
      });
      dom.historyList.appendChild(btn);
    });
  }

  function loadRequest(req) {
    state.activePresetId = req.id || null;
    state.method = req.method;
    state.url = req.url;
    state.headers = (req.headers || []).map(function (h) { return Object.assign({}, h); });
    state.body = req.body || "";

    dom.methodSelect.value = state.method;
    dom.urlInput.value = state.url;
    dom.bodyEditor.value = state.body;
    validateJsonBody();
    renderHeadersTable();
    renderPresets();
    if (state.resTab === "snippets") renderResponsePane();
  }

  function renderHeadersTable() {
    dom.kvTable.innerHTML = "";
    state.headers.forEach(function (row, idx) {
      const wrap = document.createElement("div");
      wrap.className = "kv-row";

      const kInput = document.createElement("input");
      kInput.type = "text";
      kInput.value = row.key;
      kInput.placeholder = "Header name";
      kInput.addEventListener("input", function () {
        state.headers[idx].key = kInput.value;
        if (state.resTab === "snippets") renderResponsePane();
      });

      const vInput = document.createElement("input");
      vInput.type = "text";
      vInput.value = row.value;
      vInput.placeholder = "Value";
      vInput.addEventListener("input", function () {
        state.headers[idx].value = vInput.value;
        if (state.resTab === "snippets") renderResponsePane();
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--ghost btn--sm";
      delBtn.textContent = "×";
      delBtn.addEventListener("click", function () {
        state.headers.splice(idx, 1);
        renderHeadersTable();
      });

      wrap.appendChild(kInput);
      wrap.appendChild(vInput);
      wrap.appendChild(delBtn);
      dom.kvTable.appendChild(wrap);
    });
  }

  function validateJsonBody() {
    const raw = dom.bodyEditor.value.trim();
    if (!raw) {
      dom.jsonStatus.textContent = "Empty body";
      dom.jsonStatus.style.color = "var(--ink-muted)";
      return true;
    }
    try {
      JSON.parse(raw);
      dom.jsonStatus.textContent = "Valid JSON";
      dom.jsonStatus.style.color = "var(--emerald)";
      return true;
    } catch (_err) {
      dom.jsonStatus.textContent = "Invalid JSON syntax";
      dom.jsonStatus.style.color = "var(--rose)";
      return false;
    }
  }

  function generateSnippet() {
    const url = state.url.replace(/^mock:\/\//, "https://");
    const method = state.method;
    const body = state.body.trim();
    const validHeaders = state.headers.filter(function (h) { return h.key.trim(); });

    if (state.snippetLang === "curl") {
      const parts = ["curl -X " + method + ' "' + url + '"'];
      validHeaders.forEach(function (h) {
        parts.push('  -H "' + h.key + ": " + h.value + '"');
      });
      if (body && method !== "GET" && method !== "DELETE") {
        parts.push("  -d '" + body.replace(/\n\s*/g, " ") + "'");
      }
      return parts.join(" \\\n");
    }

    if (state.snippetLang === "fetch") {
      const headerObj = {};
      validHeaders.forEach(function (h) { headerObj[h.key] = h.value; });
      const opts = { method: method, headers: headerObj };
      if (body && method !== "GET" && method !== "DELETE") {
        opts.body = body;
      }
      return 'const res = await fetch("' + url + '", ' + JSON.stringify(opts, null, 2) + ");\nconst data = await res.json();";
    }

    // Python requests
    const headerPy = validHeaders.map(function (h) {
      return '    "' + h.key + '": "' + h.value + '"';
    }).join(",\n");
    return (
      "import requests\n\n" +
      'res = requests.request(\n    "' + method + '",\n    "' + url + '",\n' +
      "    headers={\n" + headerPy + "\n    }" +
      (body && method !== "GET" ? ",\n    json=" + body : "") +
      "\n)\nprint(res.status_code, res.json())"
    );
  }

  function renderResponsePane() {
    dom.snippetBar.hidden = state.resTab !== "snippets";

    if (state.resTab === "snippets") {
      dom.resOutput.textContent = generateSnippet();
      return;
    }

    if (!state.lastResponse) {
      dom.resOutput.textContent = "// Click Send to execute request";
      return;
    }

    const r = state.lastResponse;
    dom.resStatus.textContent = r.status + " " + r.statusText;
    dom.resStatus.className = r.status >= 200 && r.status < 300 ? "status-ok" : "status-err";
    dom.resTime.textContent = r.durationMs + " ms";
    dom.resSize.textContent = r.body.length + " B";

    if (state.resTab === "headers") {
      dom.resOutput.innerHTML = highlightJson(JSON.stringify(r.headers, null, 2));
      return;
    }

    try {
      const parsed = JSON.parse(r.body);
      dom.resOutput.innerHTML = highlightJson(JSON.stringify(parsed, null, 2));
    } catch (_err) {
      dom.resOutput.textContent = r.body;
    }
  }

  async function runRequest() {
    state.method = dom.methodSelect.value;
    state.url = dom.urlInput.value.trim();
    state.body = dom.bodyEditor.value;

    if (!state.url) return;
    dom.sendBtn.disabled = true;
    dom.sendBtn.textContent = "Sending...";

    try {
      let resData;
      if (state.url.startsWith("mock://")) {
        resData = await Mock.handleMockRequest(state.method, state.url, state.body);
      } else {
        const start = performance.now();
        const hdrs = {};
        state.headers.forEach(function (h) {
          if (h.key.trim()) hdrs[h.key.trim()] = h.value;
        });
        const opts = { method: state.method, headers: hdrs };
        if (state.body.trim() && state.method !== "GET" && state.method !== "HEAD") {
          opts.body = state.body;
        }
        const resp = await fetch(state.url, opts);
        const text = await resp.text();
        const respHeaders = {};
        resp.headers.forEach(function (v, k) { respHeaders[k] = v; });
        resData = {
          status: resp.status,
          statusText: resp.statusText || "OK",
          headers: respHeaders,
          body: text,
          durationMs: Math.round(performance.now() - start)
        };
      }

      state.lastResponse = resData;
      state.history.unshift({
        method: state.method,
        url: state.url,
        headers: state.headers.map(function (h) { return Object.assign({}, h); }),
        body: state.body,
        status: resData.status
      });
      renderHistory();
      renderResponsePane();
    } catch (err) {
      state.lastResponse = {
        status: 0,
        statusText: "Network / CORS Error",
        headers: {},
        body: JSON.stringify({ error: err.message || "Request blocked by CORS or network error" }, null, 2),
        durationMs: 0
      };
      renderResponsePane();
    } finally {
      dom.sendBtn.disabled = false;
      dom.sendBtn.textContent = "Send";
    }
  }

  function bindEvents() {
    dom.themeToggle.addEventListener("click", function () {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });

    dom.sendBtn.addEventListener("click", runRequest);
    dom.urlInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") runRequest();
    });

    dom.reqTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.reqTab = tab.dataset.reqTab;
        dom.reqTabs.forEach(function (t) { t.classList.toggle("is-active", t === tab); });
        dom.bodyPane.hidden = state.reqTab !== "body";
        dom.headersPane.hidden = state.reqTab !== "headers";
      });
    });

    dom.resTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.resTab = tab.dataset.resTab;
        dom.resTabs.forEach(function (t) { t.classList.toggle("is-active", t === tab); });
        renderResponsePane();
      });
    });

    dom.snippetBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.snippetLang = btn.dataset.snippet;
        dom.snippetBtns.forEach(function (b) { b.classList.toggle("is-active", b === btn); });
        renderResponsePane();
      });
    });

    dom.bodyEditor.addEventListener("input", function () {
      state.body = dom.bodyEditor.value;
      validateJsonBody();
    });

    dom.prettifyBtn.addEventListener("click", function () {
      try {
        const parsed = JSON.parse(dom.bodyEditor.value);
        dom.bodyEditor.value = JSON.stringify(parsed, null, 2);
        state.body = dom.bodyEditor.value;
        validateJsonBody();
      } catch (_err) {
        validateJsonBody();
      }
    });

    dom.addHeaderBtn.addEventListener("click", function () {
      state.headers.push({ key: "", value: "" });
      renderHeadersTable();
    });

    dom.copyResBtn.addEventListener("click", function () {
      const txt = dom.resOutput.textContent || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).catch(function () {});
        dom.copyResBtn.textContent = "Copied";
        setTimeout(function () { dom.copyResBtn.textContent = "Copy"; }, 1400);
      }
    });
  }

  function init() {
    cacheDom();
    applyTheme(state.theme);
    loadRequest(Mock.PRESETS[0]);
    renderHistory();
    bindEvents();
    runRequest();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
