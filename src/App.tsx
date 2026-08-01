import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import { featureFlags } from "@/lib/featureFlags";

// Every page is route-split. The previous eager admin/trade imports made a
// first-time homeowner download the entire back office before seeing step 1.
const Auth = React.lazy(() => import("./pages/Auth"));
const TradeDashboard = React.lazy(() => import("./pages/trade/TradeDashboard"));
const JobEditor = React.lazy(() => import("./pages/trade/JobEditor"));
const ProductCatalog = React.lazy(() => import("./pages/trade/ProductCatalog"));
const MyJobs = React.lazy(() => import("./pages/trade/MyJobs"));
const HardwareStore = React.lazy(() => import("./pages/trade/HardwareStore"));
const TradeSettings = React.lazy(() => import("./pages/trade/TradeSettings"));
const RoomPlanner = React.lazy(() => import("./pages/trade/RoomPlanner"));
const ProductConfigurator = React.lazy(() => import("./pages/trade/ProductConfigurator"));
const HomeownerWizard = React.lazy(() => import("./pages/homeowner/Wizard"));
const ScanRoom = React.lazy(() => import("./pages/homeowner/ScanRoom"));
const ViewInRoomAr = React.lazy(() => import("./pages/homeowner/ViewInRoomAr"));
const QuoteStatus = React.lazy(() => import("./pages/homeowner/QuoteStatus"));
const AdminLayout = React.lazy(() => import("./components/admin/AdminLayout"));
const AdminDashboard = React.lazy(() => import("./pages/admin/Dashboard"));
const AdminJobs = React.lazy(() => import("./pages/admin/Jobs"));
const AdminJobDetail = React.lazy(() => import("./pages/admin/JobDetail"));
const AdminCustomers = React.lazy(() => import("./pages/admin/Customers"));
const AdminPrices = React.lazy(() => import("./pages/admin/Prices"));
const AdminSettings = React.lazy(() => import("./pages/admin/Settings"));
const AdminReports = React.lazy(() => import("./pages/admin/Reports"));
const ProductVisibility = React.lazy(() => import("./pages/admin/ProductVisibility"));
const PartsPricing = React.lazy(() => import("./pages/admin/pricing/PartsPricing"));
const HardwarePricing = React.lazy(() => import("./pages/admin/pricing/HardwarePricing"));
const ApplianceCatalogAdmin = React.lazy(() => import("./pages/admin/pricing/ApplianceCatalog"));
const MaterialPricing = React.lazy(() => import("./pages/admin/pricing/MaterialPricing"));
const EdgePricing = React.lazy(() => import("./pages/admin/pricing/EdgePricing"));
const BenchtopPricing = React.lazy(() => import("./pages/admin/pricing/BenchtopPricing"));
const DoorDrawerPricing = React.lazy(() => import("./pages/admin/pricing/DoorDrawerPricing"));
const LaborRates = React.lazy(() => import("./pages/admin/pricing/LaborRates"));
const ClientMarkups = React.lazy(() => import("./pages/admin/pricing/ClientMarkups"));
const MicrovellumImport = React.lazy(() => import("./pages/admin/pricing/MicrovellumImport"));
const DXFImport = React.lazy(() => import("./pages/admin/pricing/DXFImport"));
const SupplierImport = React.lazy(() => import("./pages/admin/pricing/SupplierImport"));
const SupplierFeeds = React.lazy(() => import("./pages/admin/pricing/SupplierFeeds"));
const AdminAnalytics = React.lazy(() => import("./pages/admin/Analytics"));
const AdminLeads = React.lazy(() => import("./pages/admin/Leads"));
const AdminDesignRules = React.lazy(() => import("./pages/admin/DesignRules"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const DevNavBar = React.lazy(() => import("./components/DevNavBar"));

const LazyFallback = () => (
  <main className="flex min-h-screen items-center justify-center bg-white" role="status" aria-label="Loading planner">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" />
  </main>
);

const FeatureUnavailable = ({ title, message }: { title: string; message: string }) => (
  <main className="min-h-screen bg-slate-950 px-5 py-16 text-white">
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">Planner fallback</p>
      <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">{message}</p>
      <Link
        to="/wizard"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
      >
        Continue with the planner
      </Link>
    </div>
  </main>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="flex flex-col min-h-screen">
          {import.meta.env.DEV && <Suspense fallback={null}><DevNavBar /></Suspense>}
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/wizard" replace />} />
              <Route path="/index" element={<Navigate to="/wizard" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/wizard" element={<HomeownerWizard />} />
              <Route
                path="/wizard/scan"
                element={featureFlags.roomScanner
                  ? <ScanRoom />
                  : <FeatureUnavailable title="Room scanning is temporarily unavailable" message="Enter or adjust your measurements manually so you can keep planning without losing your work." />}
              />
              <Route
                path="/wizard/view-ar"
                element={featureFlags.androidAr
                  ? <ViewInRoomAr />
                  : <FeatureUnavailable title="Room view is temporarily unavailable" message="Your kitchen design is still safe. Return to the planner to keep using the normal 3D view." />}
              />
              <Route path="/quote/:jobId" element={<QuoteStatus />} />

              <Route path="/trade-planner" element={<Navigate to="/trade/dashboard" replace />} />
              <Route path="/consumer" element={<Navigate to="/wizard" replace />} />
              <Route path="/consumer/dashboard" element={<Navigate to="/wizard" replace />} />

              {/* Trade Routes */}
              <Route path="/trade" element={<ProtectedRoute requireUserType="trade"><Navigate to="/trade/dashboard" replace /></ProtectedRoute>} />
              <Route path="/trade/dashboard" element={<ProtectedRoute requireUserType="trade"><TradeDashboard /></ProtectedRoute>} />
              <Route path="/trade/jobs" element={<ProtectedRoute requireUserType="trade"><MyJobs /></ProtectedRoute>} />
              <Route path="/trade/job/:jobId" element={<ProtectedRoute requireUserType="trade"><JobEditor /></ProtectedRoute>} />
              <Route path="/trade/catalog" element={<ProtectedRoute requireUserType="trade"><ProductCatalog /></ProtectedRoute>} />
              <Route path="/trade/job/:jobId/room/:roomId/configure/:productId" element={<ProtectedRoute requireUserType="trade"><ProductConfigurator /></ProtectedRoute>} />
              <Route path="/trade/job/:jobId/room/:roomId/planner" element={<ProtectedRoute requireUserType="trade"><RoomPlanner /></ProtectedRoute>} />
              <Route path="/trade/job/:jobId/room/:roomId/catalog" element={<ProtectedRoute requireUserType="trade"><ProductCatalog /></ProtectedRoute>} />
              <Route path="/trade/hardware" element={<ProtectedRoute requireUserType="trade"><HardwareStore /></ProtectedRoute>} />
              <Route path="/trade/settings" element={<ProtectedRoute requireUserType="trade"><TradeSettings /></ProtectedRoute>} />

              {/* Admin Routes */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="leads" element={<AdminLeads />} />
                <Route path="design-rules" element={<AdminDesignRules />} />
                <Route path="jobs" element={<AdminJobs />} />
                <Route path="jobs/:id" element={<AdminJobDetail />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="products" element={<ProductVisibility />} />
                <Route path="prices" element={<AdminPrices />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="pricing/parts" element={<PartsPricing />} />
                <Route path="pricing/hardware" element={<HardwarePricing />} />
                <Route path="pricing/appliances" element={<ApplianceCatalogAdmin />} />
                <Route path="pricing/materials" element={<MaterialPricing />} />
                <Route path="pricing/edges" element={<EdgePricing />} />
                <Route path="pricing/stone" element={<BenchtopPricing />} />
                <Route path="pricing/doors" element={<DoorDrawerPricing />} />
                <Route path="pricing/labor" element={<LaborRates />} />
                <Route path="pricing/markups" element={<ClientMarkups />} />
                <Route path="pricing/microvellum" element={<MicrovellumImport />} />
                <Route path="pricing/dxf-import" element={<DXFImport />} />
                <Route path="pricing/supplier-import" element={<SupplierImport />} />
                <Route path="pricing/supplier-feeds" element={<SupplierFeeds />} />
                <Route path="analytics" element={<AdminAnalytics />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
