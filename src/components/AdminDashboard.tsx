import { useState, useEffect } from "react";
import { Folder, UserPlus, Users, Link as LinkIcon, LogOut, CheckCircle2, MessageSquare } from "lucide-react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function AdminDashboard() {
  const [folderUrl, setFolderUrl] = useState("https://drive.google.com/drive/folders/1MtWAComxAoObNHGXbHRfRxqmKKcMRSEx");
  const [isDriveAuthed, setIsDriveAuthed] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const [isFolderSet, setIsFolderSet] = useState(false);

  useEffect(() => {
    checkAuthStatus();
    fetchUsers();
    fetchDebugInfo();
  }, []);

  const fetchDebugInfo = async () => {
    try {
      const res = await axios.get("/api/debug");
      if (res.data.folderId && res.data.folderId !== "Chưa có") {
        setFolderUrl(`https://drive.google.com/drive/folders/${res.data.folderId}`);
        setIsFolderSet(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const checkAuthStatus = async () => {
    try {
      const res = await axios.get("/api/auth/status");
      setIsDriveAuthed(res.data.isAuthenticated);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await axios.get("/api/users");
      setUsers(res.data);
    } catch (err: any) {
      // Không tự động redirect về login ở đây để tránh vòng lặp khi chưa có Drive
      console.log("Chưa thể tải danh sách user (có thể chưa kết nối Drive hoặc chưa cấu hình thư mục)");
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const res = await axios.get("/api/auth/google");
      const authWindow = window.open(res.data.url, "google_auth", "width=600,height=700");
      if (!authWindow) {
        setMessage("Lỗi: Trình duyệt đã chặn cửa sổ bật lên. Vui lòng cho phép bật lên để kết nối Google Drive.");
      }
    } catch (err: any) {
      setMessage("Lỗi: " + (err.response?.data?.error || "Không thể lấy URL xác thực"));
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setIsDriveAuthed(true);
        setMessage("Kết nối Google Drive thành công!");
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSetFolder = async () => {
    try {
      await axios.post("/api/drive/folder", { folderUrl });
      setMessage("Đã lưu thư mục Google Drive!");
      setIsFolderSet(true);
      
      // Nếu chưa xác thực, nhắc người dùng xác thực để đồng bộ
      if (!isDriveAuthed) {
        setMessage("Đã lưu thư mục cục bộ. Vui lòng kết nối Google Drive để đồng bộ dữ liệu.");
      } else {
        fetchUsers();
      }
    } catch (err) {
      setMessage("Lỗi: URL thư mục không hợp lệ");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    try {
      await axios.post("/api/users", { username: newUsername, password: newPassword, role: newRole });
      setMessage("Đã thêm người dùng mới thành công!");
      setNewUsername("");
      setNewPassword("");
      fetchUsers();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || "Lỗi không xác định";
      if (err.response?.status === 401) {
        setMessage("Lỗi: Bạn cần kết nối Google Drive và lưu Link thư mục trước khi thêm người dùng.");
      } else {
        setMessage("Lỗi khi thêm người dùng: " + errorMsg);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post("/api/logout");
    } catch (err) {
      console.error("Lỗi logout server:", err);
    }
    localStorage.removeItem("user");
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Folder className="text-white w-6 h-6" />
          </div>
          <span className="font-bold text-xl text-gray-900">Admin Panel</span>
        </div>

        <nav className="flex-1 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium">
            <Folder size={20} /> Cấu hình Drive
          </button>
          <button 
            onClick={() => navigate("/chat")}
            className="w-full flex items-center gap-3 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <MessageSquare size={20} /> Vào Notebook AI
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Users size={20} /> Quản lý User
          </button>
        </nav>

        <button 
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut size={20} /> Đăng xuất
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-auto">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Cấu hình hệ thống</h2>

        {message && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl flex items-center gap-3">
            <CheckCircle2 size={20} /> {message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Drive Config */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <LinkIcon className="text-blue-600" />
              <h3 className="text-xl font-semibold">1. Kết nối Google Drive</h3>
            </div>
            
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                <p className="text-xs text-amber-800 font-medium mb-2 uppercase tracking-wider">Cấu hình Google Cloud (Bắt buộc):</p>
                <p className="text-xs text-amber-700 mb-2">Đảm bảo bạn đã thêm link này vào mục <b>Authorized redirect URIs</b>:</p>
                <code className="block p-2 bg-white border border-amber-200 rounded text-[10px] break-all select-all">
                  {window.location.origin}/api/auth/callback
                </code>
              </div>

              {!isDriveAuthed ? (
                <div className="space-y-3">
                  <button
                    onClick={handleGoogleAuth}
                    className="w-full bg-white border-2 border-gray-200 hover:border-blue-600 hover:text-blue-600 text-gray-700 font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-3"
                  >
                    <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" className="w-6 h-6" alt="Drive" />
                    Nhấn để kết nối Google Drive
                  </button>
                  <button 
                    onClick={checkAuthStatus}
                    className="w-full text-xs text-gray-400 hover:text-blue-600 underline"
                  >
                    Tôi đã kết nối rồi, kiểm tra lại trạng thái
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 size={18} /> Đã xác thực với Google thành công
                </div>
              )}

              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <Folder className="text-blue-600" />
                  <h3 className="text-xl font-semibold">2. Cấu hình Thư mục</h3>
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Dán Link thư mục Google Drive vào đây:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://drive.google.com/drive/folders/..."
                    value={folderUrl}
                    onChange={(e) => setFolderUrl(e.target.value)}
                    className={`flex-1 px-4 py-2 border rounded-lg outline-none transition-all ${isFolderSet ? "border-green-300 bg-green-50" : "border-gray-300 focus:ring-2 focus:ring-blue-500"}`}
                  />
                  <button
                    onClick={handleSetFolder}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    {isFolderSet ? "Cập nhật" : "Lưu"}
                  </button>
                </div>
                {isFolderSet && <p className="text-[10px] text-green-600 mt-2 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Thư mục đã được cấu hình</p>}
                <p className="text-[10px] text-gray-400 mt-2 italic">* Sau khi lưu, file users.txt sẽ tự động được tạo trong thư mục này.</p>
              </div>
            </div>
          </div>

          {/* User Management */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <UserPlus className="text-blue-600" />
              <h3 className="text-xl font-semibold">Thêm người dùng mới</h3>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              <input
                type="text"
                placeholder="Tên đăng nhập"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
              <input
                type="password"
                placeholder="Mật khẩu"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="user">Người dùng (User)</option>
                <option value="admin">Quản trị viên (Admin)</option>
              </select>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
              >
                Tạo tài khoản
              </button>
            </form>

            <div className="mt-8">
              <h4 className="font-semibold text-gray-700 mb-4">Danh sách người dùng</h4>
              <div className="space-y-2 max-h-48 overflow-auto">
                {users.map((u, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                      <span className="font-medium text-gray-900">{u.username}</span>
                      <span className="ml-2 text-xs px-2 py-1 bg-gray-200 rounded text-gray-600 uppercase">{u.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
