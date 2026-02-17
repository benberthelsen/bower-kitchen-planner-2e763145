import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import TradePlanner from "./pages/TradePlanner";
import { TradeDashboard, JobEditor, ProductCatalog, ProductConfigurator, RoomPlanner, MyJobs, HardwareStore, TradeSettings } from "./pages/trade";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminJobs from "./pages/admin/Jobs";
import AdminJobDetail from "./pages/admin/JobDetail";
import AdminCustomers from "./pages/admin/Customers";
import AdminPrices from "./pages/admin/Prices";
import AdminSettings from "./pages/admin/Settings";
import ProductVisibility from "./pages/admin/ProductVisibility";
import PartsPricing from "./pages/admin/pricing/PartsPricing";
import HardwarePricing from "./pages/admin/pricing/HardwarePricing";
import MaterialPricing from "./pages/admin/pricing/MaterialPricing";
import EdgePricing from "./pages/admin/pricing/EdgePricing";
import StonePricing from "./pages/admin/pricing/StonePricing";
import DoorDrawerPricing from "./pages/admin/pricing/DoorDrawerPricing";
import LaborRates from "./pages/admin/pricing/LaborRates";
import ClientMarkups from "./pages/admin/pricing/ClientMarkups";
import MicrovellumImport from "./pages/admin/pricing/MicrovellumImport";
import DXFImport from "./pages/admin/pricing/DXFImport";
import NotFound from "./pages/NotFound";
import DevNavBar from "./components/DevNavBar";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="flex flex-col min-h-screen">
          <DevNavBar />
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              
              {/* Legacy Trade Planner (3D Scene) */}
              <Route path="/trade-planner" element={<TradePlanner />} />
              
              {/* Consumer / DIY Routes */}
              <Route path="/consumer" element={<Navigate to="/consumer/dashboard" replace />} />
              <Route
                path="/consumer/dashboard"
                element={(
                  <ProtectedRoute requireUserType="consumer">
                    <Index />
                  </ProtectedRoute>
                )}
              />

              {/* New Trade Dashboard Routes */}
              <Route
                path="/trade"
                element={(
                  <ProtectedRoute requireUserType="trade">
                    <Navigate to="/trade/dashboard" replace />
                  </ProtectedRoute>
                )}
              />
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
              <Route path="jobs" element={<AdminJobs />} />
              <Route path="jobs/:id" element={<AdminJobDetail />} />
              <Route path="customers" element={<AdminCustomers />} />
              <Route path="products" element={<ProductVisibility />} />
              <Route path="prices" element={<AdminPrices />} />
              <Route path="settings" element={<AdminSettings />} />
              {/* Pricing Management Routes */}
              <Route path="pricing/parts" element={<PartsPricing />} />
              <Route path="pricing/hardware" element={<HardwarePricing />} />
              <Route path="pricing/materials" element={<MaterialPricing />} />
              <Route path="pricing/edges" element={<EdgePricing />} />
              <Route path="pricing/stone" element={<StonePricing />} />
              <Route path="pricing/doors" element={<DoorDrawerPricing />} />
              <Route path="pricing/labor" element={<LaborRates />} />
              <Route path="pricing/markups" element={<ClientMarkups />} />
              <Route path="pricing/microvellum" element={<MicrovellumImport />} />
              <Route path="pricing/dxf-import" element={<DXFImport />} />
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;