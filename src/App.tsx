import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { selectSignedIn, useApp } from './lib/store';
import { Landing } from './screens/Landing';
import { Onboarding } from './screens/Onboarding';
import { Help } from './screens/Help';
import { Home } from './screens/Home';
import { AddEvidence } from './screens/MyCase';
import { Breathing, Escalation, FollowUpScreen } from './screens/VisitDay';
import { ImportStandalone, VisitHistory, Visits } from './screens/Visits';
import { RedirectVisitPath, ToVisit, VisitIndex } from './screens/visit/common';
import { DoctorSummaryStep, ImportStep, NameHowIFeel, PrepStep, ShareStep, TalkingPointsStep } from './screens/visit/Before';
import { AtVisit, ShowInRoom } from './screens/visit/At';
import { CheckInStep, NextStepsStep, RecapStep } from './screens/visit/After';
import { PracticeScript, Scripts } from './screens/Scripts';
import { MyPlaybookDetail, MyPlaybooks, NewPlaybook, OthersPlaybookDetail, OthersPlaybooks, PracticePlaybook, RatePlaybook } from './screens/Playbooks';
import { SharedBrief } from './screens/Shared';
import { Settings } from './screens/Settings';
import { HowItWorks } from './screens/public/HowItWorks';
import { PrivacyPromise } from './screens/public/PrivacyPromise';
import { Faq } from './screens/public/Faq';
import { Legal } from './screens/public/Legal';
import { Auth } from './screens/public/Auth';

function RequireOnboarded() {
  const signedIn = useApp(selectSignedIn);
  return signedIn ? <Outlet /> : <Navigate to="/" replace />;
}

function PublicOnly() {
  const signedIn = useApp(selectSignedIn);
  return signedIn ? <Navigate to="/home" replace /> : <Outlet />;
}

function PeerRedirect() {
  const { id } = useParams();
  return <Navigate to={`/playbooks/others/${id}`} replace />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  const textScale = useApp((s) => s.textScale);
  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(textScale ?? 1));
  }, [textScale]);

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="/" element={<Landing />} />
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/signup" element={<Auth mode="signup" />} />
          <Route path="/login" element={<Auth mode="login" />} />
        </Route>

        {/* Public site (P1–P8) — open whether or not you're signed in */}
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/privacy-promise" element={<PrivacyPromise />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/legal" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/legal/:doc" element={<Legal />} />
        <Route path="/help-now" element={<Help />} />
        <Route path="/breathe" element={<Breathing />} />

        <Route path="/help" element={<Navigate to="/help-now" replace />} />
        <Route path="/help/now" element={<Help detected />} />
        {/* Shared doctor view — link, no login */}
        <Route path="/shared/:token" element={<SharedBrief />} />
        <Route path="/scripts" element={<Scripts />} />
        <Route path="/scripts/:id/practice" element={<PracticeScript />} />

        <Route element={<RequireOnboarded />}>
          <Route path="/home" element={<Home />} />
          {/* Visits (V1–V3) */}
          <Route path="/visits" element={<Visits />} />
          <Route path="/visits/new" element={<Visits adding />} />
          <Route path="/visits/history" element={<VisitHistory />} />
          <Route path="/visits/import" element={<ImportStandalone />} />
          <Route path="/case/add" element={<AddEvidence />} />
          {/* One visit: Before (B1–B6) · At (A1–A3) · After (F1–F3) */}
          <Route path="/visits/:id" element={<VisitIndex />} />
          <Route path="/visits/:id/before" element={<NameHowIFeel />} />
          <Route path="/visits/:id/before/import" element={<ImportStep />} />
          <Route path="/visits/:id/before/summary" element={<DoctorSummaryStep />} />
          <Route path="/visits/:id/before/brief" element={<TalkingPointsStep />} />
          <Route path="/visits/:id/before/today" element={<PrepStep />} />
          <Route path="/visits/:id/before/share" element={<ShareStep />} />
          <Route path="/visits/:id/at" element={<AtVisit />} />
          <Route path="/visits/:id/at/room" element={<ShowInRoom />} />
          <Route path="/visits/:id/after" element={<RecapStep />} />
          <Route path="/visits/:id/after/check-in" element={<CheckInStep />} />
          <Route path="/visits/:id/after/next-steps" element={<NextStepsStep />} />
          {/* Old MVP links land on the matching step of the right visit */}
          <Route path="/story/*" element={<ToVisit path="before" />} />
          <Route path="/story" element={<ToVisit path="before" />} />
          <Route path="/case" element={<Navigate to="/visits/history" replace />} />
          <Route path="/brief" element={<ToVisit path="before/brief" />} />
          <Route path="/brief/doctor" element={<ToVisit path="at/room" />} />
          <Route path="/today" element={<ToVisit path="before/today" />} />
          <Route path="/visits/before" element={<ToVisit path="before" />} />
          <Route path="/visits/at" element={<ToVisit path="at" />} />
          <Route path="/visits/after" element={<ToVisit path="after" prefer="checkin" />} />
          <Route path="/visits/share" element={<ToVisit path="before/share" />} />
          <Route path="/visits/next-steps" element={<ToVisit path="after/next-steps" prefer="checkin" />} />
          <Route path="/visits/:id/check-in" element={<RedirectVisitPath to={(id) => `/visits/${id}/after/check-in`} />} />
          <Route path="/visits/:id/done" element={<RedirectVisitPath to={(id) => `/visits/${id}/after/next-steps`} />} />
          <Route path="/escalation" element={<Escalation />} />
          <Route path="/follow-up/:id" element={<FollowUpScreen />} />
          <Route path="/playbooks" element={<MyPlaybooks />} />
          <Route path="/playbooks/new" element={<NewPlaybook />} />
          <Route path="/playbooks/mine/:id" element={<MyPlaybookDetail />} />
          <Route path="/playbooks/mine/:id/practice" element={<PracticePlaybook />} />
          <Route path="/playbooks/others" element={<OthersPlaybooks />} />
          <Route path="/playbooks/others/:id" element={<OthersPlaybookDetail />} />
          <Route path="/playbooks/rate" element={<RatePlaybook />} />
          {/* Old MVP routes */}
          <Route path="/peers" element={<Navigate to="/playbooks/others" replace />} />
          <Route path="/peers/share" element={<Navigate to="/playbooks/rate" replace />} />
          <Route path="/peers/:id" element={<PeerRedirect />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/:section" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
