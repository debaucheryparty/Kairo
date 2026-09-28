"use client";

type BrandMarkProps = {
  size?: number;
  className?: string;
  withWordmark?: boolean;
  wordmarkClassName?: string;
  alt?: string;
};

export function BrandMark({
  size = 28,
  className = "",
  withWordmark = false,
  wordmarkClassName = "font-semibold tracking-tight",
  alt = "ServerUI",
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/brand/serverui-icon.png"
        width={size}
        height={size}
        alt={alt}
        className="shrink-0 rounded-[22%] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
        draggable={false}
      />
      {withWordmark ? <span className={wordmarkClassName}>ServerUI</span> : null}
    </span>
  );
}
