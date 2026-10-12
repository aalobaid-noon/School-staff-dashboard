// Noon-branded sign-in wall for the deployed app. One path in: the button is a plain navigation to
// /auth/login, which redirects to Citadel's authorize page and back through /oauth/callback. No
// third-party script, no XHR — failures come back as ?error=<code> on this page's URL.
// Styled by the theme.css tokens like every app component.

// The server only ever redirects here with one of these fixed codes; anything else (or a
// hand-edited query) gets the generic message.
const GENERIC_FAILURE = 'Sign-in failed. Please try again.';
const ERROR_MESSAGES: Record<string, string> = {
  not_staff: "This account isn't a Noon staff account.",
  state: 'Sign-in expired or was interrupted. Please try again.',
  failed: GENERIC_FAILURE,
};

function errorMessage(): string | null {
  const code = new URLSearchParams(window.location.search).get('error');
  if (!code) {
    return null;
  }
  return ERROR_MESSAGES[code] ?? GENERIC_FAILURE;
}

export function LoginScreen() {
  const error = errorMessage();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-gutter font-app">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-title font-semibold tracking-tight text-ink">noon</div>
          <h1 className="mt-4 text-lg font-medium text-ink">Sign in with Noon</h1>
          <p className="mt-1 text-body text-ink-muted">Use your Noon staff account to continue.</p>
        </div>

        <a
          href="/auth/login"
          className="flex min-h-[44px] w-full items-center justify-center rounded-control bg-primary px-4 text-body font-medium text-on-primary hover:bg-primary-strong"
        >
          Sign in with Noon
        </a>

        {/* Inline slot for the not_staff / expired-state / generic failure codes. */}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-control bg-danger-surface px-3 py-2 text-body text-danger"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
