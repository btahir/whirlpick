// The brand mark and wordmark link (brand/mark.svg drawn inline; night colours via tokens).
export function Mark({ size = 30 }: { size?: number }) {
  // The brand mark (brand/mark.svg); night variant swaps the rim and spokes via CSS variables.
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="27" cy="37" r="25" fill="var(--wp-rim)" />
      <path d="M27 37L27 17A20 20 0 0 1 47 37Z" fill="#F2A93B" />
      <path d="M27 37L47 37A20 20 0 0 1 27 57Z" fill="#17735D" />
      <path d="M27 37L27 57A20 20 0 0 1 7 37Z" fill="#F2B8A6" />
      <path d="M27 37L7 37A20 20 0 0 1 27 17Z" fill="#2A55A8" />
      <g stroke="var(--wp-sep)" strokeWidth="1.6">
        <line x1="27" y1="37" x2="47" y2="37" />
        <line x1="27" y1="37" x2="27" y2="57" />
        <line x1="27" y1="37" x2="7" y2="37" />
        <line x1="27" y1="37" x2="27" y2="17" />
      </g>
      <circle cx="27" cy="37" r="5.5" fill="var(--wp-hub)" stroke="var(--wp-rim)" strokeWidth="2.5" />
      <path transform="translate(51.5 12.5) rotate(135)" d="M22 0C16.5 -4.2 9 -10.5 1.5 -10.5C-4.8 -10.5 -8.5 -6 -8.5 0C-8.5 6 -4.8 10.5 1.5 10.5C9 10.5 16.5 4.2 22 0Z" fill="#C2361F" stroke="var(--wp-rim)" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="51.5" cy="12.5" r="2.6" fill="#C9A24A" />
    </svg>
  );
}

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Whirlpick home">
      <Mark />
      <span className="wordmark">Whirlpick</span>
    </a>
  );
}

