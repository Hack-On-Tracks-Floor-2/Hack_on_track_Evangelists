import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { Shell } from "@/components/app/Shell";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { FxMarket } from "./pages/app/Fx.tsx";

const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Landing = lazy(() => import("./pages/Landing.tsx"));
const Overview = lazy(() => import("./pages/app/Overview.tsx"));
const Datasets = lazy(() => import("./pages/app/Datasets.tsx"));
const DatasetDetail = lazy(() => import("./pages/app/DatasetDetail.tsx"));
const Detections = lazy(() => import("./pages/app/Detections.tsx"));
const Domestic = lazy(() => import("./pages/app/Domestic.tsx"));
const International = lazy(() => import("./pages/app/International.tsx"));
const Transactions = lazy(() => import("./pages/app/Transactions.tsx"));
const Network = lazy(() => import("./pages/app/Network.tsx"));
const FundFlows = lazy(() => import("./pages/app/FundFlows.tsx"));
const Entities = lazy(() => import("./pages/app/Entities.tsx"));
const FxHistory = lazy(() => import("./pages/app/FxHistory.tsx"));
const Cases = lazy(() => import("./pages/app/Cases.tsx"));
const Settings = lazy(() => import("./pages/app/Settings.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } });

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading workspace…</div>
    </div>
  );
}

class ToolbarErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.warn("[VlyToolbar] disabled:", err.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: "" };
  static getDerivedStateFromError(error: Error) { return { hasError: true, message: error.message || "Unknown error" }; }
  componentDidCatch(err: Error) { console.error("[Preview] Root crash:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Something went wrong loading Aegis</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">{this.state.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage({ type: "iframe-route-change", path: location.pathname }, "*");
  }, [location.pathname]);
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);
  return null;
}

function App({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <RequireAuth>
      <Shell title={title} sub={sub}>{children}</Shell>
    </RequireAuth>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary><VlyToolbar /></ToolbarErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <QueryClientProvider client={queryClient}>
          <ConvexAuthProvider client={convex}>
            <BrowserRouter>
              <RouteSyncer />
              <Suspense fallback={<RouteLoading />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/auth" element={<AuthPage redirectAfterAuth="/dashboard" />} />
                  <Route path="/login" element={<AuthPage redirectAfterAuth="/dashboard" />} />
                  <Route path="/register" element={<AuthPage redirectAfterAuth="/dashboard" />} />
                  <Route path="/dashboard" element={<App title="Financial Intelligence Overview" sub="Monitor transactions, understand unusual financial activity, and explore the evidence behind every alert."><Overview /></App>} />
                  <Route path="/domestic" element={<App title="Domestic Transaction Monitoring" sub="Indian domestic transfers: velocity, splitting, pass-through, and connected accounts."><Domestic /></App>} />
                  <Route path="/international" element={<App title="International Payment Monitoring" sub="Cross-border corridors, intermediary chains, and counterparty context."><International /></App>} />
                  <Route path="/transactions" element={<App title="Transaction Monitoring" sub="Searchable, filterable ledger with exact-record details."><Transactions /></App>} />
                  <Route path="/detections" element={<App title="Detection Alert Explorer" sub="Investigative alerts with evidence-backed priorities."><Detections /></App>} />
                  <Route path="/detections/:id" element={<App title="Alert Investigation Workbench" sub="Evidence, timeline, graph, and review actions."><Detections /></App>} />
                  <Route path="/network" element={<App title="Entity Network Explorer" sub="Interactive account and counterparty relationships."><Network /></App>} />
                  <Route path="/fund-flows" element={<App title="Fund Flow Explorer" sub="Evidence-backed directed payment sequences."><FundFlows /></App>} />
                  <Route path="/flows" element={<App title="Fund Flow Explorer" sub="Evidence-backed directed payment sequences."><FundFlows /></App>} />
                  <Route path="/entities" element={<App title="Entity Intelligence" sub="Searchable accounts, companies, and counterparties."><Entities /></App>} />
                  <Route path="/entities/:id" element={<App title="Entity Intelligence Profile" sub="History, baselines, alerts, and relationships."><Entities /></App>} />
                  <Route path="/fx-market" element={<App title="FX Market" sub="Professional market-data terminal with labelled quote states."><FxMarketWrap /></App>} />
                  <Route path="/fx-history" element={<App title="FX History" sub="Pair, range, and source selectors with actual-data export."><FxHistory /></App>} />
                  <Route path="/datasets" element={<App title="Dataset Library" sub="Upload CSV, open, profile, analyse, compare, download, delete — all on one screen."><Datasets /></App>} />
                  <Route path="/datasets/new" element={<Navigate to="/datasets" replace />} />
                  <Route path="/datasets/:id" element={<App title="Dataset Detail" sub="Quality, rows, manifest, exports."><DatasetDetail /></App>} />
                  <Route path="/monitoring" element={<App title="Transaction Monitoring" sub="Run jobs, review results."><Transactions /></App>} />
                  <Route path="/rules" element={<Navigate to="/models" replace />} />
                  <Route path="/models" element={<Navigate to="/reports" replace />} />
                  <Route path="/evaluation" element={<Navigate to="/reports" replace />} />
                  <Route path="/reports" element={<App title="Reports" sub="Generated downloads from actual backend data."><GovWrap view="reports" /></App>} />
                  <Route path="/audit" element={<App title="Audit Trail" sub="Actor, action, record, outcome."><Cases /></App>} />
                  <Route path="/investigations" element={<App title="Investigation Cases" sub="Cases, notes, status, audit."><Cases /></App>} />
                  <Route path="/investigations/:id" element={<App title="Case Workbench" sub="Notes and status persist."><Cases /></App>} />
                  <Route path="/settings" element={<App title="Settings" sub="Workspace, account, notifications, provider configuration."><Settings /></App>} />
                  <Route path="/governance" element={<App title="Settings" sub="Workspace, account, notifications, provider configuration."><Settings /></App>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster />
          </ConvexAuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  </StrictMode>,
);

function FxMarketWrap() { return <FxMarket />; }
function GovWrap({ view }: { view: string }) {
  const G = React.lazy(() => import("./pages/app/Governance.tsx"));
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
      <G view={view} />
    </Suspense>
  );
}
