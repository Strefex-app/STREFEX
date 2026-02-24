import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useSubscriptionStore } from './services/featureFlags'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import AnalyticsProvider from './components/AnalyticsProvider'
import UpgradePrompt from './components/UpgradePrompt'
import PWAUpdateBanner from './components/PWAUpdateBanner'
import AppLayout from './components/AppLayout'
import authService from './services/authService'
import { supabase } from './config/supabase'

/* ── Page imports ────────────────────────────────────────── */
import Login from './pages/Login'
import Register from './pages/Register'
import SubscriptionPlans from './pages/SubscriptionPlans'
import TeamManagement from './pages/TeamManagement'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Notifications from './pages/Notifications'
import Payment from './pages/Payment'
import Resources from './pages/Resources'
import Tasks from './pages/Tasks'
import Project from './pages/Project'
import MachineryIndustry from './pages/MachineryIndustry'
import ExecutiveSummary from './pages/ExecutiveSummary'
import IndustryHub from './pages/IndustryHub'
import IndustryOverview from './pages/IndustryOverview'
import IndustryEquipmentLanding from './pages/IndustryEquipmentLanding'
import Profile from './pages/Profile'
import AddSupplier from './pages/AddSupplier'
import AdminApproval from './pages/AdminApproval'
import ManagementHub from './pages/ManagementHub'
import ProjectManagement from './pages/ProjectManagement'
import ProjectDetail from './pages/ProjectDetail'
import EquipmentSupplierRequest from './pages/EquipmentSupplierRequest'
import ServiceList from './pages/ServiceList'
import AuditRequest from './pages/AuditRequest'
import CostManagement from './pages/CostManagement'
import CostCalculator from './pages/CostCalculator'
import CostBreakdown from './pages/CostBreakdown'
import CostScenarios from './pages/CostScenarios'
import CostTargets from './pages/CostTargets'
import EnterpriseManagement from './pages/EnterpriseManagement'
import EnterpriseFixedCosts from './pages/EnterpriseFixedCosts'
import EnterpriseVariableCosts from './pages/EnterpriseVariableCosts'
import EnterpriseSemiVariableCosts from './pages/EnterpriseSemiVariableCosts'
import EnterpriseDirectCosts from './pages/EnterpriseDirectCosts'
import EnterpriseIndirectCosts from './pages/EnterpriseIndirectCosts'
import EnterpriseOpex from './pages/EnterpriseOpex'
import EnterpriseCapex from './pages/EnterpriseCapex'
import EnterprisePersonnel from './pages/EnterprisePersonnel'
import EnterpriseFinancial from './pages/EnterpriseFinancial'
import EnterpriseExceptional from './pages/EnterpriseExceptional'
import EnterpriseRisk from './pages/EnterpriseRisk'
import EnterpriseProductCalc from './pages/EnterpriseProductCalc'
import ProductionManagement from './pages/ProductionManagement'
import Production5S from './pages/Production5S'
import ProductionISO9001 from './pages/ProductionISO9001'
import ProductionIATF16949 from './pages/ProductionIATF16949'
import ProductionVDA63 from './pages/ProductionVDA63'
import ProductionOEE from './pages/ProductionOEE'
import ProductionDowntime from './pages/ProductionDowntime'
import ProductionScrap from './pages/ProductionScrap'
import ProductionOutput from './pages/ProductionOutput'
import ProductionQualityKPIs from './pages/ProductionQualityKPIs'
import ProductionProcessAudit from './pages/ProductionProcessAudit'
import ProductionAuditHistory from './pages/ProductionAuditHistory'
import ProductionFloorLayout from './pages/ProductionFloorLayout'
import ProductionCertifications from './pages/ProductionCertifications'
import AuditQuestionnaire from './pages/AuditQuestionnaire'
import WorkCenterOutput from './pages/WorkCenterOutput'
import SystemManagement from './pages/SystemManagement'
import SystemManagementPage from './pages/SystemManagementPage'
import ProfileCalendar from './pages/ProfileCalendar'
import HeadcountManagement from './pages/HeadcountManagement'
import QualificationMatrix from './pages/QualificationMatrix'
import EmployeeGoals from './pages/EmployeeGoals'
import EmployeeDialogue from './pages/EmployeeDialogue'
import HRDocumentation from './pages/HRDocumentation'
import CommunitySupport from './pages/CommunitySupport'
import DeveloperDashboard from './pages/DeveloperDashboard'
import CompanyMessenger from './pages/CompanyMessenger'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import ServiceRequestManagement from './pages/ServiceRequestManagement'
import EquipmentHub from './pages/EquipmentHub'
import ProductHub from './pages/ProductHub'
import ServiceHub from './pages/ServiceHub'
import ProductIndustryLanding from './pages/ProductIndustryLanding'
import ProductSubcategoryPage from './pages/ProductSubcategoryPage'
import ProductExecutiveSummary from './pages/ProductExecutiveSummary'
import SellerDashboard from './pages/SellerDashboard'
import BuyerDashboard from './pages/BuyerDashboard'
import ServiceProviderDashboard from './pages/ServiceProviderDashboard'
import RfqComparison from './pages/RfqComparison'
import WalletPage from './pages/Wallet'
import SendPayment from './pages/SendPayment'
import VendorManagement from './pages/VendorManagement'
import VendorDetail from './pages/VendorDetail'
import ProcurementDashboard from './pages/ProcurementDashboard'
import ContractDashboard from './pages/ContractDashboard'
import SpendAnalysis from './pages/SpendAnalysis'
import ComplianceDashboard from './pages/ComplianceDashboard'
import AIInsights from './pages/AIInsights'
import ERPIntegrations from './pages/ERPIntegrations'
import TemplateLibrary from './pages/TemplateLibrary'
import AuditLogs from './pages/AuditLogs'

/* ── Shorthand wrappers ──────────────────────────────────── */
const P = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>
const Admin = ({ children }) => <ProtectedRoute requiredRole="admin">{children}</ProtectedRoute>
const SuperAdmin = ({ children }) => <ProtectedRoute requiredRole="superadmin">{children}</ProtectedRoute>

function PlanGate({ feature, planName, children, requiredRole }) {
  const hasFeature = useSubscriptionStore((s) => s.hasFeature)
  const inner = hasFeature(feature)
    ? children
    : <AppLayout><UpgradePrompt feature={feature.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())} requiredPlan={planName || 'a higher'} /></AppLayout>
  return requiredRole
    ? <ProtectedRoute requiredRole={requiredRole}>{inner}</ProtectedRoute>
    : <ProtectedRoute>{inner}</ProtectedRoute>
}

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    supabase.auth.getSession();
  }, []);

  useEffect(() => {
    authService.initSession().finally(() => setSessionChecked(true))

    // Listen for server-side session changes (sign-out from other tab, token revoked)
    const unsub = authService.onAuthStateChange((user) => {
      if (!user && useAuthStore.getState().isAuthenticated) {
        useAuthStore.getState().logout()
      }
    })
    return unsub
  }, [])

  // While verifying the session, show a minimal loading screen
  // to prevent flash of login page or unauthorized protected content
  if (!sessionChecked) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#fafbfc',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid #e0e0e0',
            borderTopColor: '#000888', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ color: '#888', fontSize: 14, margin: 0 }}>Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <PWAUpdateBanner />
      <Router>
        <AnalyticsProvider>
        <Routes>
          {/* ── Public ────────────────────────────────────── */}
          <Route path="/login" element={isAuthenticated ? <Navigate to="/main-menu" /> : <Login />} />
          <Route path="/register" element={isAuthenticated ? <Navigate to="/main-menu" /> : <Register />} />

          {/* ── Core pages ────────────────────────────────── */}
          <Route path="/main-menu" element={<P><Home /></P>} />
          <Route path="/settings" element={<P><Settings /></P>} />
          <Route path="/notifications" element={<P><Notifications /></P>} />
          <Route path="/payment" element={<P><Payment /></P>} />
          <Route path="/plans" element={<P><SubscriptionPlans /></P>} />
          <Route path="/team" element={<PlanGate feature="teamManagement" planName="Basic" requiredRole="admin"><TeamManagement /></PlanGate>} />
          <Route path="/resources" element={<P><Resources /></P>} />
          <Route path="/tasks" element={<P><Tasks /></P>} />
          <Route path="/project" element={<P><Project /></P>} />
          <Route path="/dashboard" element={<P><Dashboard /></P>} />
          <Route path="/seller-dashboard" element={<P><SellerDashboard /></P>} />
          <Route path="/buyer-dashboard" element={<P><BuyerDashboard /></P>} />
          <Route path="/service-provider-dashboard" element={<P><ServiceProviderDashboard /></P>} />
          <Route path="/rfq-comparison/:rfqId" element={<P><RfqComparison /></P>} />

          {/* ── Wallet & Payments ──────────────────────────── */}
          <Route path="/wallet" element={<P><WalletPage /></P>} />
          <Route path="/send-payment" element={<P><SendPayment /></P>} />

          {/* ── Vendor Management ────────────────────────── */}
          <Route path="/vendors" element={<P><VendorManagement /></P>} />
          <Route path="/vendors/:vendorId" element={<P><VendorDetail /></P>} />

          {/* ── Hub pages (Home → Category → Industries) ──── */}
          <Route path="/equipment-hub" element={<P><EquipmentHub /></P>} />
          <Route path="/product-hub" element={<P><ProductHub /></P>} />
          <Route path="/product-hub/:industryId" element={<P><ProductIndustryLanding /></P>} />
          <Route path="/product-hub/:industryId/:categoryId" element={<P><ProductSubcategoryPage /></P>} />
          <Route path="/product-hub/:industryId/:categoryId/:processId/executive-summary" element={<P><ProductExecutiveSummary /></P>} />
          <Route path="/service-hub" element={<P><ServiceHub /></P>} />

          {/* ── Industry routes ───────────────────────────── */}
          <Route path="/machinery-industry" element={<P><MachineryIndustry /></P>} />
          <Route path="/industry/:industryId" element={<P><IndustryHub /></P>} />
          <Route path="/industry/:industryId/overview" element={<P><IndustryOverview /></P>} />
          <Route path="/industry/:industryId/dashboard" element={<P><Dashboard /></P>} />
          <Route path="/industry/:industryId/equipment" element={<P><IndustryEquipmentLanding /></P>} />
          <Route path="/industry/:industryId/equipment/:categoryId/executive-summary" element={<P><ExecutiveSummary /></P>} />

          {/* ── Management Hub ────────────────────────────── */}
          <Route path="/management" element={<P><ManagementHub /></P>} />

          {/* ── Projects ──────────────────────────────────── */}
          <Route path="/project-management" element={<P><ProjectManagement /></P>} />
          <Route path="/project-management/project/:projectId" element={<P><ProjectDetail /></P>} />

          {/* ── Services & suppliers ──────────────────────── */}
          <Route path="/equipment-request" element={<P><EquipmentSupplierRequest /></P>} />
          <Route path="/industry/:industryId/equipment-request" element={<P><EquipmentSupplierRequest /></P>} />
          <Route path="/services" element={<P><ServiceList /></P>} />
          <Route path="/industry/:industryId/services" element={<P><ServiceList /></P>} />
          <Route path="/audit-request" element={<P><AuditRequest /></P>} />
          <Route path="/industry/:industryId/audit-request" element={<P><AuditRequest /></P>} />
          <Route path="/executive-summary" element={<P><ExecutiveSummary /></P>} />
          <Route path="/industry/:industryId/executive-summary" element={<P><ExecutiveSummary /></P>} />

          {/* ── Profile ───────────────────────────────────── */}
          <Route path="/profile" element={<P><Profile /></P>} />
          <Route path="/profile/calendar" element={<P><ProfileCalendar /></P>} />
          <Route path="/request-service" element={<P><ServiceList /></P>} />
          <Route path="/add-supplier" element={<P><AddSupplier /></P>} />

          {/* ── Admin (role-protected) ────────────────────── */}
          <Route path="/admin/approvals" element={<Admin><AdminApproval /></Admin>} />
          <Route path="/admin/approve/:id" element={<Admin><AdminApproval /></Admin>} />

          {/* ── Communication & Support ────────────────────── */}
          <Route path="/support" element={<P><CommunitySupport /></P>} />
          <Route path="/messenger" element={<PlanGate feature="messenger" planName="Premium"><CompanyMessenger /></PlanGate>} />
          <Route path="/service-requests" element={<ProtectedRoute requiredRole="manager"><ServiceRequestManagement /></ProtectedRoute>} />
          <Route path="/developer" element={<SuperAdmin><DeveloperDashboard /></SuperAdmin>} />
          <Route path="/admin-dashboard" element={<SuperAdmin><SuperAdminDashboard /></SuperAdmin>} />

          {/* ── Cost Management (Premium only) ────────────── */}
          <Route path="/cost-management" element={<PlanGate feature="costManagement" planName="Premium"><CostManagement /></PlanGate>} />
          <Route path="/cost-management/calculator" element={<PlanGate feature="costManagement" planName="Premium"><CostCalculator /></PlanGate>} />
          <Route path="/cost-management/bom" element={<PlanGate feature="costManagement" planName="Premium"><CostCalculator /></PlanGate>} />
          <Route path="/cost-management/breakdown" element={<PlanGate feature="costManagement" planName="Premium"><CostBreakdown /></PlanGate>} />
          <Route path="/cost-management/comparison" element={<PlanGate feature="costManagement" planName="Premium"><CostBreakdown /></PlanGate>} />
          <Route path="/cost-management/scenarios" element={<PlanGate feature="costManagement" planName="Premium"><CostScenarios /></PlanGate>} />
          <Route path="/cost-management/targets" element={<PlanGate feature="costManagement" planName="Premium"><CostTargets /></PlanGate>} />

          {/* ── Enterprise Management (Enterprise plan only) ── */}
          <Route path="/enterprise" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseManagement /></PlanGate>} />
          <Route path="/enterprise/fixed-costs" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseFixedCosts /></PlanGate>} />
          <Route path="/enterprise/variable-costs" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseVariableCosts /></PlanGate>} />
          <Route path="/enterprise/semi-variable-costs" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseSemiVariableCosts /></PlanGate>} />
          <Route path="/enterprise/direct-costs" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseDirectCosts /></PlanGate>} />
          <Route path="/enterprise/indirect-costs" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseIndirectCosts /></PlanGate>} />
          <Route path="/enterprise/opex" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseOpex /></PlanGate>} />
          <Route path="/enterprise/capex" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseCapex /></PlanGate>} />
          <Route path="/enterprise/personnel" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterprisePersonnel /></PlanGate>} />
          <Route path="/enterprise/financial" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseFinancial /></PlanGate>} />
          <Route path="/enterprise/exceptional" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseExceptional /></PlanGate>} />
          <Route path="/enterprise/risk" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseRisk /></PlanGate>} />
          <Route path="/enterprise/product-calculation" element={<PlanGate feature="enterpriseManagement" planName="Enterprise"><EnterpriseProductCalc /></PlanGate>} />

          {/* ── Production Management (Premium only) ────────── */}
          <Route path="/production" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionManagement /></PlanGate>} />
          <Route path="/production/5s" element={<PlanGate feature="productionManagement" planName="Premium"><Production5S /></PlanGate>} />
          <Route path="/production/iso9001" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionISO9001 /></PlanGate>} />
          <Route path="/production/iatf16949" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionIATF16949 /></PlanGate>} />
          <Route path="/production/vda63" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionVDA63 /></PlanGate>} />
          <Route path="/production/oee" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionOEE /></PlanGate>} />
          <Route path="/production/downtime" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionDowntime /></PlanGate>} />
          <Route path="/production/scrap" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionScrap /></PlanGate>} />
          <Route path="/production/output" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionOutput /></PlanGate>} />
          <Route path="/production/quality-kpis" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionQualityKPIs /></PlanGate>} />
          <Route path="/production/process-audit" element={<PlanGate feature="auditManagement" planName="Premium"><ProductionProcessAudit /></PlanGate>} />
          <Route path="/production/audit-history" element={<PlanGate feature="auditManagement" planName="Premium"><ProductionAuditHistory /></PlanGate>} />
          <Route path="/production/floor-layout" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionFloorLayout /></PlanGate>} />
          <Route path="/production/certifications" element={<PlanGate feature="productionManagement" planName="Premium"><ProductionCertifications /></PlanGate>} />
          <Route path="/production/audit-questionnaire" element={<PlanGate feature="auditManagement" planName="Premium"><AuditQuestionnaire /></PlanGate>} />
          <Route path="/production/workcenter-output" element={<PlanGate feature="productionManagement" planName="Premium"><WorkCenterOutput /></PlanGate>} />
          <Route path="/production/system-management" element={<PlanGate feature="productionManagement" planName="Premium"><SystemManagement /></PlanGate>} />
          <Route path="/production/system/:systemId" element={<PlanGate feature="productionManagement" planName="Premium"><SystemManagementPage /></PlanGate>} />

          {/* ── Headcount Management ──────────────────────── */}
          <Route path="/production/headcount" element={<P><HeadcountManagement /></P>} />
          <Route path="/production/headcount/qualification-matrix" element={<P><QualificationMatrix /></P>} />
          <Route path="/production/headcount/goals" element={<P><EmployeeGoals /></P>} />
          <Route path="/production/headcount/dialogue" element={<P><EmployeeDialogue /></P>} />
          <Route path="/production/headcount/hr-docs" element={<P><HRDocumentation /></P>} />
          <Route path="/production/headcount/training" element={<P><HeadcountManagement /></P>} />
          <Route path="/production/headcount/workforce" element={<P><HeadcountManagement /></P>} />
          <Route path="/production/headcount/onboarding" element={<P><HeadcountManagement /></P>} />
          <Route path="/production/headcount/attendance" element={<P><HeadcountManagement /></P>} />

          {/* ── Buyer Features (company-isolated, role-guarded) ── */}
          <Route path="/procurement" element={<PlanGate feature="procurement" planName="Enterprise"><ProcurementDashboard /></PlanGate>} />
          <Route path="/contracts" element={<PlanGate feature="contractManagement" planName="Enterprise"><ContractDashboard /></PlanGate>} />
          <Route path="/spend-analysis" element={<PlanGate feature="spendAnalysis" planName="Enterprise" requiredRole="manager"><SpendAnalysis /></PlanGate>} />
          <Route path="/compliance" element={<PlanGate feature="complianceEsg" planName="Enterprise"><ComplianceDashboard /></PlanGate>} />
          <Route path="/ai-insights" element={<PlanGate feature="aiInsights" planName="Enterprise" requiredRole="manager"><AIInsights /></PlanGate>} />
          <Route path="/erp-integrations" element={<PlanGate feature="erpIntegrations" planName="Enterprise" requiredRole="admin"><ERPIntegrations /></PlanGate>} />
          <Route path="/templates" element={<PlanGate feature="templateLibrary" planName="Enterprise"><TemplateLibrary /></PlanGate>} />
          <Route path="/audit-logs" element={<PlanGate feature="auditLogs" planName="Enterprise" requiredRole="admin"><AuditLogs /></PlanGate>} />

          {/* ── Catch-all ─────────────────────────────────── */}
          <Route path="/" element={<Navigate to={isAuthenticated ? "/main-menu" : "/login"} />} />
          <Route path="*" element={
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: '60vh', gap: 12, color: '#666',
            }}>
              <h2 style={{ margin: 0, fontSize: 48, color: '#333' }}>404</h2>
              <p style={{ margin: 0, fontSize: 16 }}>Page not found</p>
            </div>
          } />
        </Routes>
        </AnalyticsProvider>
      </Router>
    </ErrorBoundary>
  )
}

export default App
