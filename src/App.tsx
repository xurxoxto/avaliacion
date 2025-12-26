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
import { Teacher } from './types';
import { auth } from './config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import ErrorBoundary from './components/ErrorBoundary';
import { storage } from './utils/storage';

function App() {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hard cleanup: remove legacy local-only datasets we no longer use.
    storage.cleanupLegacy();

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user || !user.email) {
        setTeacher(null);
        setLoading(false);
        return;
      }

      const userEmail = user.email.toLowerCase();
      if (!userEmail.endsWith('@edu.xunta.gal')) {
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
      setLoading(false);
    });

    return () => {
      unsub();
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
