import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import DashboardPage from './pages/DashboardPage';
import ClassroomPage from './pages/ClassroomPage';
import StudentPage from './pages/StudentPage';
import AnalyticsPage from './pages/AnalyticsPage';
import CompetenciasPage from './pages/CompetenciasPage';
import LearningSituationsPage from './pages/LearningSituationsPage';
import QuickEvaluationPage from './pages/QuickEvaluationPage';
import LearningSituationDetailPage from './pages/LearningSituationDetailPage';
import LoginPage from './pages/LoginPage';
import { startCloudSync, stopCloudSync } from './utils/cloudSync';
import { Teacher } from './types';
import { auth } from './config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import ErrorBoundary from './components/ErrorBoundary';
import { useRef } from 'react';

function App() {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const activeWorkspaceId = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user || !user.email) {
        activeWorkspaceId.current = null;
        stopCloudSync();
        setTeacher(null);
        setLoading(false);
        return;
      }

      const userEmail = user.email.toLowerCase();
      if (!userEmail.endsWith('@edu.xunta.gal')) {
        activeWorkspaceId.current = null;
        stopCloudSync();
        void signOut(auth).catch(() => {
          // ignore
        });
        setTeacher(null);
        setLoading(false);
        return;
      }

      const domain = userEmail.split('@')[1] || userEmail;
      const next: Teacher = {
        id: user.uid,
        name: userEmail.split('@')[0],
        email: userEmail,
        workspaceId: domain,
        classroomIds: [],
      };
      setTeacher(next);
      if (next.workspaceId) {
        if (activeWorkspaceId.current !== next.workspaceId) {
          stopCloudSync();
          startCloudSync(next.workspaceId);
          activeWorkspaceId.current = next.workspaceId;
        }
      }
      setLoading(false);
    });

    return () => {
      unsub();
      stopCloudSync();
    };
  }, []);

  const handleLogout = () => {
    void signOut(auth);
  };

  if (loading) {
    return <div className="w-screen h-screen flex items-center justify-center">Cargando...</div>;
  }

  return (
    <ErrorBoundary>
      <Routes>
        {teacher ? (
          <>
            <Route path="/" element={<DashboardPage teacher={teacher} onLogout={handleLogout} />} />
            <Route path="/classroom/:id" element={<ClassroomPage teacher={teacher} onLogout={handleLogout} />} />
            <Route path="/classroom/:classroomId/student/:id" element={<StudentPage teacher={teacher} onLogout={handleLogout} />} />
            <Route path="/learning-situations" element={<LearningSituationsPage teacher={teacher} onLogout={handleLogout} />} />
            <Route
              path="/learning-situations/:learningSituationId"
              element={<LearningSituationDetailPage teacher={teacher} onLogout={handleLogout} />}
            />
            <Route
              path="/learning-situations/:learningSituationId/evaluate"
              element={<QuickEvaluationPage teacher={teacher} onLogout={handleLogout} />}
            />
            <Route path="/analytics" element={<AnalyticsPage teacher={teacher} onLogout={handleLogout} />} />
            <Route path="/competencias" element={<CompetenciasPage teacher={teacher} onLogout={handleLogout} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        ) : (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </>
        )}
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
