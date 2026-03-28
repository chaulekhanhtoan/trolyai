import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import axios from "axios";

export default function Login({ setAuth }: { setAuth: (user: any) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const response = await axios.post("/api/login", { username, password });
      const user = response.data;
      
      setAuth(user);
      localStorage.setItem("user", JSON.stringify(user));
      navigate(user.role === "admin" ? "/admin" : "/chat");
    } catch (err: any) {
      setError(err.response?.data?.error || "Sai tên đăng nhập hoặc mật khẩu");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
            <LogIn className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Đăng nhập hệ thống</h1>
          <p className="text-gray-500 text-sm mt-2">Vui lòng nhập thông tin tài khoản</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="text-center">
            <p className="text-xs text-gray-500 italic">Mặc định: admin / admin</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors shadow-lg shadow-blue-200"
          >
            Đăng nhập
          </button>
          <div className="text-center mt-4">
            <button 
              type="button"
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Xóa bộ nhớ tạm (Clear Cache)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
