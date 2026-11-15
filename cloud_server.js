const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = 8787;
const DATA_PATH = path.join(__dirname, "cloud_vault_state.json");
const BACKUP_DIR = path.join(__dirname, "backups");
const D_DRIVE_DIR = "D:\\0commondownload\\Coupon-Gift-Vault";
const D_DRIVE_DATA_PATH = path.join(D_DRIVE_DIR, "cloud_vault_state.json");
const D_DRIVE_BACKUP_DIR = path.join(D_DRIVE_DIR, "backups");
const HTML_PATH = path.join(__dirname, "assets", "index.html");

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
try {
  if (!fs.existsSync(D_DRIVE_BACKUP_DIR)) {
    fs.mkdirSync(D_DRIVE_BACKUP_DIR, { recursive: true });
  }
} catch (e) {}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), s, 10000, 64, "sha512").toString("hex");
  return `${s}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, originalHash] = storedHash.split(":");
  const check = hashPassword(password, salt);
  return check === `${salt}:${originalHash}`;
}

function createInitialState() {
  return {
    updatedAt: Date.now(),
    members: [],
    coupons: [
      {
        id: "sample-amzn-1",
        store: "Amazon",
        account: "Account 1",
        type: "Gift Card / Wallet",
        amount: 100,
        initialAmount: 100,
        code: "AMZN-ACC1-100RS",
        expiry: "2026-11-15",
        notes: "Amazon Pay Gift Card Balance on Account 1",
        adminOnlyCode: false,
        status: "active",
        createdAt: new Date().toISOString()
      },
      {
        id: "sample-amzn-2",
        store: "Amazon",
        account: "Account 2",
        type: "Gift Card / Wallet",
        amount: 2000,
        initialAmount: 2000,
        code: "AMZN-ACC2-2000RS",
        expiry: "2026-11-29",
        notes: "Amazon Shopping Voucher / Gift Card on Account 2",
        adminOnlyCode: false,
        status: "active",
        createdAt: new Date().toISOString()
      }
    ],
    logs: [
      {
        id: "log-init-2",
        action: "ADDED",
        title: "Added ₹2,000 for Amazon (Account 2)",
        detail: "Initial Vault Setup • Expires 2026-11-29",
        timestamp: new Date().toISOString()
      },
      {
        id: "log-init-1",
        action: "ADDED",
        title: "Added ₹100 for Amazon (Account 1)",
        detail: "Initial Vault Setup • Expires 2026-11-15",
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function readState() {
  let st = null;
  try {
    if (fs.existsSync(D_DRIVE_DATA_PATH)) {
      st = JSON.parse(fs.readFileSync(D_DRIVE_DATA_PATH, "utf8"));
    } else if (fs.existsSync(DATA_PATH)) {
      st = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    }
  } catch (e) {}

  if (!st || typeof st !== "object") {
    st = createInitialState();
  }
  if (!Array.isArray(st.members)) st.members = [];
  // Remove legacy sample PIN-based members that have no email
  st.members = st.members.filter(m => m && m.email);
  if (!st.members.some(m => m.email.toLowerCase() === "msbhanu9@gmail.com")) {
    st.members.unshift({
      id: "mem-bhanu-admin",
      name: "Bhanu (Super Admin)",
      email: "msbhanu9@gmail.com",
      role: "super_admin",
      canReadCodes: true,
      hasPassword: true,
      status: "active",
      passwordHash: hashPassword("Admin@1234"),
      inviteToken: null,
      createdAt: new Date().toISOString()
    });
  }
  if (!st.members.some(m => m.email.toLowerCase() === "admin@couponvault.com")) {
    st.members.push({
      id: "mem-super-admin",
      name: "Super Admin",
      email: "admin@couponvault.com",
      role: "super_admin",
      canReadCodes: true,
      hasPassword: true,
      status: "active",
      passwordHash: hashPassword("Admin@1234"),
      inviteToken: null,
      createdAt: new Date().toISOString()
    });
  }
  if (!Array.isArray(st.coupons)) st.coupons = [];
  if (!Array.isArray(st.logs)) st.logs = [];
  return st;
}

function writeState(data) {
  data.updatedAt = Date.now();
  const json = JSON.stringify(data, null, 2);
  const today = new Date().toISOString().split("T")[0];
  try {
    fs.writeFileSync(DATA_PATH, json, "utf8");
    fs.writeFileSync(path.join(BACKUP_DIR, `coupon_vault_backup_${today}.json`), json, "utf8");
  } catch (e) {}
  try {
    fs.writeFileSync(D_DRIVE_DATA_PATH, json, "utf8");
    fs.writeFileSync(path.join(D_DRIVE_BACKUP_DIR, `coupon_vault_backup_${today}.json`), json, "utf8");
  } catch (e) {}
}

// Strip passwordHash before sending state to clients so passwords are NEVER exposed
function sanitizeStateForClient(st, requestingUser) {
  const isSuperAdmin = requestingUser && requestingUser.role === "super_admin";
  const canReadCodes = isSuperAdmin || (requestingUser && requestingUser.canReadCodes);

  return {
    updatedAt: st.updatedAt,
    needsAdminSetup: false,
    members: st.members.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      canReadCodes: Boolean(m.canReadCodes),
      hasPassword: Boolean(m.passwordHash),
      status: m.passwordHash ? "active" : "invited",
      inviteToken: isSuperAdmin ? (m.inviteToken || null) : null,
      createdAt: m.createdAt
    })),
    coupons: st.coupons.map(c => {
      const allowCode = isSuperAdmin || (canReadCodes && !c.adminOnlyCode);
      return {
        ...c,
        code: allowCode ? (c.code || "") : (c.code ? "__HIDDEN__" : "")
      };
    }),
    logs: st.logs
  };
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Vault-User-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;
  const st = readState();
  const reqUserId = req.headers["x-vault-user-id"] || parsedUrl.searchParams.get("userId") || "";
  const reqUser = st.members.find(m => m.id === reqUserId) || null;

  // 1. Check Auth / Vault Status
  if (pathname === "/api/vault" && req.method === "GET") {
    return sendJson(res, 200, sanitizeStateForClient(st, reqUser));
  }

  // 3. Login with Email & Password
  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const member = st.members.find(m => m.email.toLowerCase() === email);
    if (!member) {
      return sendJson(res, 401, { ok: false, error: "No account found with this email. Only the Super Admin can invite new accounts." });
    }
    if (!member.passwordHash) {
      return sendJson(res, 401, { ok: false, error: "Your account is invited but you haven't set a password yet. Please open the invite link sent to your email." });
    }
    if (!verifyPassword(password, member.passwordHash)) {
      return sendJson(res, 401, { ok: false, error: "Invalid email or password." });
    }
    return sendJson(res, 200, {
      ok: true,
      user: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        canReadCodes: Boolean(member.canReadCodes || member.role === "super_admin")
      },
      vault: sanitizeStateForClient(st, member)
    });
  }

  // 4. Verify Invite / Password Setup Token
  if (pathname === "/api/auth/verify-invite" && req.method === "GET") {
    const token = parsedUrl.searchParams.get("token") || "";
    const member = st.members.find(m => m.inviteToken && m.inviteToken === token);
    if (!member) {
      return sendJson(res, 404, { ok: false, error: "This invitation or reset link is invalid or has already been used." });
    }
    return sendJson(res, 200, {
      ok: true,
      email: member.email,
      name: member.name,
      role: member.role
    });
  }

  // 5. Friend Sets Their Own Password via Invite / Reset Link
  if (pathname === "/api/auth/accept-invite" && req.method === "POST") {
    const body = await parseBody(req);
    const token = String(body.token || "").trim();
    const password = String(body.password || "");
    if (password.length < 4) {
      return sendJson(res, 400, { ok: false, error: "Password must be at least 4 characters." });
    }
    const member = st.members.find(m => m.inviteToken && m.inviteToken === token);
    if (!member) {
      return sendJson(res, 404, { ok: false, error: "Invalid or expired invitation link." });
    }
    member.passwordHash = hashPassword(password);
    member.hasPassword = true;
    member.status = "active";
    member.inviteToken = null; // One-time token consumed
    st.logs.unshift({
      id: "log-" + Date.now(),
      action: "ACTIVATED",
      title: `${member.name} (${member.email}) set their password and joined`,
      detail: `Role: ${member.role}`,
      timestamp: new Date().toISOString()
    });
    writeState(st);
    return sendJson(res, 200, {
      ok: true,
      user: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        canReadCodes: Boolean(member.canReadCodes || member.role === "super_admin")
      },
      vault: sanitizeStateForClient(st, member)
    });
  }

  // 6. Super Admin Creates / Invites a New Account by Email
  if (pathname === "/api/admin/invite" && req.method === "POST") {
    if (!reqUser || reqUser.role !== "super_admin") {
      return sendJson(res, 403, { ok: false, error: "Only Super Admin can create new accounts." });
    }
    const body = await parseBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = body.role || "viewer";
    const canReadCodes = Boolean(body.canReadCodes);

    if (!name || !email || !email.includes("@")) {
      return sendJson(res, 400, { ok: false, error: "Please enter a valid name and email address." });
    }
    if (st.members.some(m => m.email.toLowerCase() === email)) {
      return sendJson(res, 400, { ok: false, error: "An account with this email already exists." });
    }

    const inviteToken = crypto.randomBytes(20).toString("hex");
    const newMember = {
      id: "usr-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      name,
      email,
      role,
      canReadCodes,
      passwordHash: null,
      hasPassword: false,
      status: "invited",
      inviteToken,
      createdAt: new Date().toISOString()
    };
    st.members.push(newMember);
    st.logs.unshift({
      id: "log-" + Date.now(),
      action: "INVITED",
      title: `Invited ${name} (${email}) as ${role}`,
      detail: `Code access: ${canReadCodes ? "Allowed" : "Hidden"} • By ${reqUser.name}`,
      timestamp: new Date().toISOString()
    });
    writeState(st);
    return sendJson(res, 200, {
      ok: true,
      member: newMember,
      inviteToken,
      vault: sanitizeStateForClient(st, reqUser)
    });
  }

  // 7. Super Admin Updates Permissions or Triggers Emergency Password Reset
  if (pathname === "/api/admin/member" && req.method === "POST") {
    if (!reqUser || reqUser.role !== "super_admin") {
      return sendJson(res, 403, { ok: false, error: "Only Super Admin can manage accounts." });
    }
    const body = await parseBody(req);
    const target = st.members.find(m => m.id === body.memberId);
    if (!target) {
      return sendJson(res, 404, { ok: false, error: "User not found." });
    }

    if (body.action === "update_permissions") {
      if (body.role) target.role = body.role;
      if (typeof body.canReadCodes === "boolean") target.canReadCodes = body.canReadCodes;
      st.logs.unshift({
        id: "log-" + Date.now(),
        action: "PERMISSION",
        title: `Updated permissions for ${target.email}`,
        detail: `Role: ${target.role} • Read Codes: ${target.canReadCodes ? "Yes" : "No"}`,
        timestamp: new Date().toISOString()
      });
    } else if (body.action === "emergency_set_password") {
      const newPass = String(body.newPassword || "");
      if (newPass.length < 4) {
        return sendJson(res, 400, { ok: false, error: "Emergency password must be at least 4 characters." });
      }
      target.passwordHash = hashPassword(newPass);
      target.hasPassword = true;
      target.status = "active";
      target.inviteToken = null;
      st.logs.unshift({
        id: "log-" + Date.now(),
        action: "EMERGENCY_RESET",
        title: `Emergency password reset performed for ${target.email}`,
        detail: `By Super Admin (${reqUser.email})`,
        timestamp: new Date().toISOString()
      });
    } else if (body.action === "generate_reset_link") {
      target.inviteToken = crypto.randomBytes(20).toString("hex");
      st.logs.unshift({
        id: "log-" + Date.now(),
        action: "RESET_LINK",
        title: `Generated password reset link for ${target.email}`,
        detail: `By Super Admin (${reqUser.email})`,
        timestamp: new Date().toISOString()
      });
    } else if (body.action === "delete_member") {
      if (target.id === reqUser.id) {
        return sendJson(res, 400, { ok: false, error: "You cannot delete your own Super Admin account." });
      }
      st.members = st.members.filter(m => m.id !== target.id);
      st.logs.unshift({
        id: "log-" + Date.now(),
        action: "DELETED",
        title: `Removed user account ${target.email}`,
        detail: `By Super Admin (${reqUser.email})`,
        timestamp: new Date().toISOString()
      });
    }

    writeState(st);
    return sendJson(res, 200, {
      ok: true,
      inviteToken: target.inviteToken || null,
      vault: sanitizeStateForClient(st, reqUser)
    });
  }

  // 8. Save Coupons & Logs State (Respecting Role Permissions)
  if (pathname === "/api/vault" && req.method === "POST") {
    if (!reqUser) {
      return sendJson(res, 401, { ok: false, error: "Please log in first." });
    }
    if (reqUser.role === "viewer") {
      return sendJson(res, 403, { ok: false, error: "View-only accounts cannot modify data." });
    }
    const incoming = await parseBody(req);
    if (Array.isArray(incoming.coupons)) {
      // Preserve existing secret codes if a contributor without code access edited a coupon
      st.coupons = incoming.coupons.map(inc => {
        const existing = st.coupons.find(x => x.id === inc.id);
        if (inc.code === "__HIDDEN__" && existing) {
          return { ...inc, code: existing.code };
        }
        return inc;
      });
    }
    if (Array.isArray(incoming.logs)) {
      st.logs = incoming.logs;
    }
    writeState(st);
    return sendJson(res, 200, {
      ok: true,
      vault: sanitizeStateForClient(st, reqUser)
    });
  }

  // Serve supabase-config.js if requested
  if (pathname === "/supabase-config.js") {
    try {
      const cfgJs = fs.readFileSync(path.join(__dirname, "assets", "supabase-config.js"), "utf8");
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(cfgJs);
      return;
    } catch (e) {}
  }

  // Serve Web App HTML
  try {
    const html = fs.readFileSync(HTML_PATH, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (e) {
    res.writeHead(500);
    res.end("Server Error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Coupon Vault Cloud Sync & Auth Server running at http://localhost:${PORT}`);
});
