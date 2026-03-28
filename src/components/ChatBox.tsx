import { useState, useEffect, useRef } from "react";
import { FileText, LogOut, ChevronRight, ExternalLink, Search, Loader2, FolderOpen, MessageSquare, Send, X, Bot, User, FileSpreadsheet, FileEdit } from "lucide-react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { GoogleGenAI } from "@google/genai";

export default function ChatBox() {
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // AI Chat State
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [pdfContext, setPdfContext] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  useEffect(() => {
    fetchFiles();
    fetchPdfContext();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const fetchFiles = async () => {
    try {
      setError(null);
      const res = await axios.get("/api/drive/files");
      setFiles(res.data);
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 401) {
        setError("Chưa cấu hình thư mục Google Drive hoặc chưa kết nối. Vui lòng liên hệ Admin.");
      } else {
        setError("Lỗi khi tải danh sách file.");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPdfContext = async () => {
    setIsSyncing(true);
    try {
      const res = await axios.get("/api/drive/all-content");
      setPdfContext(res.data.content);
    } catch (err) {
      console.error("Lỗi lấy nội dung PDF:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([fetchFiles(), fetchPdfContext()]);
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

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isAiLoading) return;

    const currentInput = chatInput;
    setMessages(prev => [...prev, { role: "user", text: currentInput }]);
    setChatInput("");
    setIsAiLoading(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      console.log("Đang khởi tạo AI với API Key:", apiKey ? "Đã có" : "CHƯA CÓ");
      
      if (!apiKey) {
        throw new Error("Thiếu GEMINI_API_KEY. Vui lòng thiết lập trong Secrets.");
      }

      // Initialize Gemini on frontend
      const ai = new GoogleGenAI({ apiKey });
      
      console.log("Đang gửi yêu cầu tới Gemini với context dài:", pdfContext.length);
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `Bạn là một trợ lý AI chuyên gia phân tích tài liệu (giống NotebookLM). 
          Nhiệm vụ của bạn là trả lời câu hỏi của người dùng DỰA TRÊN NỘI DUNG CÁC TÀI LIỆU PDF sau đây.
          
          QUY TẮC QUAN TRỌNG:
          1. Chỉ trả lời dựa trên thông tin có trong tài liệu được cung cấp.
          2. Nếu thông tin không có trong tài liệu, hãy nói rõ: "Tôi không tìm thấy thông tin này trong các tài liệu của bạn."
          3. Nếu có thể, hãy trích dẫn tên tài liệu chứa thông tin đó (ví dụ: "Theo tài liệu [Tên File]...").
          4. Trả lời súc tích, chuyên nghiệp và bằng tiếng Việt.
          
          NỘI DUNG TÀI LIỆU:
          ${pdfContext || "Hiện chưa có dữ liệu tài liệu nào được tải."}`
        },
        history: messages.map(msg => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }]
        }))
      });

      const result = await chat.sendMessage({ message: currentInput });
      console.log("Đã nhận phản hồi từ AI:", result.text.substring(0, 100) + "...");
      setMessages(prev => [...prev, { role: "model", text: result.text }]);
    } catch (err: any) {
      console.error("Lỗi AI chi tiết:", err);
      let errorMessage = "Xin lỗi, đã có lỗi xảy ra khi kết nối với AI. Vui lòng thử lại sau.";
      if (err.message?.includes("API_KEY_INVALID")) {
        errorMessage = "Lỗi: API Key không hợp lệ. Vui lòng kiểm tra lại GEMINI_API_KEY.";
      } else if (err.message?.includes("Thiếu GEMINI_API_KEY")) {
        errorMessage = err.message;
      }
      setMessages(prev => [...prev, { role: "model", text: errorMessage }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') return <FileText size={14} className="text-red-500" />;
    if (mimeType.includes('wordprocessingml')) return <FileEdit size={14} className="text-blue-500" />;
    if (mimeType.includes('spreadsheetml')) return <FileSpreadsheet size={14} className="text-green-500" />;
    return <FileText size={14} className="text-gray-500" />;
  };

  const getIconBg = (mimeType: string) => {
    if (mimeType === 'application/pdf') return "bg-red-50";
    if (mimeType.includes('wordprocessingml')) return "bg-blue-50";
    if (mimeType.includes('spreadsheetml')) return "bg-green-50";
    return "bg-gray-100";
  };

  return (
    <div className="h-screen bg-[#F8F9FA] flex flex-col font-sans overflow-hidden">
      {/* Top Navigation */}
      <header className="h-14 bg-white border-b border-gray-200 px-6 flex justify-between items-center z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Bot className="text-white w-5 h-5" />
          </div>
          <h1 className="text-lg font-semibold text-gray-800">Gemini NotebookLM</h1>
          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase tracking-wider">Beta</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-4 text-xs text-gray-500">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>{user.username}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            title="Đăng xuất"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Sources */}
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <FolderOpen size={16} className="text-blue-600" /> Nguồn tài liệu
            </h2>
            <button 
              onClick={refreshAll}
              disabled={isSyncing || loading}
              className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition-colors disabled:opacity-50"
              title="Làm mới tất cả"
            >
              <Loader2 size={14} className={(isSyncing || loading) ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input 
                type="text"
                placeholder="Tìm nguồn..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <Loader2 className="animate-spin mb-2" size={20} />
                <p className="text-[10px]">Đang tải danh sách file...</p>
              </div>
            ) : error ? (
              <div className="p-4 text-center">
                <p className="text-xs text-red-500 mb-3">{error}</p>
                {user.role === "admin" && (
                  <button 
                    onClick={() => navigate("/admin")}
                    className="text-[10px] text-blue-600 font-bold uppercase hover:underline"
                  >
                    Đi tới Cấu hình Admin
                  </button>
                )}
              </div>
            ) : filteredFiles.length > 0 ? (
              filteredFiles.map((file) => (
                <div key={file.id} className="group relative">
                  <button
                    onClick={() => {
                      setSelectedFile(file);
                      setIsViewerOpen(true);
                    }}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${
                      selectedFile?.id === file.id 
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" 
                      : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${selectedFile?.id === file.id ? "bg-white shadow-sm" : getIconBg(file.mimeType)}`}>
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{file.name}</p>
                    </div>
                  </button>
                </div>
              ))
            ) : (
              <p className="text-center py-10 text-xs text-gray-400">Không có tài liệu</p>
            )}
          </div>
          
          <div className="p-4 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center justify-between text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-2">
              <span>Trạng thái AI</span>
              <span className="text-green-600">Sẵn sàng</span>
            </div>
            <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 w-full"></div>
            </div>
            <p className="text-[9px] text-gray-400 mt-2 leading-tight">
              {pdfContext.length > 0 
                ? `AI đã nạp ${pdfContext.length.toLocaleString()} ký tự từ ${files.length} tài liệu.`
                : "Đang chờ nạp dữ liệu từ tài liệu..."}
            </p>
          </div>
        </aside>

        {/* Main Area: Chat / Notebook */}
        <main className="flex-1 flex flex-col bg-white relative">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
              {messages.length === 0 ? (
                <div className="py-20 text-center space-y-6">
                  <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
                    <Bot size={40} className="text-blue-600" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-gray-900">Chào mừng đến với Notebook của bạn</h2>
                    <p className="text-gray-500 max-w-md mx-auto text-sm">
                      Tôi đã đọc {files.length} tài liệu trong thư mục của bạn. Hãy đặt câu hỏi để tôi giúp bạn tổng hợp và phân tích thông tin.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 max-w-md mx-auto pt-6">
                    {[
                      "Tóm tắt nội dung chính",
                      "Tìm các mốc thời gian quan trọng",
                      "Phân tích các điều khoản hợp đồng",
                      "Liệt kê các bên liên quan"
                    ].map((hint, i) => (
                      <button 
                        key={i}
                        onClick={() => {
                          setChatInput(hint);
                        }}
                        className="p-3 text-left bg-white border border-gray-200 rounded-xl text-xs text-gray-600 hover:border-blue-400 hover:bg-blue-50 transition-all shadow-sm"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${msg.role === "user" ? "bg-blue-600" : "bg-gray-100 border border-gray-200"}`}>
                      {msg.role === "user" ? <User size={16} className="text-white" /> : <Bot size={16} className="text-blue-600" />}
                    </div>
                    <div className={`flex-1 space-y-2 ${msg.role === "user" ? "text-right" : "text-left"}`}>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {msg.role === "user" ? "Bạn" : "Notebook Assistant"}
                      </p>
                      <div className={`inline-block max-w-full p-4 rounded-2xl text-sm ${
                        msg.role === "user" 
                        ? "bg-blue-600 text-white rounded-tr-none" 
                        : "bg-white text-gray-800 border border-gray-100 rounded-tl-none shadow-sm"
                      }`}>
                        <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:text-gray-900">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {isAiLoading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-blue-600" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Notebook Assistant</p>
                    <div className="inline-block p-4 bg-white border border-gray-100 rounded-2xl rounded-tl-none shadow-sm">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="p-6 bg-white border-t border-gray-100">
            <div className="max-w-3xl mx-auto relative">
              <textarea 
                rows={1}
                placeholder="Hỏi Notebook của bạn..."
                className="w-full pl-5 pr-14 py-4 bg-[#F0F2F5] border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none transition-all resize-none custom-scrollbar"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button 
                onClick={handleSendMessage}
                disabled={isAiLoading || !chatInput.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 transition-all shadow-lg shadow-blue-100"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-3 text-center">
              Dựa trên {files.length} nguồn tài liệu • Gemini 3 Flash
            </p>
          </div>
        </main>

        {/* Right Sidebar: Viewer (Toggleable) */}
        {isViewerOpen && selectedFile && (
          <aside className="w-[500px] bg-white border-l border-gray-200 flex flex-col animate-slide-left">
            <div className="h-14 px-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="text-blue-600 shrink-0" />
                <span className="text-xs font-bold text-gray-700 truncate">{selectedFile.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <a 
                  href={selectedFile.webViewLink} 
                  target="_blank" 
                  rel="noreferrer"
                  className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors"
                  title="Mở trong Drive"
                >
                  <ExternalLink size={16} />
                </a>
                <button 
                  onClick={() => setIsViewerOpen(false)}
                  className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 p-4">
              <div className="w-full h-full bg-white rounded-xl shadow-inner overflow-hidden border border-gray-200">
                <iframe
                  src={selectedFile.webViewLink.replace('/view', '/preview')}
                  className="w-full h-full"
                  allow="autoplay"
                  title={selectedFile.name}
                ></iframe>
              </div>
            </div>
          </aside>
        )}
      </div>

      <style>{`
        @keyframes slide-left {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-left {
          animation: slide-left 0.3s ease-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E5E7EB;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #D1D5DB;
        }
        .prose pre {
          background-color: #f3f4f6;
          color: #1f2937;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
}
