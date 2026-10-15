import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { Shell } from "@/components/app/Shell";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Overview = lazy(() => import("./pages/app/Overview.tsx"));
const Datasets = lazy(() => import("./pages/app/Datasets.tsx"));
const DatasetDetail = lazy(() => import("./pages/app/DatasetDetail.tsx"));
const Studio = lazy(() => import("./pages/app/Studio.tsx"));
const Detections = lazy(() => import("./pages/app/Detections.tsx"));
const Network = lazy(() => import("./pages/app/Network.tsx"));
const Cases = lazy(() => import("./pages/app/Cases.tsx"));
const Catalog = lazy(() => import("./pages/app/Catalog.tsx"));
const CatalogDetail = lazy(() => import("./pages/app/CatalogDetail.tsx"));
const Bookings = lazy(() => import("./pages/app/Bookings.tsx"));
const Checkout = lazy(() => import("./pages/app/Checkout.tsx"));
const Community = lazy(() => import("./pages/app/Community.tsx").then((m) => ({ default: m.Community })));
const Admin = lazy(() => import("./pages/app/Admin.tsx"));
import { FxConverter, FxMarket } from "./pages/app/Fx.tsx";
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

class ToolbarErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.warn("[VlyToolbar] disabled:", err.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string; stack: string }> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) { return { hasError: true, message: error.message || "Unknown error", stack: error.stack || "" }; }
  componentDidCatch(err: Error) { console.error("[Preview] Root crash:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
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
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<AuthPage redirectAfterAuth="/dashboard" />} />
              <Route path="/login" element={<AuthPage redirectAfterAuth="/dashboard" />} />
              <Route path="/register" element={<AuthPage redirectAfterAuth="/dashboard" />} />
              <Route path="/dashboard" element={<App title="Your dashboard" sub="Welcome back — your data, bookings, and findings at a glance."><Overview /></App>} />
              <Route path="/catalog" element={<App title="Service catalog" sub="Browse what we can do for you, then book or buy in one click."><Catalog /></App>} />
              <Route path="/catalog/:id" element={<App title="Service details" sub="Book a time, pay securely, ask questions."><CatalogDetail /></App>} />
              <Route path="/bookings" element={<App title="Bookings" sub="Schedule a session and manage your calendar."><Bookings /></App>} />
              <Route path="/checkout" element={<App title="Checkout" sub="Transparent pricing, instant receipts."><Checkout /></App>} />
              <Route path="/community" element={<App title="Community" sub="Post your data, ask anything, help each other out."><Community /></App>} />
              <Route path="/admin" element={<App title="Admin area" sub="Bookings, orders, posts, workspace, audit — everything in one place."><Admin /></App>} />
              <Route path="/domestic" element={<App title="Domestic monitoring" sub="Indian transfers — filter by channel, category, priority."><Overview /></App>} />
              <Route path="/international" element={<App title="International monitoring" sub="Cross-border legs, corridors, intermediaries."><Overview /></App>} />
              <Route path="/datasets" element={<App title="Datasets" sub="Upload any CSV, confirm mapping, inspect quality."><Datasets /></App>} />
              <Route path="/datasets/new" element={<App title="New dataset" sub="CSV upload and synthetic import entry point."><Datasets /></App>} />
              <Route path="/datasets/:id" element={<App title="Dataset detail" sub="Quality, rows, manifest, exports."><DatasetDetail /></App>} />
              <Route path="/studio" element={<App title="Synthetic studio" sub="Deterministic generation with planted scenarios and manifests."><Studio /></App>} />
              <Route path="/demo" element={<App title="Demo" sub="Synthetic-data demonstration, explicitly labelled."><Studio /></App>} />
              <Route path="/monitoring" element={<App title="Monitoring" sub="Run jobs, review results."><Detections /></App>} />
              <Route path="/detections" element={<App title="Detections" sub="Explainable alerts with transaction evidence."><Detections /></App>} />
              <Route path="/detections/:id" element={<App title="Alert evidence" sub="Signals, timeline, checks, limitations."><Detections /></App>} />
              <Route path="/network" element={<App title="Network" sub="Account and entity relationships from actual transfers."><Network /></App>} />
              <Route path="/flows" element={<App title="Fund flows" sub="Domestic and international flow explorer."><Network /></App>} />
              <Route path="/entities" element={<App title="Entities" sub="Accounts ranked by connectivity with in/out flows."><Network /></App>} />
              <Route path="/entities/:id" element={<App title="Entity profile" sub="Connectivity, flows, linked alerts."><Network /></App>} />
              <Route path="/fx-market" element={<App title="FX market" sub="Genuine provider quotes with labelled freshness."><FxMarketWrap /></App>} />
              <Route path="/fx-converter" element={<App title="Currency converter" sub="Direction-checked conversion with history."><FxConverterWrap /></App>} />
              <Route path="/fx-history" element={<App title="FX history" sub="Daily reference observations — never fabricated intraday."><FxMarketWrap /></App>} />
              <Route path="/investigations" element={<App title="Investigations" sub="Cases, notes, status, audit."><Cases /></App>} />
              <Route path="/investigations/:id" element={<App title="Case workbench" sub="Notes and status persist."><Cases /></App>} />
              <Route path="/rules" element={<App title="Detection rules" sub="Enable, threshold, version."><GovWrap view="rules" /></App>} />
              <Route path="/models" element={<App title="Models" sub="Methods, features, limitations."><GovWrap view="models" /></App>} />
              <Route path="/evaluation" element={<App title="Evaluation" sub="Measured precision/recall or 'Not evaluated yet'."><GovWrap view="evaluation" /></App>} />
              <Route path="/reports" element={<App title="Reports" sub="Exports of real results."><GovWrap view="reports" /></App>} />
              <Route path="/audit" element={<App title="Audit" sub="Case events."><Cases /></App>} />
              <Route path="/settings" element={<App title="Settings" sub="Integrations, retention, modes."><GovWrap view="settings" /></App>} />
              <Route path="/governance" element={<App title="Governance" sub="Rules, models, evaluation, reports, settings."><GovWrap view="governance" /></App>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);

function FxMarketWrap() {
  return <FxMarket />;
}
function FxConverterWrap() {
  return <FxConverter />;
}
function GovWrap({ view }: { view: string }) {
  const G = React.lazy(() => import("./pages/app/Governance.tsx"));
  return (
    <Suspense fallback={<div className="text-sm text-neutral-400">Loading…</div>}>
      <G view={view} />
    </Suspense>
  );
}
