'use client';

export function AxonLabFloor() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 flex justify-center overflow-hidden"
      aria-hidden
    >
      {/* Semicircle holographic floor ring */}
      <div className="relative h-[280px] w-[min(920px,95%)]">
        <div
          className="absolute inset-x-[8%] bottom-0 h-[220px] rounded-[50%] border border-axon-blue/25 animate-pulse-glow"
          style={{
            transform: 'rotateX(72deg)',
            transformOrigin: 'center bottom',
            background:
              'radial-gradient(ellipse at 50% 100%, rgba(37,99,235,0.12) 0%, rgba(99,102,241,0.06) 45%, transparent 70%)',
            boxShadow: '0 0 60px rgba(37,99,235,0.15), inset 0 0 40px rgba(96,165,250,0.08)',
          }}
        />
        <div
          className="absolute inset-x-[18%] bottom-2 h-[180px] rounded-[50%] border border-axon-purple-glow/20 animate-arc-spin"
          style={{
            transformOrigin: 'center bottom',
            borderStyle: 'dashed',
          }}
        />
        <svg
          className="absolute inset-x-[12%] bottom-6 h-[160px] w-[76%] opacity-40"
          viewBox="0 0 400 120"
          fill="none"
          preserveAspectRatio="none"
        >
          <path
            d="M 20 110 Q 200 -20 380 110"
            stroke="url(#arcGrad)"
            strokeWidth="1.5"
            strokeDasharray="8 6"
            style={{ animation: 'arc-pulse 4s ease-in-out infinite' }}
          />
          <defs>
            <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0.6" />
            </linearGradient>
          </defs>
        </svg>
        {/* Vertical depth lines connecting arc to floor */}
        {[0.22, 0.38, 0.5, 0.62, 0.78].map((x) => (
          <div
            key={x}
            className="absolute bottom-0 h-16 w-px bg-gradient-to-t from-axon-blue-glow/40 to-transparent"
            style={{ left: `${x * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
