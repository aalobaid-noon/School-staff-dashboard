import { type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SynapseConnection } from '@/components/synapse-connection';
import { SummaryPanel } from '@/components/summary-panel';
import { NoonSignIn } from '@/components/noon-sign-in';
import NotFound from '@/pages/not-found';
import { Database, Languages } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const isArabic = language === 'ar';

  return (
    <div className={`first-run ${isArabic ? 'rtl' : ''}`} dir={isArabic ? 'rtl' : 'ltr'} lang={language}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 17.5V11a3.1 3.1 0 0 1 6.2 0v6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="14.8" cy="14.3" r="3.1" stroke="currentColor" strokeWidth="2.4" />
              <circle cx="19.2" cy="5.1" r="2.3" fill="#bc5a37" />
            </svg>
          </div>
          <div>
            <div className="brand-name">noon</div>
            <div className="brand-caption">{isArabic ? 'تقارير إدارة المدارس' : 'School manager reporting'}</div>
          </div>
        </div>
        <div className="header-tools">
          <NoonSignIn isArabic={isArabic} compact />
          <button
            className="lang-toggle"
            type="button"
            data-testid="button-language-toggle"
            onClick={() => setLanguage(isArabic ? 'en' : 'ar')}
            aria-label={isArabic ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            <Languages size={15} strokeWidth={1.8} />
            {isArabic ? 'English' : 'العربية'}
          </button>
        </div>
      </header>

      <main className="page-shell">
        <div className="eyebrow" data-testid="text-dashboard-kicker">
          <span className="eyebrow-line" />
          {isArabic ? 'لوحة تقارير المدارس' : 'School reporting dashboard'}
        </div>
        <section className="intro-row" aria-labelledby="page-title">
          <div className="intro-copy">
            <h1 id="page-title" data-testid="text-page-title">
              {isArabic ? 'تقارير المدارس عبر دخول Noon الآمن.' : 'School reports, secured with Noon.'}
            </h1>
            <p data-testid="text-page-intro">
              {isArabic
                ? 'سجّل الدخول بحساب Noon لعرض تقارير المدارس المصرّح لك بها عند توفر بياناتها.'
                : 'Sign in with Noon to access reports for your assigned schools when reporting data is available.'}
            </p>
          </div>
          <div className="status-chip" data-testid="status-live">
            <span className="status-dot" />
            {isArabic ? 'دخول آمن' : 'Secure access'}
          </div>
        </section>

        <section className="workspace-card" aria-labelledby="workspace-title">
          <div className="card-heading">
            <div className="card-heading-label">
              <Database className="heading-icon" size={17} strokeWidth={1.8} />
              <span id="workspace-title">{isArabic ? 'ملخص المدارس' : 'School summary'}</span>
            </div>
            <span className="card-heading-note">{isArabic ? 'يُفحص كل دقيقة' : 'Status checked every minute'}</span>
          </div>
          <div className="card-body">
            <SummaryPanel isArabic={isArabic} />
            <SynapseConnection isArabic={isArabic} />
          </div>
        </section>
      </main>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
