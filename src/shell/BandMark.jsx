// The VPG "V" in the right of a navy page band, like Home's banner (Luke,
// Oct 19: "have the logo in the top right corner … across the entire site").
// The band needs `relative isolate`; the mark sits behind its content and is
// clipped to the band without clipping the band's own pop-ups.
export const BAND_HOST = 'relative isolate';
export default function BandMark() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden rounded-[inherit] pointer-events-none" aria-hidden="true">
      <svg viewBox="0 0 600 781" className="absolute right-6 md:right-12 -top-6 h-[140%] min-h-[110px] opacity-[0.16]">
        <path d="M0 207 L118 0 L450 577 L332 781 Z" fill="#fff" />
        <path d="M312 199 H490 A105 105 0 0 1 581 356 L490 508 Z" fill="#ad9b7a" />
      </svg>
    </div>
  );
}
