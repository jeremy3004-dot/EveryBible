import Image from 'next/image';

export function VerseDeviceFrame() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(160deg, #f6f5f4 0%, #ede8e1 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Subtle warm radial glow behind the phone */}
      <div
        style={{
          position: 'absolute',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,0,0,0.03) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* Phone frame */}
      <div
        style={{
          position: 'relative',
          width: 180,
          height: 366,
          borderRadius: 44,
          background: 'linear-gradient(160deg, #2e2e2e 0%, #181818 100%)',
          padding: 10,
          boxShadow: [
            'inset 0 0 0 1px rgba(255,255,255,0.07)',
            '0 0 0 1px rgba(0,0,0,0.16)',
            'rgba(0,0,0,0.05) 0px 4px 18px',
            'rgba(0,0,0,0.03) 0px 8px 28px',
            'rgba(0,0,0,0.02) 0px 20px 56px',
            'rgba(0,0,0,0.01) 0px 40px 90px',
          ].join(', '),
          flexShrink: 0,
          transform: 'rotate(-2deg)',
        }}
      >
        {/* Dynamic island */}
        <div
          style={{
            position: 'absolute',
            top: 18,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '28%',
            height: 8,
            background: '#000',
            borderRadius: 8,
            zIndex: 10,
          }}
        />
        {/* Screen */}
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 35,
            overflow: 'hidden',
            position: 'relative',
            background: '#0a0a0a',
          }}
        >
          <Image
            src="/everybible/screenshots/home.png"
            alt="EveryBible app home screen"
            fill
            style={{ objectFit: 'cover', objectPosition: 'top center' }}
            sizes="200px"
          />
        </div>
      </div>
    </div>
  );
}
