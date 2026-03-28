import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./components/Login";
import AdminDashboard from "./components/AdminDashboard";
import ChatBox from "./components/ChatBox";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("user");
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (err) {
      console.error("Lỗi đọc user từ localStorage:", err);
      localStorage.removeItem("user");
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) return null;

  return (
    <Router>
      <Routes>
        <Route path="/" element={user ? <Navigate to={user.role === "admin" ? "/admin" : "/chat"} /> : <Login setAuth={setUser} />} />
        
        <Route 
          path="/admin" 
          element={
            user?.role === "admin" ? <AdminDashboard /> : <Navigate to="/" />
          } 
        />
        
        <Route 
          path="/chat" 
          element={
            user ? <ChatBox /> : <Navigate to="/" />
          } 
        />
      </Routes>
    </Router>
  );
}
