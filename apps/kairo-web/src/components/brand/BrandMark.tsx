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
  alt = "Kairo",
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/brand/kairo-icon.png"
        width={size}
        height={size}
        alt={alt}
        className="shrink-0 object-contain drop-shadow-sm"
        draggable={false}
      />
      {withWordmark ? <span className={wordmarkClassName}>Kairo</span> : null}
    </span>
  );
}
