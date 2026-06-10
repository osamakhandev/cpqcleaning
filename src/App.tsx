import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { RosterProvider } from "@/contexts/RosterContext";
import { ProjectStatusProvider } from "@/contexts/ProjectStatusContext";
import { ProjectHydrationGate } from "@/components/ProjectHydrationGate";
import { AuthProvider } from "@/contexts/AuthContext";
import { PlanProvider } from "@/contexts/PlanContext";
import { RequireAuth } from "@/components/RequireAuth";
import { RequirePlan } from "@/components/RequirePlan";
import Index from "./pages/Index";
import { useAutoRedirect } from "@/components/AutoRedirect";
import Roster from "./pages/Roster";
import DailyBoard from "./pages/DailyBoard";
import WeeklyBoard from "./pages/WeeklyBoard";
import Results from "./pages/Results";
import DetailedSummary from "./pages/DetailedSummary";
import PricingStatutory from "./pages/PricingStatutory";
import PricingSundry from "./pages/PricingSundry";
import PricingAdditional from "./pages/PricingAdditional";
import DivisionBreakdown from "./pages/DivisionBreakdown";
import DetailedResultsPage from "./pages/DetailedResults";
import ExecutiveSummary from "./pages/ExecutiveSummary";
import JobDetails from "./pages/JobDetails";
import Projects from "./pages/Projects";
import LabourAssessment from "./pages/LabourAssessment";
import PrintExecutiveSummary from "./pages/PrintExecutiveSummary";
import Auth from "./pages/Auth";
// import Plans from "./pages/Plans";
import ThankYou from "./pages/ThankYou";
import Checkout from "./pages/Checkout";
import ResetPassword from "./pages/ResetPassword";
import Billing from "./pages/Billing";
import NotFound from "./pages/NotFound";
import { AssessmentProvider } from "@/contexts/AssessmentContext";

const queryClient = new QueryClient();

const RootRedirect = () => {
  useAutoRedirect();
  return <Index />;
};

const Protected = ({ children }: { children: React.ReactNode }) => (
  <RequireAuth>
    <ProjectHydrationGate>
      <ProjectStatusProvider>
        <RosterProvider>{children}</RosterProvider>
      </ProjectStatusProvider>
    </ProjectHydrationGate>
  </RequireAuth>
);

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<Auth />} />
    {/* <Route path="/plans" element={<Plans />} /> */}
    <Route path="/checkout" element={<Checkout />} />
    <Route path="/thank-you" element={<ThankYou />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route
      path="/print/executive-summary"
      element={
        <RequireAuth>
          <ProjectHydrationGate>
            <ProjectStatusProvider>
              <RosterProvider>
                <PrintExecutiveSummary />
              </RosterProvider>
            </ProjectStatusProvider>
          </ProjectHydrationGate>
        </RequireAuth>
      }
    />
    <Route
      path="/projects"
      element={
        <RequireAuth>
          <Projects />
        </RequireAuth>
      }
    />
    <Route
      path="/"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Roster Details">
              <RootRedirect />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/roster"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Weekly Roster">
              <Roster />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/daily-board"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Daily Board">
              <DailyBoard />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/weekly-board"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Labour Deployment Graphs">
              <WeeklyBoard />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/results"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Roster Results">
              <Results />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/detailed-summary"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Detailed Summary">
              <DetailedSummary />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/job-details"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Job Details">
              <JobDetails />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/pricing/statutory"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Labour Price Breakdown">
              <PricingStatutory />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/pricing/sundry"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Sundry Expenses">
              <PricingSundry />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/pricing/additional"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Other Services & Costs">
              <PricingAdditional />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/pricing/divisions"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Division Breakdown">
              <DivisionBreakdown />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/pricing/detailed-results"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Detailed Results">
              <DetailedResultsPage />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/pricing/executive-summary"
      element={
        <Protected>
          <Layout>
            <RequirePlan pageLabel="Executive Summary">
              <ExecutiveSummary />
            </RequirePlan>
          </Layout>
        </Protected>
      }
    />
    <Route
      path="/labour-assessment"
      element={
        <RequireAuth>
          <ProjectHydrationGate>
            <ProjectStatusProvider>
              <RosterProvider>
                <AssessmentProvider cpqProjectId={localStorage.getItem("cpq-project-id") || ""}>
                  <Layout>
                    <RequirePlan pageLabel="Labour Assessment">
                      <LabourAssessment />
                    </RequirePlan>
                  </Layout>
                </AssessmentProvider>
              </RosterProvider>
            </ProjectStatusProvider>
          </ProjectHydrationGate>
        </RequireAuth>
      }
    />
    <Route
      path="/billing"
      element={
        <Protected>
          <Layout>
            <Billing />
          </Layout>
        </Protected>
      }
    />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <PlanProvider>
            <Toaster />
            <Sonner />
            <AppRoutes />
          </PlanProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
