// Partner and accreditation logos shown below the Home hero, as a continuous marquee.
const logos = [
  { name: "QS Stars", src: "/assets/branding/qs-stars-logo.png" },
  { name: "ABET", src: "/assets/branding/abet-logo.png" },
  { name: "Institution's Innovation Council", src: "/assets/branding/iic-logo.png" },
  { name: "Sathyabama Institute of Science and Technology", src: "/assets/branding/sathyabama-banner-logo.png", wide: true },
  { name: "NAAC", src: "/assets/branding/naac-logo.jpg" },
  { name: "SnapServe AI", src: "/assets/branding/snapserve-logo.png" },
  { name: "NBA", src: "/assets/branding/nba-logo.jpg" },
  { name: "Space Zee Technologies", src: "/assets/branding/spacezee-logo.png", framed: true },
];

// Each group repeats the set so one group is always wider than the screen (no gap appears while scrolling).
const REPEATS = 3;

function LogoGroup({ hidden = false }) {
  const items = Array.from({ length: REPEATS }, (_, copy) => logos.map((logo) => ({ ...logo, copy }))).flat();
  return (
    <ul className="home-logo-group" aria-hidden={hidden || undefined}>
      {items.map(({ name, src, wide, framed, copy }) => (
        <li className={`home-logo-item${wide ? " is-wide" : ""}${framed ? " is-framed" : ""}`} key={`${copy}-${name}`}>
          <img src={src} alt={hidden || copy > 0 ? "" : name} loading="lazy" decoding="async" />
        </li>
      ))}
    </ul>
  );
}

export default function BrandingStrip() {
  return (
    <section className="home-logo-strip" aria-label="Accreditations and partners">
      <div className="home-logo-marquee">
        {/* The second copy makes the loop seamless; it is hidden from screen readers. */}
        <div className="home-logo-track">
          <LogoGroup />
          <LogoGroup hidden />
        </div>
      </div>
    </section>
  );
}
