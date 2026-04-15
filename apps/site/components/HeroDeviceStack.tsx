import Image from 'next/image';

interface PhoneProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  style?: React.CSSProperties;
  priority?: boolean;
}

function Phone({ src, alt, width, height, style, priority }: PhoneProps) {
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: 44,
        background: 'linear-gradient(160deg, #2a2a2a 0%, #161616 100%)',
        padding: 6,
        boxShadow: [
          'inset 0 0 0 1px rgba(255,255,255,0.09)',
          '0 0 0 1px rgba(0,0,0,0.5)',
          '0 8px 24px rgba(0,0,0,0.45)',
          '0 24px 56px rgba(0,0,0,0.35)',
          '0 48px 96px rgba(0,0,0,0.2)',
        ].join(', '),
        flexShrink: 0,
        ...style,
      }}
    >
      {/* Dynamic island */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '28%',
          height: 9,
          background: '#000',
          borderRadius: 9,
          zIndex: 10,
        }}
      />
      {/* Screen */}
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 38,
          overflow: 'hidden',
          position: 'relative',
          background: '#0a0a0a',
        }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          style={{ objectFit: 'cover', objectPosition: 'top center' }}
          sizes="(max-width: 860px) 160px, 185px"
        />
      </div>
    </div>
  );
}

export function HeroDeviceStack() {
  return (
    <div className="device-stack">
      {/* Warm maroon glow beneath phones */}
      <div className="device-stack__glow" />

      {/* Left phone – search */}
      <Phone
        src="/everybible/screenshots/search.png"
        alt="EveryBible Bible search"
        width={185}
        height={400}
        style={{
          transform: 'rotate(-6deg) translateY(20px)',
          zIndex: 1,
          marginRight: -22,
          opacity: 0.88,
        }}
      />

      {/* Center phone – home (front) */}
      <Phone
        src="/everybible/screenshots/home.png"
        alt="EveryBible home screen"
        width={185}
        height={400}
        priority
        style={{ zIndex: 3 }}
      />

      {/* Right phone – reading */}
      <Phone
        src="/everybible/screenshots/reading.png"
        alt="EveryBible Bible reading"
        width={185}
        height={400}
        style={{
          transform: 'rotate(6deg) translateY(20px)',
          zIndex: 1,
          marginLeft: -22,
          opacity: 0.88,
        }}
      />
    </div>
  );
}
