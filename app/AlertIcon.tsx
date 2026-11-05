// SVG y no el carácter ⚠: cada fuente lo dibuja con un ancho distinto y en algunas sale estrecho
export default function AlertIcon() {
  return (
    <svg className="alert-icon" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.75 15 14.25H1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 6.2v3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}
