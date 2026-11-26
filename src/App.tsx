import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { isConfigured } from './lib/supabase'
import { useI18n } from './lib/i18n'
import { APP_VARIANT, canAccessAdminRoutes, canAccessPlayerRoutes, defaultLandingPath } from './lib/appVariant'
import Login from './pages/Login'
import Home from './pages/Home'
import { RequirePlayer } from './auth/RequirePlayer'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import PuzzleLab from './pages/admin/PuzzleLab'
import Stories from './pages/admin/Stories'
import StoryEditor from './pages/admin/StoryEditor'
import QuestionBank from './pages/admin/QuestionBank'
import Assignments from './pages/admin/Assignments'
import PublishPanel from './pages/admin/PublishPanel'
import RulesPanel from './pages/admin/RulesPanel'
import Rooms from './pages/admin/Rooms'
import RoomControl from './pages/admin/RoomControl'
import Join from './pages/Join'
import Lobby from './pages/Lobby'
import Users from './pages/admin/Users'
import Reports from './pages/admin/Reports'
import PlatformSettings from './pages/admin/PlatformSettings'
import ContentStudio from './pages/admin/ContentStudio'
import ContentLibrary from './pages/admin/ContentLibrary'
import ContentImages from './pages/admin/ContentImages'
import ContentQuestions from './pages/admin/ContentQuestions'
import ContentAI from './pages/admin/ContentAI'
import ContentImport from './pages/admin/ContentImport'
import ContentReview from './pages/admin/ContentReview'
import ContentAnalytics from './pages/admin/ContentAnalytics'
import ContentCategories from './pages/admin/ContentCategories'
import DetectiveCatalog from './pages/DetectiveCatalog'
import DetectiveSession from './pages/DetectiveSession'
import DetectiveStudio from './pages/admin/DetectiveStudio'
import DetectiveCaseEditor from './pages/admin/DetectiveCaseEditor'

export default function App() {
  const { t } = useI18n()
  if (!isConfigured) return (
    <main className="grid min-h-screen place-items-center bg-ink-900 p-6 text-parchment-100">
      <section className="card w-full max-w-xl space-y-4 text-center" role="alert">
        <h1 className="font-display text-3xl text-gold-400">{t('appName')}</h1>
        <p className="text-lg">{t('configMissing')}</p>
        <p className="text-sm opacity-80">{t('configMissingMobile')}</p>
      </section>
    </main>
  )
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {canAccessPlayerRoutes(APP_VARIANT) && (
        <>
          <Route path="/" element={<Home />} />
          <Route path="/detective" element={<RequirePlayer><DetectiveCatalog /></RequirePlayer>} />
          <Route path="/detective/session/:sessionId" element={<RequirePlayer><DetectiveSession /></RequirePlayer>} />
        </>
      )}
      {canAccessPlayerRoutes(APP_VARIANT) && (
        <>
          <Route path="/join" element={<Join />} />
          <Route path="/join/:code" element={<Join />} />
          <Route path="/play/:roomId" element={<Lobby />} />
        </>
      )}
      {canAccessAdminRoutes(APP_VARIANT) && (
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={APP_VARIANT === 'admin' ? <Navigate to="stories" replace /> : <RequireAuth permission="report.view"><Dashboard /></RequireAuth>} />
          <Route path="stories" element={<RequireAuth permission="story.manage"><Stories /></RequireAuth>} />
          <Route path="stories/:id" element={<RequireAuth permission="story.manage"><StoryEditor /></RequireAuth>} />
          <Route path="stories/:id/questions" element={<RequireAuth permission="story.manage"><QuestionBank /></RequireAuth>} />
          <Route path="stories/:id/assign" element={<RequireAuth permission="story.manage"><Assignments /></RequireAuth>} />
          <Route path="stories/:id/rules" element={<RequireAuth permission="story.manage"><RulesPanel /></RequireAuth>} />
          <Route path="stories/:id/publish" element={<RequireAuth permission="story.manage"><PublishPanel /></RequireAuth>} />
          <Route path="content-library" element={<RequireAuth permission="story.manage"><ContentStudio /></RequireAuth>}>
            <Route index element={<ContentLibrary />} />
            <Route path="images" element={<ContentImages />} />
            <Route path="questions" element={<ContentQuestions />} />
            <Route path="ai" element={<ContentAI />} />
            <Route path="import" element={<ContentImport />} />
            <Route path="review" element={<RequireAuth permission="content.review"><ContentReview /></RequireAuth>} />
            <Route path="analytics" element={<ContentAnalytics />} />
            <Route path="categories" element={<ContentCategories />} />
          </Route>
          <Route path="detective" element={<RequireAuth permission="story.manage"><DetectiveStudio /></RequireAuth>} />
          <Route path="detective/:id" element={<RequireAuth permission="story.manage"><DetectiveCaseEditor /></RequireAuth>} />
          <Route path="rooms/:id" element={<RequireAuth permission="room.manage"><RoomControl /></RequireAuth>} />
          <Route path="puzzle-lab" element={<RequireAuth permission="story.manage"><PuzzleLab /></RequireAuth>} />
          <Route path="rooms" element={<RequireAuth permission="room.manage"><Rooms /></RequireAuth>} />
          <Route path="users" element={<RequireAuth permission="user.manage"><Users /></RequireAuth>} />
          <Route path="reports" element={<RequireAuth permission="report.view"><Reports /></RequireAuth>} />
          <Route path="settings" element={<RequireAuth permission="*"><PlatformSettings /></RequireAuth>} />
        </Route>
      )}
      <Route path="*" element={<Navigate to={defaultLandingPath(APP_VARIANT)} replace />} />
    </Routes>
  )
}
