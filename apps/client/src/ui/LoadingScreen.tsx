type LoadingScreenProps = {
  stage: string;
  progress: number;
  error?: string | null;
  onRetry?: () => void;
};

export function LoadingScreen({ stage, progress, error, onRetry }: LoadingScreenProps) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-busy={!error}>
      <div className="loading-screen-stars" />
      <div className="loading-screen-vignette" />

      <div className="loading-screen-card">
        <div className="loading-screen-brand">
          <span className="loading-screen-logo">OF</span>
          <div>
            <h1>Orbital Frontier</h1>
            <p className="loading-screen-sub">Preparing Kerbin…</p>
          </div>
        </div>

        {error ? (
          <div className="loading-screen-error">
            <p>{error}</p>
            {onRetry && (
              <button type="button" className="primary" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="loading-bar-track" aria-hidden>
              <div className="loading-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="loading-bar-meta">
              <span className="loading-stage">{stage}</span>
              <span className="loading-pct">{pct}%</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
