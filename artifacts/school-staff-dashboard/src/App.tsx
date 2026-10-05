import { type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AlertCircle, ArrowDown, Check, Copy, Database, FileJson2, FolderOpen, Languages, LockKeyhole } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [copied, setCopied] = useState(false);
  const isArabic = language === 'ar';

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText('python3 source/build.py');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  const copyLabel = copied
    ? (isArabic ? 'تم النسخ' : 'Copied')
    : (isArabic ? 'نسخ الأمر' : 'Copy command');

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
          <span className="env-label">{isArabic ? 'مساحة داخلية' : 'Internal workspace'}</span>
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
              {isArabic ? 'نظرة واضحة، تبدأ ببيانات موثوقة.' : 'Clear oversight starts with trusted data.'}
            </h1>
            <p data-testid="text-page-intro">
              {isArabic
                ? 'مساحة عمل قادة المدارس جاهزة. استورد مصدر GitHub، لكن مستخرج البيانات الخاص غير موجود هنا بعد.'
                : 'The school-leadership workspace is ready. The GitHub source has been imported, but its private data extract is not present here yet.'}
            </p>
          </div>
          <div className="status-chip" data-testid="status-data-missing">
            <span className="status-dot" />
            {isArabic ? 'بانتظار البيانات الخاصة' : 'Private data required'}
          </div>
        </section>

        <section className="workspace-card" aria-labelledby="workspace-title">
          <div className="card-heading">
            <div className="card-heading-label">
              <Database className="heading-icon" size={17} strokeWidth={1.8} />
              <span id="workspace-title">{isArabic ? 'حالة مساحة العمل' : 'Workspace status'}</span>
            </div>
            <span className="card-heading-note">{isArabic ? 'إعداد لمرة واحدة' : 'One-time setup'}</span>
          </div>
          <div className="card-body">
            <div className="missing-grid">
              <div className="missing-copy">
                <h2>{isArabic ? 'مصدر التطبيق موجود. البيانات غير متاحة.' : 'The app source is here. The data is not.'}</h2>
                <p>
                  {isArabic
                    ? 'تم استيراد ملفات لوحة Noon من GitHub. يتطلب العرض بيانات حقيقية من مستخرج خاص؛ ولم يتم توفير هذا الملف في هذه المساحة. لن تظهر أي أرقام أو أسماء إلى أن تضيفه.'
                    : 'The Noon dashboard source has been imported from GitHub. A real, privately supplied extract is required to render the reporting view. No figures or names will appear until that file is provided.'}
                </p>
              </div>
              <div className="missing-visual" aria-hidden="true">
                <div className="visual-sheet"><span /><span /><span /><span /><span /></div>
                <div className="visual-badge"><AlertCircle size={17} strokeWidth={2} /></div>
              </div>
            </div>

            <div className="flow-label">{isArabic ? 'الخطوة التالية' : 'Next step'}</div>
            <div className="steps">
              <div className="step">
                <div className="step-number">01</div>
                <div>
                  <div className="step-title">{isArabic ? 'أضف مستخرج البيانات بأمان' : 'Supply the private extract'}</div>
                  <div className="step-desc">
                    {isArabic ? 'ضع الملف في المسار المطلوب داخل نسخة المستودع.' : 'Place the file at the required path in the repository checkout.'}
                  </div>
                </div>
              </div>
              <div className="step">
                <div className="step-number">02</div>
                <div>
                  <div className="step-title">{isArabic ? 'أنشئ ملفات لوحة البيانات' : 'Build the dashboard files'}</div>
                  <div className="step-desc">
                    {isArabic ? 'شغّل أمر البناء من جذر المستودع.' : 'Run the build command from the repository root.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="command-panel">
              <div>
                <div className="command-label">{isArabic ? 'الأمر من جذر المستودع' : 'Run from repository root'}</div>
                <code className="command-text">python3 source/build.py</code>
              </div>
              <button
                className="copy-button"
                type="button"
                onClick={copyCommand}
                data-testid="button-copy-command"
                aria-live="polite"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copyLabel}
              </button>
            </div>

            <div className="privacy-note" data-testid="text-private-data-notice">
              <LockKeyhole size={15} strokeWidth={1.8} />
              <span>
                {isArabic
                  ? 'الملف يحتوي بيانات مدرسية خاصة. أضفه محليًا وبشكل خاص؛ لا تضعه في مستودع عام أو تشارك محتواه.'
                  : 'The extract contains private school data. Supply it privately; do not commit it to a public repository or share its contents.'}
              </span>
            </div>
          </div>
        </section>

        <footer className="footer">
          <span className="footer-end">
            <FolderOpen size={13} />
            {isArabic ? 'المصدر مستورد من GitHub' : 'GitHub source imported'}
          </span>
          <span className="footer-rule" />
          <span className="footer-end">
            <FileJson2 size={13} />
            <bdi dir="ltr">source/data/real.json</bdi>
          </span>
          <span className="footer-end">
            <ArrowDown size={12} />
            {isArabic ? 'لا توجد بيانات في هذه المعاينة' : 'No data in this preview'}
          </span>
        </footer>
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
