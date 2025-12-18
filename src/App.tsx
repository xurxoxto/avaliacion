import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import DashboardPage from './pages/DashboardPage';
import ClassroomPage from './pages/ClassroomPage';
import StudentPage from './pages/StudentPage';
import AnalyticsPage from './pages/AnalyticsPage';
import CompetenciasPage from './pages/CompetenciasPage';
import LoginPage from './pages/LoginPage';
import { storage } from './utils/storage';
import { startCloudSync, stopCloudSync } from './utils/cloudSync';
import { Teacher } from './types';
import { auth } from './config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string>('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user || !user.email) {
        setTeacher(null);
        setAuthError('');
        setLoading(false);
        return;
      }

      const userEmail = user.email.toLowerCase();
      if (!userEmail.endsWith('@edu.xunta.gal')) {
        setAuthError('Solo se permiten cuentas @edu.xunta.gal');
        void signOut(auth).catch(() => {
          // ignore
        });
        setTeacher(null);
        setLoading(false);
        return;
      }

      setAuthError('');
      const domain = userEmail.split('@')[1] || userEmail;
      const next: Teacher = {
        id: user.uid,
        name: userEmail.split('@')[0],
        email: userEmail,
        workspaceId: domain,
        classroomIds: [],
      };

      storage.saveTeacher(next);
      setTeacher(next);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (teacher?.workspaceId) void startCloudSync(teacher.workspaceId);
    return () => {
      stopCloudSync();
    };
  }, [teacher?.id, teacher?.workspaceId]);

  const handleLogin = (teacherData: Teacher) => {
    storage.saveTeacher(teacherData);
    setTeacher(teacherData);
  };

  const handleLogout = () => {
    stopCloudSync();
    void signOut(auth).catch(() => {
      // ignore
    });
    storage.clearTeacher();
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
    return <LoginPage onLogin={handleLogin} externalError={authError} />;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<DashboardPage teacher={teacher} onLogout={handleLogout} />} />
          <Route path="/classroom/:id" element={<ClassroomPage teacher={teacher} onLogout={handleLogout} />} />
          <Route path="/student/:id" element={<StudentPage teacher={teacher} onLogout={handleLogout} />} />
          <Route path="/analytics" element={<AnalyticsPage teacher={teacher} onLogout={handleLogout} />} />
          <Route path="/competencias" element={<CompetenciasPage teacher={teacher} onLogout={handleLogout} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </ErrorBoundary>
  );
}

export default App;
