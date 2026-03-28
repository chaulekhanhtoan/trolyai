import express from "express";
import session from "express-session";
import { google } from "googleapis";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { PDFParse } from "pdf-parse";
import { GoogleGenAI } from "@google/genai";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

declare module "express-session" {
  interface SessionData {
    tokens: any;
    folderId: string;
  }
}

const app = express();
const PORT = 3000;
const CONFIG_FILE = path.join(process.cwd(), "config.json");

console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("APP_URL:", process.env.APP_URL);

// Load persisted config
let persistedConfig = { tokens: null, folderId: "1MtWAComxAoObNHGXbHRfRxqmKKcMRSEx" };
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    persistedConfig.tokens = data.tokens || null;
    if (data.folderId) persistedConfig.folderId = data.folderId;
    console.log("Đã tải cấu hình từ config.json");
  } catch (err) {
    console.error("Lỗi đọc config.json:", err);
  }
}

// Check for local link.txt as an alternative source for folderId
const LOCAL_LINK_FILE = path.join(process.cwd(), "link.txt");
if (fs.existsSync(LOCAL_LINK_FILE)) {
  try {
    const linkUrl = fs.readFileSync(LOCAL_LINK_FILE, "utf-8").trim();
    const match = linkUrl.match(/[-\w]{25,}/);
    if (match) {
      persistedConfig.folderId = match[0];
      console.log("Đã tìm thấy folderId từ link.txt địa phương:", match[0]);
    }
  } catch (err) {
    console.error("Lỗi đọc link.txt địa phương:", err);
  }
} else if (!fs.existsSync(CONFIG_FILE)) {
  // If no config and no link.txt, ensure we have the default link.txt
  fs.writeFileSync(LOCAL_LINK_FILE, "https://drive.google.com/drive/folders/1MtWAComxAoObNHGXbHRfRxqmKKcMRSEx");
}

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "default-secret",
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: true, 
    sameSite: 'none',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware to inject persisted config into session if missing
app.use((req, res, next) => {
  // Only auto-login if not explicitly logged out in this session
  if (req.session && (req.session as any).isLoggedOut) {
    return next();
  }

  if (!req.session.tokens && persistedConfig.tokens) {
    req.session.tokens = persistedConfig.tokens;
  }
  if (!req.session.folderId && persistedConfig.folderId) {
    req.session.folderId = persistedConfig.folderId;
  }
  next();
});

// Trust proxy is required for secure cookies in some environments
app.set('trust proxy', 1);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/api/auth/callback`
);

// Log configuration status on startup
console.log("--- Cấu hình Google Drive ---");
console.log("CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? "Đã thiết lập" : "CHƯA CÓ");
console.log("CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? "Đã thiết lập" : "CHƯA CÓ");
console.log("REDIRECT_URI:", process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/api/auth/callback`);
console.log("----------------------------");

const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'];

const SUPPORTED_MIMETYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const DRIVE_QUERY_MIMETYPES = SUPPORTED_MIMETYPES.map(type => `mimeType = '${type}'`).join(' or ');

// --- Auth Routes ---

app.get("/api/auth/google", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: "Thiếu GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET trong Secrets" });
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  console.log("Đang tạo URL xác thực Google...");
  res.json({ url });
});

app.get("/api/auth/callback", async (req, res) => {
  const { code } = req.query;
  console.log("Nhận được callback từ Google, đang trao đổi code lấy token...");
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    req.session.tokens = tokens;
    persistedConfig.tokens = tokens;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(persistedConfig, null, 2));
    console.log("Xác thực thành công! Đã lưu tokens vào session và config.json.");
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Xác thực thành công. Cửa sổ này sẽ tự đóng.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Lỗi khi trao đổi code lấy token:", error.response?.data || error.message);
    res.status(500).send(`Xác thực thất bại: ${error.message}`);
  }
});

app.get("/api/auth/status", (req, res) => {
  res.json({ isAuthenticated: !!req.session.tokens });
});

// --- Debug Route ---
app.get("/api/debug", (req, res) => {
  res.json({
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || "Sử dụng APP_URL mặc định",
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    APP_URL: process.env.APP_URL,
    isAuthenticated: !!req.session.tokens,
    folderId: req.session.folderId || "Chưa có"
  });
});

// --- Drive Logic ---

async function getDrive(tokens: any) {
  oauth2Client.setCredentials(tokens);
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function extractTextFromFile(fileId: string, fileName: string, mimeType: string, drive: any): Promise<string> {
  try {
    const contentRes = await drive.files.get({
      fileId: fileId,
      alt: 'media',
    }, { responseType: 'arraybuffer' });

    const dataBuffer = Buffer.from(contentRes.data as any);

    if (mimeType === 'application/pdf') {
      const parser = new PDFParse({ data: dataBuffer });
      const pdfData = await parser.getText();
      await parser.destroy();
      return pdfData.text || "";
    } 
    
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: dataBuffer });
      return result.value;
    }

    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const workbook = XLSX.read(dataBuffer, { type: 'buffer' });
      let excelText = "";
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        excelText += `--- Sheet: ${sheetName} ---\n`;
        excelText += XLSX.utils.sheet_to_txt(worksheet);
        excelText += "\n\n";
      });
      return excelText;
    }

    return "";
  } catch (err) {
    console.error(`Lỗi khi trích xuất text từ file ${fileName}:`, err);
    throw err;
  }
}

app.get("/api/drive/all-content", async (req, res) => {
  if (!req.session.tokens || !req.session.folderId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const drive = await getDrive(req.session.tokens);
    const filesResponse = await drive.files.list({
      q: `'${req.session.folderId}' in parents and (${DRIVE_QUERY_MIMETYPES}) and trashed = false`,
      fields: 'files(id, name, mimeType)',
    });
    const files = filesResponse.data.files || [];

    console.log(`Đang lấy nội dung từ ${files.length} file (PDF/Word/Excel) trong folder...`);
    let allContent = "";
    const limit = Math.min(files.length, 20); // Tăng giới hạn lên 20 file
    
    for (let i = 0; i < limit; i++) {
      const file = files[i];
      try {
        console.log(`Đang đọc file: ${file.name} (${file.id}) - Type: ${file.mimeType}`);
        const extractedText = await extractTextFromFile(file.id, file.name || "", file.mimeType || "", drive);
        
        const textSnippet = extractedText.substring(0, 15000);
        
        if (extractedText.trim().length === 0) {
          console.warn(`Cảnh báo: File ${file.name} không có nội dung văn bản hoặc không đọc được.`);
          allContent += `--- Tên File: ${file.name} ---\n(Không tìm thấy nội dung văn bản trong file này)\n\n`;
        } else {
          console.log(`Đã trích xuất ${textSnippet.length} ký tự từ file ${file.name}`);
          allContent += `--- Tên File: ${file.name} ---\nNội dung:\n${textSnippet}\n\n`;
        }
      } catch (err) {
        console.error(`Lỗi khi đọc file ${file.name}:`, err);
      }
    }
    console.log(`Tổng cộng đã trích xuất ${allContent.length} ký tự cho AI context.`);
    res.json({ content: allContent });
  } catch (error) {
    console.error("Error fetching all content:", error);
    res.status(500).json({ error: "Failed to fetch content" });
  }
});

async function syncLinkFile(drive: any, folderId: string, folderUrl: string) {
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and name = 'link.txt' and trashed = false`,
      fields: 'files(id)',
    });

    if (response.data.files.length > 0) {
      const fileId = response.data.files[0].id;
      await drive.files.update({
        fileId,
        media: {
          mimeType: 'text/plain',
          body: folderUrl,
        },
      });
      console.log("Đã cập nhật link.txt trên Drive.");
    } else {
      await drive.files.create({
        requestBody: {
          name: 'link.txt',
          parents: [folderId],
          mimeType: 'text/plain',
        },
        media: {
          mimeType: 'text/plain',
          body: folderUrl,
        },
      });
      console.log("Đã tạo mới link.txt trên Drive.");
    }
  } catch (err) {
    console.error("Lỗi đồng bộ link.txt:", err);
  }
}

app.post("/api/drive/folder", async (req, res) => {
  const { folderUrl } = req.body;
  // Extract folder ID from URL
  const match = folderUrl.match(/[-\w]{25,}/);
  if (match) {
    const folderId = match[0];
    req.session.folderId = folderId;
    persistedConfig.folderId = folderId;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(persistedConfig, null, 2));
    
    // Also update local link.txt for convenience
    fs.writeFileSync(path.join(process.cwd(), "link.txt"), folderUrl);
    
    // Sync link.txt to Drive if tokens are available
    if (req.session.tokens) {
      try {
        const drive = await getDrive(req.session.tokens);
        await syncLinkFile(drive, folderId, folderUrl);
      } catch (err) {
        console.error("Lỗi khi đồng bộ link.txt sau khi đổi folder:", err);
      }
    }
    
    res.json({ folderId });
  } else {
    res.status(400).json({ error: "Invalid Google Drive URL" });
  }
});

app.get("/api/drive/files", async (req, res) => {
  if (!req.session.tokens || !req.session.folderId) {
    return res.status(401).json({ error: "Unauthorized or folder not set" });
  }

  try {
    const drive = await getDrive(req.session.tokens);
    const response = await drive.files.list({
      q: `'${req.session.folderId}' in parents and (${DRIVE_QUERY_MIMETYPES}) and trashed = false`,
      fields: 'files(id, name, webViewLink, iconLink, mimeType)',
    });
    res.json(response.data.files);
  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({ error: "Failed to list files" });
  }
});

app.get("/api/drive/content/:fileId", async (req, res) => {
  if (!req.session.tokens) return res.status(401).json({ error: "Unauthorized" });

  try {
    const drive = await getDrive(req.session.tokens);
    
    // Get metadata first to know mimeType
    const meta = await drive.files.get({
      fileId: req.params.fileId,
      fields: 'name, mimeType'
    });

    const text = await extractTextFromFile(req.params.fileId, meta.data.name || "", meta.data.mimeType || "", drive);
    res.json({ text });
  } catch (error) {
    console.error("Error reading file:", error);
    res.status(500).json({ error: "Failed to read file" });
  }
});

// --- User Management (stored in users.txt on Drive) ---

async function getOrCreateUsersFile(drive: any, folderId: string) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and name = 'users.txt' and trashed = false`,
    fields: 'files(id)',
  });

  if (response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  const fileMetadata = {
    name: 'users.txt',
    parents: [folderId],
    mimeType: 'text/plain',
  };
  const media = {
    mimeType: 'text/plain',
    body: 'admin:admin:admin\n', // default admin user
  };
  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id',
  });
  return file.data.id;
}

app.post("/api/login", async (req, res) => {
  console.log("Request Body:", req.body);
  const { username, password } = req.body;
  console.log(`Đang thử đăng nhập: username="${username}", password="${password}"`);

  const trimmedUsername = username?.trim();
  const trimmedPassword = password?.trim();

  // 1. Kiểm tra tài khoản admin "cứu hộ" (Bootstrap Admin)
  if (trimmedUsername?.toLowerCase() === "admin" && trimmedPassword === "admin") {
    console.log("Đăng nhập admin cứu hộ thành công.");
    req.session.tokens = req.session.tokens || null; // Khởi tạo session
    return res.json({ username: "admin", role: "admin" });
  }

  // 2. Nếu đã có Drive, kiểm tra trong file users.txt
  if (req.session.tokens && req.session.folderId) {
    try {
      const drive = await getDrive(req.session.tokens);
      const fileId = await getOrCreateUsersFile(drive, req.session.folderId);
      const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
      const content = response.data as string;
      console.log("Nội dung users.txt từ Drive (đã trích xuất):", content.substring(0, 100) + "...");
      
      const users = content.split(/\r?\n/).filter(line => line.trim()).map(line => {
        const parts = line.split(":").map(p => p.trim());
        return { username: parts[0], password: parts[1], role: parts[2] };
      });

      // Luôn đảm bảo có admin mặc định nếu file trống hoặc mất admin
      if (!users.find(u => u.username === "admin")) {
        users.push({ username: "admin", password: "admin", role: "admin" });
      }

      console.log(`Đang so sánh: "${trimmedUsername}" vs danh sách ${users.length} users.`);
      const user = users.find(u => {
        const uMatch = u.username === trimmedUsername;
        const pMatch = u.password === trimmedPassword;
        if (uMatch && !pMatch) {
          console.log(`User "${u.username}" khớp nhưng SAI mật khẩu. Nhập: "${trimmedPassword}", Lưu: "${u.password}"`);
        }
        return uMatch && pMatch;
      });
      if (user) {
        console.log(`Đăng nhập user "${trimmedUsername}" thành công từ Drive.`);
        return res.json(user);
      } else {
        console.log(`Không tìm thấy user "${trimmedUsername}" với mật khẩu đã nhập trong users.txt`);
      }
    } catch (error) {
      console.error("Lỗi kiểm tra user trên Drive:", error);
    }
  } else {
    console.log("Bỏ qua kiểm tra Drive vì thiếu tokens hoặc folderId trong session.");
  }

  console.log("Đăng nhập thất bại.");
  res.status(401).json({ error: "Sai tên đăng nhập hoặc mật khẩu" });
});

app.get("/api/users", async (req, res) => {
  if (!req.session.tokens || !req.session.folderId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const drive = await getDrive(req.session.tokens);
    const fileId = await getOrCreateUsersFile(drive, req.session.folderId);
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
    const content = response.data as string;
    const users = content.split("\n").filter(line => line.trim()).map(line => {
      const [username, password, role] = line.split(":");
      return { username, password, role };
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post("/api/users", async (req, res) => {
  if (!req.session.tokens || !req.session.folderId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { username, password, role } = req.body;
    const drive = await getDrive(req.session.tokens);
    const fileId = await getOrCreateUsersFile(drive, req.session.folderId);
    
    const getResponse = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
    let content = getResponse.data as string;
    content += `${username}:${password}:${role}\n`;

    await drive.files.update({
      fileId,
      media: {
        mimeType: 'text/plain',
        body: content,
      },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add user" });
  }
});

app.post("/api/logout", (req, res) => {
  // Mark as logged out to prevent auto-injection
  (req.session as any).isLoggedOut = true;
  
  // Clear persisted config tokens so it doesn't auto-login on next process start
  persistedConfig.tokens = null;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(persistedConfig, null, 2));

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Could not log out" });
    }
    res.json({ success: true });
  });
});

// --- Vite Integration ---

async function startServer() {
  console.log("Đang khởi động server...");
  if (process.env.NODE_ENV !== "production") {
    console.log("Đang khởi động Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware đã sẵn sàng.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
