interface BrandMarkProps {
  size?: number;
  variant?: 'light' | 'dark' | 'icon';
}

export function BrandMark({ size = 28, variant = 'light' }: BrandMarkProps) {
  const isDark = variant === 'dark';
  const showWordmark = variant !== 'icon';
  const ink = isDark ? '#F8F6EF' : '#24231F';

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {variant === 'icon' ? (
          <>
            <rect width="36" height="36" rx="9" fill="#24231F" />
            <path d="M8.5 26L14.5 10H18.5L12.5 26H8.5Z" fill="#E8B52E" />
            <path d="M12.5 10H16.2L22 26H18.3L12.5 10Z" fill="#F8F6EF" />
            <path d="M19 26L25 10H28.8L22.8 26H19Z" fill="#E8B52E" />
            <path d="M18.2 10H22L28 26H24.2L18.2 10Z" fill="#F8F6EF" fillOpacity="0.9" />
          </>
        ) : (
          <>
            <path d="M4 28L10.6 8H15L8.4 28H4Z" fill="#E8B52E" />
            <path d="M8.8 8H13L19 28H14.8L8.8 8Z" fill={ink} />
            <path d="M16.5 28L23.1 8H27.5L20.9 28H16.5Z" fill="#E8B52E" />
            <path d="M15.8 8H20L27 28H22.8L15.8 8Z" fill={ink} />
          </>
        )}
      </svg>
      {showWordmark && (
        <span
          className={`font-sans text-lg font-bold tracking-[0.06em] whitespace-nowrap ${
            isDark ? 'text-[#F8F6EF]' : 'text-[#24231F]'
          }`}
        >
          NEXORA
        </span>
      )}
    </span>
  );
}
