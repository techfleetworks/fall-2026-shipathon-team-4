import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './lib/store';
import { Landing } from './screens/Landing';
import { Onboarding } from './screens/Onboarding';
import { Caregiver } from './screens/Caregiver';
import { Help } from './screens/Help';
import { Home } from './screens/Home';
import { StoryIntro, StoryStep } from './screens/Story';
import { StorySaved, Translation } from './screens/Translation';
import { AddEvidence, MyCase } from './screens/MyCase';
import { Brief, DoctorView } from './screens/Brief';
import { Breathing, CheckInDone, CheckInScreen, Escalation, FollowUpScreen, MorningPrep } from './screens/VisitDay';
import { Visits } from './screens/Visits';
import { PracticeScript, Scripts } from './screens/Scripts';
import { Peers, PlaybookDetail, ShareWhatHelped } from './screens/Peers';
import { Settings } from './screens/Settings';

function RequireOnboarded() {
  const onboarded = useApp((s) => !!s.profile?.onboarded);
  return onboarded ? <Outlet /> : <Navigate to="/" replace />;
}

function PublicOnly() {
  const onboarded = useApp((s) => !!s.profile?.onboarded);
  return onboarded ? <Navigate to="/home" replace /> : <Outlet />;
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
        </Route>

        <Route path="/caregiver" element={<Caregiver />} />
        <Route path="/help" element={<Help />} />
        <Route path="/help/now" element={<Help detected />} />
        <Route path="/scripts" element={<Scripts />} />
        <Route path="/scripts/:id/practice" element={<PracticeScript />} />

        <Route element={<RequireOnboarded />}>
          <Route path="/home" element={<Home />} />
          <Route path="/story" element={<StoryIntro />} />
          <Route path="/story/review" element={<Translation />} />
          <Route path="/story/saved" element={<StorySaved />} />
          <Route path="/story/:step" element={<StoryStep />} />
          <Route path="/case" element={<MyCase />} />
          <Route path="/case/add" element={<AddEvidence />} />
          <Route path="/brief" element={<Brief />} />
          <Route path="/brief/doctor" element={<DoctorView />} />
          <Route path="/today" element={<MorningPrep />} />
          <Route path="/breathe" element={<Breathing />} />
          <Route path="/visits" element={<Visits />} />
          <Route path="/visits/:id/check-in" element={<CheckInScreen />} />
          <Route path="/visits/:id/done" element={<CheckInDone />} />
          <Route path="/escalation" element={<Escalation />} />
          <Route path="/follow-up/:id" element={<FollowUpScreen />} />
          <Route path="/peers" element={<Peers />} />
          <Route path="/peers/share" element={<ShareWhatHelped />} />
          <Route path="/peers/:id" element={<PlaybookDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
