/* ==========================================================================
   RestBench — Stateful In-Browser Mock Router & Presets
   ========================================================================== */

(function (global) {
  "use strict";

  const STORAGE_MOCK_DB = "restbench_mock_users";

  const DEFAULT_USERS = [
    { id: "usr_101", name: "Elena Sato", role: "Staff ML Engineer", plan: "Enterprise" },
    { id: "usr_102", name: "Marcus Chen", role: "Frontend Architect", plan: "Pro" },
    { id: "usr_103", name: "Hannah Lindqvist", role: "Audio Systems Lead", plan: "Enterprise" }
  ];

  const PRESETS = [
    {
      id: "list-users",
      name: "List Workspace Users",
      method: "GET",
      url: "mock://api.restbench.dev/v1/users",
      headers: [{ key: "Accept", value: "application/json" }],
      body: ""
    },
    {
      id: "create-user",
      name: "Create User (POST)",
      method: "POST",
      url: "mock://api.restbench.dev/v1/users",
      headers: [
        { key: "Content-Type", value: "application/json" },
        { key: "Authorization", value: "Bearer rb_live_demo_9f2a" }
      ],
      body: JSON.stringify({ name: "Sora Takahashi", role: "Product Designer", plan: "Pro" }, null, 2)
    },
    {
      id: "metrics",
      name: "Fetch Gateway Telemetry",
      method: "GET",
      url: "mock://api.restbench.dev/v1/metrics",
      headers: [{ key: "Accept", value: "application/json" }],
      body: ""
    },
    {
      id: "delete-user",
      name: "Delete User usr_102",
      method: "DELETE",
      url: "mock://api.restbench.dev/v1/users/usr_102",
      headers: [{ key: "Authorization", value: "Bearer rb_live_demo_9f2a" }],
      body: ""
    },
    {
      id: "live-github",
      name: "Live GitHub User (CORS)",
      method: "GET",
      url: "https://api.github.com/users/aintzetsu",
      headers: [{ key: "Accept", value: "application/vnd.github+json" }],
      body: ""
    }
  ];

  function loadUsers() {
    try {
      const raw = global.localStorage.getItem(STORAGE_MOCK_DB);
      return raw ? JSON.parse(raw) : DEFAULT_USERS.slice();
    } catch (_err) {
      return DEFAULT_USERS.slice();
    }
  }

  function saveUsers(users) {
    try {
      global.localStorage.setItem(STORAGE_MOCK_DB, JSON.stringify(users));
    } catch (_err) {
      // Ignore storage error
    }
  }

  function handleMockRequest(method, url, bodyText) {
    const start = performance.now();
    const parsed = new URL(url.replace(/^mock:\/\//, "https://"));
    const path = parsed.pathname;
    const headers = {
      "content-type": "application/json; charset=utf-8",
      "x-restbench-runtime": "in-browser-mock",
      "x-request-id": "req_" + Math.random().toString(36).slice(2, 10)
    };

    let status = 200;
    let statusText = "OK";
    let payload = {};

    if (path === "/v1/users" && method === "GET") {
      const users = loadUsers();
      payload = { ok: true, count: users.length, data: users };
    } else if (path === "/v1/users" && method === "POST") {
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch (_err) {
        status = 400;
        statusText = "Bad Request";
        payload = { ok: false, error: "Invalid JSON request body" };
        return Promise.resolve({
          status: status,
          statusText: statusText,
          headers: headers,
          body: JSON.stringify(payload, null, 2),
          durationMs: Math.max(12, Math.round(performance.now() - start + 18))
        });
      }
      if (!body.name) {
        status = 422;
        statusText = "Unprocessable Entity";
        payload = { ok: false, error: "Field 'name' is required" };
      } else {
        const users = loadUsers();
        const created = {
          id: "usr_" + (101 + users.length + Math.floor(Math.random() * 50)),
          name: String(body.name),
          role: String(body.role || "Member"),
          plan: String(body.plan || "Starter")
        };
        users.push(created);
        saveUsers(users);
        status = 201;
        statusText = "Created";
        payload = { ok: true, created: created };
      }
    } else if (path.startsWith("/v1/users/") && method === "DELETE") {
      const id = path.split("/").pop();
      const users = loadUsers();
      const exists = users.some(function (u) { return u.id === id; });
      if (!exists) {
        status = 404;
        statusText = "Not Found";
        payload = { ok: false, error: "User '" + id + "' not found" };
      } else {
        saveUsers(users.filter(function (u) { return u.id !== id; }));
        payload = { ok: true, deletedId: id };
      }
    } else if (path === "/v1/metrics" && method === "GET") {
      payload = {
        ok: true,
        region: "iad1",
        uptime_pct: 99.98,
        p95_latency_ms: 42,
        requests_24h: 184920
      };
    } else {
      status = 404;
      statusText = "Not Found";
      payload = { ok: false, error: "No mock route matched " + method + " " + path };
    }

    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({
          status: status,
          statusText: statusText,
          headers: headers,
          body: JSON.stringify(payload, null, 2),
          durationMs: Math.round(performance.now() - start)
        });
      }, 45);
    });
  }

  global.RestBenchMock = {
    PRESETS: PRESETS,
    handleMockRequest: handleMockRequest
  };
})(window);
