import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import Auth from "./pages/Auth";
import { TradeDashboard, JobEditor, ProductCatalog, MyJobs, HardwareStore, TradeSettings } from "./pages/trade";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminJobs from "./pages/admin/Jobs";
import AdminJobDetail from "./pages/admin/JobDetail";
import AdminCustomers from "./pages/admin/Customers";
import AdminPrices from "./pages/admin/Prices";
import AdminSettings from "./pages/admin/Settings";
import AdminReports from "./pages/admin/Reports";
import ProductVisibility from "./pages/admin/ProductVisibility";
import PartsPricing from "./pages/admin/pricing/PartsPricing";
import HardwarePricing from "./pages/admin/pricing/HardwarePricing";
import MaterialPricing from "./pages/admin/pricing/MaterialPricing";
import EdgePricing from "./pages/admin/pricing/EdgePricing";
import BenchtopPricing from "./pages/admin/pricing/BenchtopPricing";
import DoorDrawerPricing from "./pages/admin/pricing/DoorDrawerPricing";
import LaborRates from "./pages/admin/pricing/LaborRates";
import ClientMarkups from "./pages/admin/pricing/ClientMarkups";
import MicrovellumImport from "./pages/admin/pricing/MicrovellumImport";
import DXFImport from "./pages/admin/pricing/DXFImport";
import SupplierImport from "./pages/admin/pricing/SupplierImport";
import SupplierFeeds from "./pages/admin/pricing/SupplierFeeds";
import AdminAnalytics from "./pages/admin/Analytics";
import NotFound from "./pages/NotFound";
import DevNavBar from "./components/DevNavBar";
import QuoteStatus from "./pages/homeowner/QuoteStatus";
import AdminLeads from "./pages/admin/Leads";

// Lazy-load all pages that import @react-three/drei (directly or transitively)
// so the CJS pre-bundle issue doesn't block the initial startup chain.
const RoomPlanner = React.lazy(() => import("./pages/trade/RoomPlanner"));
const ProductConfigurator = React.lazy(() => import("./pages/trade/ProductConfigurator"));
const HomeownerWizard = React.lazy(() => import("./pages/homeowner/Wizard"));
const ScanRoom = React.lazy(() => import("./pages/homeowner/ScanRoom"));

const LazyFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-900">
    <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
  </div>
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
          {import.meta.env.DEV && <DevNavBar />}
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/trade/dashboard" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/wizard" element={<Suspense fallback={<LazyFallback />}><HomeownerWizard /></Suspense>} />
              <Route path="/wizard/scan" element={<Suspense fallback={<LazyFallback />}><ScanRoom /></Suspense>} />
              <Route path="/quote/:jobId" element={<QuoteStatus />} />

              <Route path="/trade-planner" element={<Navigate to="/trade/dashboard" replace />} />
              <Route path="/consumer" element={<Navigate to="/trade/dashboard" replace />} />
              <Route path="/consumer/dashboard" element={<Navigate to="/trade/dashboard" replace />} />

              {/* Trade Routes */}
              <Route path="/trade" element={<ProtectedRoute requireUserType="trade"><Navigate to="/trade/dashboard" replace /></ProtectedRoute>} />
              <Route path="/trade/dashboard" element={<ProtectedRoute requireUserType="trade"><TradeDashboard /></ProtectedRoute>} />
              <Route path="/trade/jobs" element={<ProtectedRoute requireUserType="trade"><MyJobs /></ProtectedRoute>} />
              <Route path="/trade/job/:jobId" element={<ProtectedRoute requireUserType="trade"><JobEditor /></ProtectedRoute>} />
              <Route path="/trade/catalog" element={<ProtectedRoute requireUserType="trade"><ProductCatalog /></ProtectedRoute>} />
              <Route path="/trade/job/:jobId/room/:roomId/configure/:productId" element={<ProtectedRoute requireUserType="trade"><Suspense fallback={<LazyFallback />}><ProductConfigurator /></Suspense></ProtectedRoute>} />
              <Route path="/trade/job/:jobId/room/:roomId/planner" element={<ProtectedRoute requireUserType="trade"><Suspense fallback={<LazyFallback />}><RoomPlanner /></Suspense></ProtectedRoute>} />
              <Route path="/trade/job/:jobId/room/:roomId/catalog" element={<ProtectedRoute requireUserType="trade"><ProductCatalog /></ProtectedRoute>} />
              <Route path="/trade/hardware" element={<ProtectedRoute requireUserType="trade"><HardwareStore /></ProtectedRoute>} />
              <Route path="/trade/settings" element={<ProtectedRoute requireUserType="trade"><TradeSettings /></ProtectedRoute>} />

              {/* Admin Routes */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="leads" element={<AdminLeads />} />
                <Route path="jobs" element={<AdminJobs />} />
                <Route path="jobs/:id" element={<AdminJobDetail />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="products" element={<ProductVisibility />} />
                <Route path="prices" element={<AdminPrices />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="pricing/parts" element={<PartsPricing />} />
                <Route path="pricing/hardware" element={<HardwarePricing />} />
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
          </ErrorBoundary>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
