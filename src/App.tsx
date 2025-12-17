import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import DashboardPage from './pages/DashboardPage';
import ClassroomPage from './pages/ClassroomPage';
import StudentPage from './pages/StudentPage';
import AnalyticsPage from './pages/AnalyticsPage';
import LoginPage from './pages/LoginPage';
import { storage } from './utils/storage';
import { Teacher } from './types';

function App() {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if teacher is logged in
    const savedTeacher = storage.getTeacher();
    setTeacher(savedTeacher);
    setLoading(false);
  }, []);

  const handleLogin = (teacherData: Teacher) => {
    storage.saveTeacher(teacherData);
    setTeacher(teacherData);
  };

  const handleLogout = () => {
    storage.saveTeacher({} as Teacher);
    setTeacher(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-gray-600">Cargando...</div>
      </div>
    );
  }

  if (!teacher || !teacher.id) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<DashboardPage teacher={teacher} onLogout={handleLogout} />} />
        <Route path="/classroom/:id" element={<ClassroomPage teacher={teacher} onLogout={handleLogout} />} />
        <Route path="/student/:id" element={<StudentPage teacher={teacher} onLogout={handleLogout} />} />
        <Route path="/analytics" element={<AnalyticsPage teacher={teacher} onLogout={handleLogout} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
